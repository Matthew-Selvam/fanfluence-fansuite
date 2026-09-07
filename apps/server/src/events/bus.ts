import { and, asc, eq, isNull, lte, or, sql } from 'drizzle-orm';
import { events as eventsTable } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import type { Logger } from '../core/logger.js';
import type { DomainEvent, EmitEvent } from '../domain/events.js';

export type EventHandler = (event: DomainEvent) => void | Promise<void>;

export interface Subscription {
  /** Exact type, or a `prefix.*` wildcard, or `*` for everything. */
  pattern: string;
  name: string;
  handler: EventHandler;
}

/**
 * Spec §25/§75 — the event bus.
 *
 * Events are written to the append-only `events` table first and dispatched
 * afterwards (a transactional outbox). That ordering is what makes a subscriber
 * survive a crash: an event that was persisted but not yet dispatched is picked
 * up again on the next drain rather than being lost.
 */
export class EventBus {
  private readonly subscriptions: Subscription[] = [];
  private readonly liveListeners = new Set<(e: DomainEvent) => void>();
  private draining = false;
  private drainQueued = false;

  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
    private readonly log: Logger,
  ) {}

  subscribe(pattern: string, name: string, handler: EventHandler): () => void {
    const sub: Subscription = { pattern, name, handler };
    this.subscriptions.push(sub);
    return () => {
      const i = this.subscriptions.indexOf(sub);
      if (i >= 0) this.subscriptions.splice(i, 1);
    };
  }

  /** Ephemeral tap used by the SSE endpoint. Never affects durability. */
  listen(fn: (e: DomainEvent) => void): () => void {
    this.liveListeners.add(fn);
    return () => this.liveListeners.delete(fn);
  }

  /**
   * Persist an event. Safe to call inside a transaction — dispatch is scheduled
   * for after the current tick, so handlers never observe uncommitted state.
   */
  emit(input: EmitEvent): DomainEvent {
    const event: DomainEvent = {
      ...input,
      id: input.id ?? newId('event'),
      timestamp: input.timestamp ?? this.clock.nowIso(),
      source: input.source ?? 'system',
      actor: input.actor ?? 'system',
      payload: input.payload ?? {},
    };

    this.db
      .insert(eventsTable)
      .values({
        id: event.id,
        workspaceId: event.workspaceId,
        type: event.type,
        timestamp: new Date(event.timestamp),
        characterId: event.characterId ?? null,
        fanId: event.fanId ?? null,
        entityType: event.entityType ?? null,
        entityId: event.entityId ?? null,
        source: event.source,
        actor: event.actor,
        actorId: event.actorId ?? null,
        payload: event.payload,
        dispatchedAt: null,
      })
      .run();

    this.scheduleDrain();
    return event;
  }

  private scheduleDrain(): void {
    if (this.draining) {
      this.drainQueued = true;
      return;
    }
    setImmediate(() => {
      void this.drain();
    });
  }

  /**
   * Dispatch every persisted-but-undispatched event, oldest first. A handler
   * that throws is logged and does not block the rest — the event is still
   * marked dispatched, because retrying every subscriber would re-deliver to
   * the ones that already succeeded.
   */
  async drain(limit = 500): Promise<number> {
    if (this.draining) {
      this.drainQueued = true;
      return 0;
    }
    this.draining = true;
    let dispatched = 0;

    try {
      for (;;) {
        const rows = this.db
          .select()
          .from(eventsTable)
          .where(isNull(eventsTable.dispatchedAt))
          .orderBy(asc(eventsTable.timestamp), asc(eventsTable.id))
          .limit(limit)
          .all();

        if (rows.length === 0) break;

        for (const row of rows) {
          const event: DomainEvent = {
            id: row.id,
            type: row.type,
            timestamp: row.timestamp.toISOString(),
            workspaceId: row.workspaceId,
            characterId: row.characterId,
            fanId: row.fanId,
            entityType: row.entityType,
            entityId: row.entityId,
            source: row.source,
            actor: row.actor,
            actorId: row.actorId,
            payload: (row.payload ?? {}) as Record<string, unknown>,
          };

          for (const sub of this.matching(event.type)) {
            try {
              await sub.handler(event);
            } catch (error) {
              this.log.error('event handler failed', {
                subscriber: sub.name,
                eventId: event.id,
                eventType: event.type,
                error,
              });
            }
          }

          for (const listener of this.liveListeners) {
            try {
              listener(event);
            } catch {
              // A live listener is a UI tap; its failure must not affect dispatch.
            }
          }

          this.db
            .update(eventsTable)
            .set({ dispatchedAt: this.clock.now() })
            .where(eq(eventsTable.id, event.id))
            .run();

          dispatched++;
        }

        if (rows.length < limit) break;
      }
    } finally {
      this.draining = false;
      if (this.drainQueued) {
        this.drainQueued = false;
        this.scheduleDrain();
      }
    }

    return dispatched;
  }

  private matching(type: string): Subscription[] {
    return this.subscriptions.filter((s) => matchesPattern(s.pattern, type));
  }

  /** Spec §89 — the universal timeline, read straight off the event log. */
  timeline(opts: {
    workspaceId: string;
    entityType?: string;
    entityId?: string;
    characterId?: string;
    fanId?: string;
    before?: Date;
    limit?: number;
  }) {
    const clauses = [eq(eventsTable.workspaceId, opts.workspaceId)];
    if (opts.entityType) clauses.push(eq(eventsTable.entityType, opts.entityType));
    if (opts.entityId) clauses.push(eq(eventsTable.entityId, opts.entityId));
    if (opts.characterId) clauses.push(eq(eventsTable.characterId, opts.characterId));
    if (opts.fanId) clauses.push(eq(eventsTable.fanId, opts.fanId));
    if (opts.before) clauses.push(lte(eventsTable.timestamp, opts.before));

    return this.db
      .select()
      .from(eventsTable)
      .where(and(...clauses))
      .orderBy(sql`${eventsTable.timestamp} DESC`)
      .limit(opts.limit ?? 100)
      .all();
  }
}

export function matchesPattern(pattern: string, type: string): boolean {
  if (pattern === '*') return true;
  if (pattern.endsWith('.*')) return type.startsWith(pattern.slice(0, -1));
  return pattern === type;
}

/** Convenience for `or(...)` clauses over an event-type list. */
export function anyType(types: string[]) {
  return or(...types.map((t) => eq(eventsTable.type, t)));
}
