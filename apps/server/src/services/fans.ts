import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { fanNotes, fanTags, fans, relationships } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';
import type { EventBus } from '../events/bus.js';
import type { AuditLog } from './audit.js';
import { requirePermission, workspaceOf, type Actor } from './context.js';
import { newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import { ZERO_SCORES } from '../domain/relationship.js';

export const CreateFanInput = z.object({
  name: z.string().max(200).optional(),
  username: z.string().max(200).optional(),
  platform: z.string().max(100).default('direct'),
  externalId: z.string().max(300).optional(),
  avatarUrl: z.string().max(2000).optional(),
  locale: z.string().max(20).optional(),
  timezone: z.string().max(100).optional(),
  language: z.string().max(20).optional(),
  interests: z.array(z.string()).optional(),
  favoriteTopics: z.array(z.string()).optional(),
  preferences: z.record(z.string(), z.unknown()).optional(),
  notes: z.string().max(20_000).optional(),
});
export type CreateFanInput = z.infer<typeof CreateFanInput>;

/** Spec §18 — the fan is a first-class CRM entity, usable with no AI at all. */
export class FanService {
  private readonly repo: Repository<typeof fans>;

  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {
    this.repo = new Repository(db, fans, 'fan');
  }

  list(actor: Actor, opts: { limit?: number; cursor?: string; platform?: string } = {}) {
    requirePermission(actor, 'crm:read');
    return this.repo.list(workspaceOf(actor), {
      limit: opts.limit,
      cursor: opts.cursor,
      where: opts.platform ? eq(fans.platform, opts.platform) : undefined,
      orderBy: fans.lastInteractionAt,
    });
  }

  get(actor: Actor, id: string) {
    requirePermission(actor, 'crm:read');
    const workspaceId = workspaceOf(actor);
    const fan = this.repo.get(workspaceId, id);
    return {
      ...fan,
      tags: this.tags(workspaceId, id),
      relationships: this.db.select().from(relationships)
        .where(and(eq(relationships.workspaceId, workspaceId), eq(relationships.fanId, id)))
        .all(),
    };
  }

  create(actor: Actor, input: CreateFanInput) {
    requirePermission(actor, 'crm:write');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.insert({
      id: newId('fan'),
      workspaceId,
      name: input.name ?? null,
      username: input.username ?? null,
      platform: input.platform,
      externalId: input.externalId ?? null,
      avatarUrl: input.avatarUrl ?? null,
      locale: input.locale ?? null,
      timezone: input.timezone ?? null,
      language: input.language ?? null,
      interests: input.interests ?? null,
      favoriteTopics: input.favoriteTopics ?? null,
      preferences: input.preferences ?? null,
      notes: input.notes ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });

    // Every fan gets a global relationship row immediately, so scores are
    // readable without a null check anywhere downstream.
    this.ensureRelationship(workspaceId, row.id, null);

    this.events.emit({
      workspaceId, type: 'fan.created', fanId: row.id,
      entityType: 'fan', entityId: row.id,
      actor: actor.kind, actorId: actor.principal.userId, source: input.platform,
      payload: { platform: row.platform },
    });
    return row;
  }

  /**
   * Find by platform identity, creating on first sight. This is the entry point
   * for inbound messages and imports, and it is idempotent per (platform, externalId).
   */
  findOrCreate(actor: Actor, input: CreateFanInput & { externalId: string }) {
    const workspaceId = workspaceOf(actor);
    const existing = this.db
      .select().from(fans)
      .where(and(
        eq(fans.workspaceId, workspaceId),
        eq(fans.platform, input.platform),
        eq(fans.externalId, input.externalId),
        isNull(fans.deletedAt),
      ))
      .get();
    return existing ?? this.create(actor, input);
  }

  update(actor: Actor, id: string, patch: Partial<CreateFanInput> & { blocked?: boolean; expectedVersion?: number }) {
    requirePermission(actor, 'crm:write');
    const workspaceId = workspaceOf(actor);
    const { expectedVersion, ...rest } = patch;
    const row = this.repo.update(workspaceId, id, rest as never, expectedVersion);
    this.audit.record({
      workspaceId, action: 'fan.updated', entityType: 'fan', entityId: id,
      userId: actor.principal.userId, actor: actor.kind, after: rest,
    });
    this.events.emit({
      workspaceId, type: 'fan.updated', fanId: id, entityType: 'fan', entityId: id,
      actor: actor.kind, actorId: actor.principal.userId,
      payload: { changed: Object.keys(rest) },
    });
    return row;
  }

  delete(actor: Actor, id: string) {
    requirePermission(actor, 'crm:delete');
    return this.repo.softDelete(workspaceOf(actor), id);
  }

  // ── Tags ──────────────────────────────────────────────────────────────────

  tags(workspaceId: string, fanId: string): string[] {
    return this.db
      .select({ tag: fanTags.tag })
      .from(fanTags)
      .where(and(eq(fanTags.workspaceId, workspaceId), eq(fanTags.fanId, fanId), isNull(fanTags.deletedAt)))
      .all()
      .map((r) => r.tag);
  }

  addTag(actor: Actor, fanId: string, tag: string, source: 'manual' | 'automation' | 'import' | 'ai' = 'manual', sourceId?: string) {
    requirePermission(actor, 'crm:write');
    const workspaceId = workspaceOf(actor);
    const normalised = tag.trim().toLowerCase();
    if (!normalised) return null;

    const existing = this.db
      .select().from(fanTags)
      .where(and(eq(fanTags.fanId, fanId), eq(fanTags.tag, normalised)))
      .get();
    if (existing) return existing;

    const row = this.db.insert(fanTags).values({
      id: newId('fanTag'),
      workspaceId,
      fanId,
      tag: normalised,
      source,
      sourceId: sourceId ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    }).returning().get();

    this.events.emit({
      workspaceId, type: 'fan.tagged', fanId, entityType: 'fan', entityId: fanId,
      actor: actor.kind, actorId: actor.principal.userId, payload: { tag: normalised, source },
    });
    return row;
  }

  removeTag(actor: Actor, fanId: string, tag: string) {
    requirePermission(actor, 'crm:write');
    const workspaceId = workspaceOf(actor);
    this.db.delete(fanTags)
      .where(and(eq(fanTags.workspaceId, workspaceId), eq(fanTags.fanId, fanId), eq(fanTags.tag, tag.trim().toLowerCase())))
      .run();
    this.events.emit({
      workspaceId, type: 'fan.untagged', fanId, entityType: 'fan', entityId: fanId,
      actor: actor.kind, actorId: actor.principal.userId, payload: { tag },
    });
  }

  // ── Notes ─────────────────────────────────────────────────────────────────

  notes(actor: Actor, fanId: string) {
    requirePermission(actor, 'crm:read');
    return this.db.select().from(fanNotes)
      .where(and(eq(fanNotes.workspaceId, workspaceOf(actor)), eq(fanNotes.fanId, fanId), isNull(fanNotes.deletedAt)))
      .orderBy(sql`${fanNotes.pinned} DESC, ${fanNotes.createdAt} DESC`)
      .all();
  }

  addNote(actor: Actor, fanId: string, body: string, pinned = false) {
    requirePermission(actor, 'crm:write');
    return this.db.insert(fanNotes).values({
      id: newId('fanNote'),
      workspaceId: workspaceOf(actor),
      fanId,
      authorUserId: actor.principal.userId,
      body,
      pinned,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    }).returning().get();
  }

  // ── Interaction bookkeeping ───────────────────────────────────────────────

  /** Counters the segment engine and relationship engine both read from. */
  recordInteraction(workspaceId: string, fanId: string, kind: 'message' | 'other'): void {
    this.db.update(fans)
      .set({
        lastInteractionAt: this.clock.now(),
        firstInteractionAt: sql`coalesce(${fans.firstInteractionAt}, ${this.clock.nowMs()})`,
        interactionCount: sql`${fans.interactionCount} + 1`,
        ...(kind === 'message' ? { messageCount: sql`${fans.messageCount} + 1` } : {}),
        updatedAt: this.clock.now(),
      })
      .where(and(eq(fans.workspaceId, workspaceId), eq(fans.id, fanId)))
      .run();
  }

  ensureRelationship(workspaceId: string, fanId: string, characterId: string | null) {
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
      workspaceId,
      fanId,
      characterId,
      ...ZERO_SCORES,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    }).returning().get();
  }
}
