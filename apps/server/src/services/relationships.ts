import { and, eq, isNull, sql } from 'drizzle-orm';
import { fans, purchases, relationshipEvents, relationships } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import type { EventBus } from '../events/bus.js';
import { requirePermission, workspaceOf, type Actor } from './context.js';
import { newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import {
  applyRelationshipEvent, decayScores, deriveStage, purchaseWeight,
  type RelationshipEventKind, type Scores, ZERO_SCORES,
} from '../domain/relationship.js';

export type RelationshipRow = typeof relationships.$inferSelect;

/**
 * Spec §21 — the relationship engine.
 *
 * Every score change goes through `apply`, which writes both the new scores and
 * the event that produced them. That pairing is the audit trail: a score can
 * always be explained by replaying its events.
 */
export class RelationshipService {
  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {}

  get(workspaceId: string, fanId: string, characterId: string | null = null): RelationshipRow {
    const existing = this.db
      .select().from(relationships)
      .where(and(
        eq(relationships.workspaceId, workspaceId),
        eq(relationships.fanId, fanId),
        characterId === null ? isNull(relationships.characterId) : eq(relationships.characterId, characterId),
      ))
      .get();
    if (existing) return existing;

    return this.db.insert(relationships).values({
      id: newId('relationship'),
      workspaceId, fanId, characterId,
      ...ZERO_SCORES,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    }).returning().get();
  }

  /** Spec §81 — every fan has a global relationship plus one per character. */
  forFan(workspaceId: string, fanId: string): RelationshipRow[] {
    return this.db.select().from(relationships)
      .where(and(eq(relationships.workspaceId, workspaceId), eq(relationships.fanId, fanId)))
      .all();
  }

  /**
   * Apply a relationship event. Writes the character-scoped relationship and
   * the global one, so a fan's overall standing reflects every character.
   */
  apply(input: {
    workspaceId: string;
    fanId: string;
    characterId?: string | null;
    kind: RelationshipEventKind;
    weight?: number;
    explicitDeltas?: Partial<Scores>;
    reason?: string;
    actor?: 'system' | 'user' | 'automation' | 'ai';
    sourceEventId?: string;
  }): RelationshipRow {
    const { workspaceId, fanId, characterId = null } = input;
    const scopes: Array<string | null> = characterId === null ? [null] : [characterId, null];
    let primary: RelationshipRow | null = null;

    for (const scope of scopes) {
      const current = this.get(workspaceId, fanId, scope);
      const result = applyRelationshipEvent({
        current: toScores(current),
        kind: input.kind,
        weight: input.weight,
        explicitDeltas: input.explicitDeltas,
      });

      const stageInput = this.stageInput(workspaceId, fanId, result.after);
      const stage = deriveStage(stageInput);
      const vip = stage === 'vip';

      const updated = this.db.update(relationships)
        .set({
          ...result.after,
          stage,
          vip,
          lastComputedAt: this.clock.now(),
          updatedAt: this.clock.now(),
          version: sql`${relationships.version} + 1`,
        })
        .where(eq(relationships.id, current.id))
        .returning()
        .get();

      this.db.insert(relationshipEvents).values({
        id: newId('relationshipEvent'),
        workspaceId,
        fanId,
        characterId: scope,
        kind: input.kind,
        weight: input.weight ?? 1,
        deltas: result.deltas as Record<string, number>,
        before: result.before as unknown as Record<string, number>,
        after: result.after as unknown as Record<string, number>,
        reason: input.reason ?? null,
        sourceEventId: input.sourceEventId ?? null,
        actor: input.actor ?? 'system',
        createdAt: this.clock.now(),
        updatedAt: this.clock.now(),
      }).run();

      const stageChanged = current.stage !== stage || current.vip !== vip;
      if (stageChanged || Object.keys(result.deltas).length > 0) {
        this.events.emit({
          workspaceId,
          type: 'relationship.changed',
          fanId,
          characterId: scope,
          entityType: 'relationship',
          entityId: current.id,
          actor: input.actor ?? 'system',
          payload: {
            kind: input.kind,
            deltas: result.deltas,
            stage,
            previousStage: current.stage,
            vip,
            vipChanged: current.vip !== vip,
          },
        });
      }

      if (scope === characterId) primary = updated;
      if (characterId === null) primary = updated;
    }

    return primary!;
  }

  /** Convenience wrappers used by the message and purchase pipelines. */
  onInboundMessage(workspaceId: string, fanId: string, characterId: string | null, sourceEventId?: string) {
    return this.apply({ workspaceId, fanId, characterId, kind: 'message_inbound', sourceEventId });
  }

  onOutboundMessage(workspaceId: string, fanId: string, characterId: string | null) {
    return this.apply({ workspaceId, fanId, characterId, kind: 'message_outbound' });
  }

  onPurchase(workspaceId: string, fanId: string, characterId: string | null, amountMinor: number, sourceEventId?: string) {
    return this.apply({
      workspaceId, fanId, characterId,
      kind: 'purchase',
      weight: purchaseWeight(amountMinor),
      reason: `Purchase of ${amountMinor} minor units`,
      sourceEventId,
    });
  }

  /** Spec §21 — manual adjustment, still recorded as an auditable event. */
  adjust(actor: Actor, fanId: string, characterId: string | null, deltas: Partial<Scores>, reason: string) {
    requirePermission(actor, 'crm:write');
    return this.apply({
      workspaceId: workspaceOf(actor),
      fanId, characterId,
      kind: 'manual_adjustment',
      explicitDeltas: deltas,
      reason,
      actor: actor.kind === 'user' ? 'user' : actor.kind,
    });
  }

  history(actor: Actor, fanId: string, limit = 100) {
    requirePermission(actor, 'crm:read');
    return this.db.select().from(relationshipEvents)
      .where(and(eq(relationshipEvents.workspaceId, workspaceOf(actor)), eq(relationshipEvents.fanId, fanId)))
      .orderBy(sql`${relationshipEvents.createdAt} DESC`)
      .limit(limit)
      .all();
  }

  /**
   * Spec §21 — decay. Run by the maintenance queue so a fan going quiet moves
   * to `dormant` without needing an incoming event to trigger it.
   */
  decayInactive(workspaceId: string, batchSize = 500): number {
    const now = this.clock.nowMs();
    const rows = this.db
      .select({ relationship: relationships, lastInteractionAt: fans.lastInteractionAt })
      .from(relationships)
      .innerJoin(fans, eq(fans.id, relationships.fanId))
      .where(and(eq(relationships.workspaceId, workspaceId), isNull(fans.deletedAt)))
      .limit(batchSize)
      .all();

    let updated = 0;
    for (const { relationship, lastInteractionAt } of rows) {
      if (!lastInteractionAt) continue;
      const days = Math.floor((now - lastInteractionAt.getTime()) / 86_400_000);
      if (days < 7) continue;

      const decayed = decayScores(toScores(relationship), days);
      const stage = deriveStage(this.stageInput(workspaceId, relationship.fanId, decayed, days));

      this.db.update(relationships)
        .set({ ...decayed, stage, vip: stage === 'vip', lastComputedAt: this.clock.now(), updatedAt: this.clock.now() })
        .where(eq(relationships.id, relationship.id))
        .run();
      updated++;
    }
    return updated;
  }

  private stageInput(workspaceId: string, fanId: string, scores: Scores, knownDays?: number) {
    const fan = this.db.select().from(fans)
      .where(and(eq(fans.workspaceId, workspaceId), eq(fans.id, fanId)))
      .get();

    const daysSince = knownDays ?? (fan?.lastInteractionAt
      ? Math.floor((this.clock.nowMs() - fan.lastInteractionAt.getTime()) / 86_400_000)
      : null);

    return {
      scores,
      purchaseCount: fan?.purchaseCount ?? 0,
      totalSpendMinor: fan?.totalSpendMinor ?? 0,
      messageCount: fan?.messageCount ?? 0,
      daysSinceLastInteraction: daysSince,
    };
  }
}

function toScores(row: RelationshipRow): Scores {
  return {
    trust: row.trust,
    loyalty: row.loyalty,
    engagement: row.engagement,
    purchasePropensity: row.purchasePropensity,
    churnRisk: row.churnRisk,
    responseLikelihood: row.responseLikelihood,
    interestScore: row.interestScore,
  };
}

/** Spec §18 — recompute the denormalised commercial counters on a fan. */
export function refreshFanCommercials(db: Db, workspaceId: string, fanId: string, clock: Clock): void {
  const totals = db
    .select({
      n: sql<number>`count(*)`,
      total: sql<number>`coalesce(sum(${purchases.amountMinor}), 0)`,
      last: sql<number | null>`max(${purchases.occurredAt})`,
    })
    .from(purchases)
    .where(and(
      eq(purchases.workspaceId, workspaceId),
      eq(purchases.fanId, fanId),
      eq(purchases.status, 'completed'),
      isNull(purchases.deletedAt),
    ))
    .get();

  db.update(fans)
    .set({
      purchaseCount: totals?.n ?? 0,
      totalSpendMinor: totals?.total ?? 0,
      lastPurchaseAt: totals?.last ? new Date(totals.last) : null,
      updatedAt: clock.now(),
    })
    .where(and(eq(fans.workspaceId, workspaceId), eq(fans.id, fanId)))
    .run();
}
