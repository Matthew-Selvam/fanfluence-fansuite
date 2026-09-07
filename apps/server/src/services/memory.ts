import { and, desc, eq, isNull, or, sql } from 'drizzle-orm';
import { z } from 'zod';
import { memories } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';
import type { EventBus } from '../events/bus.js';
import { requirePermission, workspaceOf, type Actor } from './context.js';
import { newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import { MemoryKind } from '../domain/crm.js';
import { cosineSimilarity } from '../domain/characterHealth.js';

export const CreateMemoryInput = z.object({
  fanId: z.string(),
  characterId: z.string().nullable().optional(),
  kind: MemoryKind,
  key: z.string().max(200).optional(),
  content: z.string().min(1).max(4000),
  confidence: z.number().min(0).max(1).default(0.5),
  source: z.enum(['manual', 'ai', 'automation', 'import', 'derived']).default('manual'),
  sourceMessageId: z.string().optional(),
  pinned: z.boolean().default(false),
  expiresAt: z.coerce.date().optional(),
});
export type CreateMemoryInput = z.infer<typeof CreateMemoryInput>;

export interface RetrievalOptions {
  limit?: number;
  /** Optional query embedding. Absent means keyword + recency only (§109). */
  queryEmbedding?: number[];
  queryText?: string;
  kinds?: Array<z.infer<typeof MemoryKind>>;
}

/**
 * Spec §20 — memory as a structured subsystem.
 *
 * Retrieval degrades cleanly: with an embedding provider it ranks semantically,
 * and without one it falls back to pinned + keyword + recency. Vector search is
 * an enhancement, never a requirement (§109).
 */
export class MemoryService {
  private readonly repo: Repository<typeof memories>;

  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {
    this.repo = new Repository(db, memories, 'memory');
  }

  list(actor: Actor, fanId: string, characterId?: string | null) {
    requirePermission(actor, 'crm:read');
    const workspaceId = workspaceOf(actor);
    const clauses = [eq(memories.fanId, fanId)];
    if (characterId !== undefined) {
      // Character-scoped reads still include the global (null-scoped) memories.
      clauses.push(
        characterId === null
          ? isNull(memories.characterId)
          : (or(eq(memories.characterId, characterId), isNull(memories.characterId)) as never),
      );
    }
    return this.repo.all(workspaceId, and(...clauses));
  }

  create(actor: Actor, input: CreateMemoryInput) {
    requirePermission(actor, 'crm:write');
    const workspaceId = workspaceOf(actor);

    // A repeated fact updates confidence rather than accumulating duplicates.
    if (input.key) {
      const existing = this.db.select().from(memories)
        .where(and(
          eq(memories.workspaceId, workspaceId),
          eq(memories.fanId, input.fanId),
          eq(memories.key, input.key),
          input.characterId ? eq(memories.characterId, input.characterId) : isNull(memories.characterId),
          isNull(memories.deletedAt),
        ))
        .get();

      if (existing) {
        return this.repo.update(workspaceId, existing.id, {
          content: input.content,
          confidence: Math.min(1, existing.confidence + 0.15),
          sourceMessageId: input.sourceMessageId ?? existing.sourceMessageId,
        });
      }
    }

    const row = this.repo.insert({
      id: newId('memory'),
      workspaceId,
      fanId: input.fanId,
      characterId: input.characterId ?? null,
      kind: input.kind,
      key: input.key ?? null,
      content: input.content,
      confidence: input.confidence,
      source: input.source,
      sourceMessageId: input.sourceMessageId ?? null,
      pinned: input.pinned,
      expiresAt: input.expiresAt ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });

    this.events.emit({
      workspaceId, type: 'memory.created', fanId: input.fanId, characterId: input.characterId ?? null,
      entityType: 'memory', entityId: row.id,
      actor: actor.kind, actorId: actor.principal.userId,
      payload: { kind: input.kind, source: input.source },
    });
    return row;
  }

  update(actor: Actor, id: string, patch: { content?: string; confidence?: number; pinned?: boolean; kind?: z.infer<typeof MemoryKind> }) {
    requirePermission(actor, 'crm:write');
    return this.repo.update(workspaceOf(actor), id, patch as never);
  }

  /** Spec §20 — suppressed memories stay visible to the operator but never enter a prompt. */
  suppress(actor: Actor, id: string, suppressed = true) {
    requirePermission(actor, 'crm:write');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.update(workspaceId, id, { suppressed });
    this.events.emit({
      workspaceId, type: 'memory.suppressed', fanId: row.fanId, characterId: row.characterId,
      entityType: 'memory', entityId: id,
      actor: actor.kind, actorId: actor.principal.userId, payload: { suppressed },
    });
    return row;
  }

  pin(actor: Actor, id: string, pinned = true) {
    requirePermission(actor, 'crm:write');
    return this.repo.update(workspaceOf(actor), id, { pinned });
  }

  /** Merge `sourceIds` into `targetId`, keeping the target's text and the highest confidence. */
  merge(actor: Actor, targetId: string, sourceIds: string[]) {
    requirePermission(actor, 'crm:write');
    const workspaceId = workspaceOf(actor);
    const target = this.repo.get(workspaceId, targetId);
    let confidence = target.confidence;

    for (const sourceId of sourceIds) {
      if (sourceId === targetId) continue;
      const source = this.repo.find(workspaceId, sourceId);
      if (!source) continue;
      confidence = Math.max(confidence, source.confidence);
      this.repo.update(workspaceId, sourceId, { mergedIntoId: targetId, deletedAt: this.clock.now() });
    }

    return this.repo.update(workspaceId, targetId, { confidence: Math.min(1, confidence + 0.1) });
  }

  delete(actor: Actor, id: string) {
    requirePermission(actor, 'crm:write');
    return this.repo.softDelete(workspaceOf(actor), id);
  }

  setEmbedding(workspaceId: string, id: string, embedding: number[], model: string): void {
    this.db.update(memories)
      .set({ embedding, embeddingModel: model, updatedAt: this.clock.now() })
      .where(and(eq(memories.workspaceId, workspaceId), eq(memories.id, id)))
      .run();
  }

  /**
   * Spec §82/§109 — assemble the memory slice that goes into a prompt.
   *
   * Pinned memories always win, then semantic similarity when embeddings exist,
   * then keyword overlap, then recency. Suppressed and expired rows are excluded
   * before ranking, so they can never reach a provider.
   */
  retrieve(
    workspaceId: string,
    fanId: string,
    characterId: string | null,
    options: RetrievalOptions = {},
  ): Array<{ kind: string; content: string; confidence: number; id: string }> {
    const limit = options.limit ?? 12;
    const now = this.clock.now();

    const rows = this.db
      .select().from(memories)
      .where(and(
        eq(memories.workspaceId, workspaceId),
        eq(memories.fanId, fanId),
        eq(memories.suppressed, false),
        isNull(memories.deletedAt),
        isNull(memories.mergedIntoId),
        characterId
          ? (or(eq(memories.characterId, characterId), isNull(memories.characterId)) as never)
          : isNull(memories.characterId),
        or(isNull(memories.expiresAt), sql`${memories.expiresAt} > ${now.getTime()}`) as never,
      ))
      .orderBy(desc(memories.pinned), desc(memories.updatedAt))
      .limit(500)
      .all();

    const keywords = tokenise(options.queryText ?? '');

    const scored = rows.map((row) => {
      let score = row.pinned ? 1_000 : 0;
      score += row.confidence * 10;

      if (options.queryEmbedding && row.embedding) {
        const similarity = cosineSimilarity(options.queryEmbedding, row.embedding);
        if (similarity !== null) score += similarity * 100;
      } else if (keywords.length > 0) {
        const content = tokenise(row.content);
        const overlap = keywords.filter((k) => content.includes(k)).length;
        score += (overlap / keywords.length) * 50;
      }

      // Mild recency preference so stale facts drift below fresh ones.
      const ageDays = (now.getTime() - row.updatedAt.getTime()) / 86_400_000;
      score += Math.max(0, 20 - ageDays * 0.5);

      return { row, score };
    });

    const selected = scored
      .filter((s) => !options.kinds || options.kinds.includes(s.row.kind))
      .sort((a, b) => b.score - a.score)
      .slice(0, limit);

    // Retrieval is a usage signal; it drives the retention job's decisions.
    for (const { row } of selected) {
      this.db.update(memories).set({ lastUsedAt: now }).where(eq(memories.id, row.id)).run();
    }

    return selected.map(({ row }) => ({
      id: row.id,
      kind: row.kind,
      content: row.content,
      confidence: row.confidence,
    }));
  }

  /** Spec §107 — retention. Expired, low-confidence, unused memories are pruned. */
  prune(workspaceId: string, olderThan: Date, minConfidence = 0.3): number {
    const rows = this.db
      .update(memories)
      .set({ deletedAt: this.clock.now() })
      .where(and(
        eq(memories.workspaceId, workspaceId),
        eq(memories.pinned, false),
        isNull(memories.deletedAt),
        or(
          sql`${memories.expiresAt} IS NOT NULL AND ${memories.expiresAt} < ${this.clock.nowMs()}`,
          sql`${memories.confidence} < ${minConfidence} AND ${memories.updatedAt} < ${olderThan.getTime()}`,
        ) as never,
      ))
      .returning({ id: memories.id })
      .all();
    return rows.length;
  }
}

const STOPWORDS = new Set(['the', 'a', 'an', 'is', 'are', 'was', 'to', 'of', 'in', 'and', 'or', 'my', 'i', 'you']);

function tokenise(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((t) => t.length > 2 && !STOPWORDS.has(t));
}
