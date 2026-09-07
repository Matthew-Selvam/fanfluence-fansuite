import { and, desc, eq, lte } from 'drizzle-orm';
import { auditLogs } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import type { Clock } from '../core/clock.js';
import { newId } from '../core/ids.js';

/**
 * Spec §57 — every consequential action leaves a before/after record.
 *
 * The `before`/`after` snapshots are redacted of secret-shaped keys before
 * storage, so an audit trail can never become a credential leak.
 */
export interface AuditEntry {
  workspaceId: string;
  action: string;
  entityType: string;
  entityId?: string | null;
  userId?: string | null;
  actor?: 'user' | 'system' | 'automation' | 'ai';
  deviceId?: string | null;
  source?: string | null;
  automationRunId?: string | null;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

const SECRET_KEY_RE = /(api[-_]?key|secret|token|password|credential|authorization|ciphertext|auth_?tag)/i;

export class AuditLog {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  record(entry: AuditEntry): void {
    this.db
      .insert(auditLogs)
      .values({
        id: newId('auditLog'),
        workspaceId: entry.workspaceId,
        timestamp: this.clock.now(),
        action: entry.action,
        entityType: entry.entityType,
        entityId: entry.entityId ?? null,
        userId: entry.userId ?? null,
        actor: entry.actor ?? 'user',
        deviceId: entry.deviceId ?? null,
        source: entry.source ?? null,
        automationRunId: entry.automationRunId ?? null,
        before: scrub(entry.before),
        after: scrub(entry.after),
        ip: entry.ip ?? null,
      })
      .run();
  }

  list(opts: {
    workspaceId: string;
    entityType?: string;
    entityId?: string;
    before?: Date;
    limit?: number;
  }) {
    const clauses = [eq(auditLogs.workspaceId, opts.workspaceId)];
    if (opts.entityType) clauses.push(eq(auditLogs.entityType, opts.entityType));
    if (opts.entityId) clauses.push(eq(auditLogs.entityId, opts.entityId));
    if (opts.before) clauses.push(lte(auditLogs.timestamp, opts.before));

    return this.db
      .select()
      .from(auditLogs)
      .where(and(...clauses))
      .orderBy(desc(auditLogs.timestamp))
      .limit(opts.limit ?? 100)
      .all();
  }

  /** Spec §107 — retention. Audit trimming is deliberate and reported. */
  prune(workspaceId: string, olderThan: Date): number {
    const rows = this.db
      .delete(auditLogs)
      .where(and(eq(auditLogs.workspaceId, workspaceId), lte(auditLogs.timestamp, olderThan)))
      .returning({ id: auditLogs.id })
      .all();
    return rows.length;
  }
}

/** Compute a minimal diff so audit rows do not store whole entities verbatim. */
export function diff(
  before: Record<string, unknown> | null | undefined,
  after: Record<string, unknown> | null | undefined,
): { before: Record<string, unknown>; after: Record<string, unknown> } {
  const b = before ?? {};
  const a = after ?? {};
  const changedBefore: Record<string, unknown> = {};
  const changedAfter: Record<string, unknown> = {};

  for (const key of new Set([...Object.keys(b), ...Object.keys(a)])) {
    if (JSON.stringify(b[key]) !== JSON.stringify(a[key])) {
      changedBefore[key] = b[key];
      changedAfter[key] = a[key];
    }
  }
  return { before: changedBefore, after: changedAfter };
}

function scrub(value: unknown, depth = 0): unknown {
  if (depth > 6 || value === null || value === undefined) return value ?? null;
  if (Array.isArray(value)) return value.map((v) => scrub(v, depth + 1));
  if (typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) =>
        SECRET_KEY_RE.test(k) ? [k, '[redacted]'] : [k, scrub(v, depth + 1)],
      ),
    );
  }
  return value;
}
