import { and, asc, desc, eq, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { jobs as jobsTable } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import type { Clock } from '../core/clock.js';
import { newId } from '../core/ids.js';
import { conflict, notFound } from '../core/errors.js';
import {
  backoffMs,
  canTransitionJob,
  isTerminal,
  QUEUE_FOR_TYPE,
  type JobStatus,
  type JobType,
  type QueueName,
} from '../domain/jobs.js';

export type JobRow = typeof jobsTable.$inferSelect;

export interface EnqueueInput {
  workspaceId: string;
  type: JobType;
  payload: Record<string, unknown>;
  /** Spec §73 — a repeat enqueue with the same key returns the existing job. */
  idempotencyKey?: string;
  priority?: number;
  runAt?: Date;
  delayMs?: number;
  maxAttempts?: number;
  timeoutMs?: number;
  characterId?: string;
  campaignId?: string;
  providerId?: string;
  parentJobId?: string;
  createdByUserId?: string;
  automationRunId?: string;
}

/**
 * Spec §100/§101 — one durable queue table, claimed by lease.
 *
 * A worker takes a row by writing `lockedBy` + `lockedUntil` in a single
 * conditional UPDATE. If the process dies, the lease simply expires and the row
 * becomes claimable again, which is what makes "jobs survive restart" hold
 * without a separate recovery pass.
 */
export class JobQueue {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  enqueue(input: EnqueueInput): JobRow {
    if (input.idempotencyKey) {
      const existing = this.db
        .select()
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.workspaceId, input.workspaceId),
            eq(jobsTable.idempotencyKey, input.idempotencyKey),
          ),
        )
        .get();
      if (existing) return existing;
    }

    const now = this.clock.now();
    const runAt = input.runAt ?? new Date(now.getTime() + (input.delayMs ?? 0));

    const values: typeof jobsTable.$inferInsert = {
      id: newId('job'),
      workspaceId: input.workspaceId,
      queue: QUEUE_FOR_TYPE[input.type],
      type: input.type,
      status: 'queued',
      priority: input.priority ?? 0,
      payload: input.payload,
      idempotencyKey: input.idempotencyKey ?? null,
      runAt,
      maxAttempts: input.maxAttempts ?? 3,
      timeoutMs: input.timeoutMs ?? 300_000,
      characterId: input.characterId ?? null,
      campaignId: input.campaignId ?? null,
      providerId: input.providerId ?? null,
      parentJobId: input.parentJobId ?? null,
      createdByUserId: input.createdByUserId ?? null,
      automationRunId: input.automationRunId ?? null,
      createdAt: now,
      updatedAt: now,
    };

    try {
      return this.db.insert(jobsTable).values(values).returning().get();
    } catch (error) {
      // Lost a race on the idempotency unique index — return the winner.
      if (input.idempotencyKey && isUniqueViolation(error)) {
        const existing = this.db
          .select()
          .from(jobsTable)
          .where(
            and(
              eq(jobsTable.workspaceId, input.workspaceId),
              eq(jobsTable.idempotencyKey, input.idempotencyKey),
            ),
          )
          .get();
        if (existing) return existing;
      }
      throw error;
    }
  }

  /**
   * Claim up to `limit` due jobs for `workerId`. The UPDATE is guarded on the
   * row still being unclaimed, so two workers cannot take the same job.
   */
  claim(queue: QueueName, workerId: string, limit: number): JobRow[] {
    const now = this.clock.now();
    const claimed: JobRow[] = [];

    for (let i = 0; i < limit; i++) {
      const candidate = this.db
        .select({ id: jobsTable.id, timeoutMs: jobsTable.timeoutMs })
        .from(jobsTable)
        .where(
          and(
            eq(jobsTable.queue, queue),
            inArray(jobsTable.status, ['queued', 'submitted']),
            lte(jobsTable.runAt, now),
            or(isNull(jobsTable.lockedUntil), lte(jobsTable.lockedUntil, now)),
          ),
        )
        .orderBy(desc(jobsTable.priority), asc(jobsTable.runAt))
        .limit(1)
        .get();

      if (!candidate) break;

      const lockedUntil = new Date(now.getTime() + candidate.timeoutMs + 30_000);
      const row = this.db
        .update(jobsTable)
        .set({
          status: 'running',
          lockedBy: workerId,
          lockedUntil,
          startedAt: now,
          updatedAt: now,
          attempts: sql`${jobsTable.attempts} + 1`,
          version: sql`${jobsTable.version} + 1`,
        })
        .where(
          and(
            eq(jobsTable.id, candidate.id),
            or(isNull(jobsTable.lockedUntil), lte(jobsTable.lockedUntil, now)),
          ),
        )
        .returning()
        .get();

      if (row) claimed.push(row);
    }

    return claimed;
  }

  /** Extend the lease on a long-running job so it is not re-claimed mid-flight. */
  heartbeat(jobId: string, workerId: string, extraMs = 60_000): void {
    this.db
      .update(jobsTable)
      .set({ lockedUntil: new Date(this.clock.nowMs() + extraMs), updatedAt: this.clock.now() })
      .where(and(eq(jobsTable.id, jobId), eq(jobsTable.lockedBy, workerId)))
      .run();
  }

  progress(jobId: string, progress: number, label?: string): void {
    this.db
      .update(jobsTable)
      .set({
        progress: Math.max(0, Math.min(1, progress)),
        progressLabel: label ?? null,
        updatedAt: this.clock.now(),
      })
      .where(eq(jobsTable.id, jobId))
      .run();
  }

  complete(jobId: string, result: Record<string, unknown>): JobRow {
    return this.transition(jobId, 'completed', {
      result,
      completedAt: this.clock.now(),
      progress: 1,
      lockedBy: null,
      lockedUntil: null,
      error: null,
      errorCode: null,
    });
  }

  /**
   * Spec §41 — a submitted job whose response was lost is parked in `submitted`
   * with the provider's own id, to be reconciled by polling. It is never
   * resubmitted, because a lost response can still be a billed request.
   */
  markSubmitted(jobId: string, externalRef: string, pollDelayMs = 5_000): JobRow {
    return this.transition(jobId, 'submitted', {
      runAt: new Date(this.clock.nowMs() + pollDelayMs),
      lockedBy: null,
      lockedUntil: null,
      result: { externalRef },
    });
  }

  /**
   * Record a failure. Retries only when attempts remain *and* the failure was
   * classified retryable; otherwise the job is dead-lettered so it stays
   * visible in the job centre instead of vanishing.
   */
  fail(jobId: string, error: { message: string; code?: string; retryable: boolean }): JobRow {
    const job = this.get(jobId);
    const canRetry = error.retryable && job.attempts < job.maxAttempts;

    if (canRetry) {
      return this.transition(jobId, 'queued', {
        runAt: new Date(this.clock.nowMs() + backoffMs(job.attempts)),
        error: error.message,
        errorCode: error.code ?? null,
        lockedBy: null,
        lockedUntil: null,
      });
    }

    return this.transition(jobId, 'failed', {
      error: error.message,
      errorCode: error.code ?? null,
      completedAt: this.clock.now(),
      deadLetteredAt: this.clock.now(),
      lockedBy: null,
      lockedUntil: null,
    });
  }

  cancel(jobId: string): JobRow {
    return this.transition(jobId, 'cancelled', {
      completedAt: this.clock.now(),
      lockedBy: null,
      lockedUntil: null,
    });
  }

  /** Re-queue a failed or dead-lettered job, resetting its attempt budget. */
  retry(jobId: string): JobRow {
    const job = this.get(jobId);
    if (!isTerminal(job.status) && job.status !== 'unknown') {
      throw conflict(`Job ${jobId} is ${job.status} and is not awaiting retry`);
    }
    return this.db
      .update(jobsTable)
      .set({
        status: 'queued',
        attempts: 0,
        error: null,
        errorCode: null,
        deadLetteredAt: null,
        completedAt: null,
        runAt: this.clock.now(),
        lockedBy: null,
        lockedUntil: null,
        updatedAt: this.clock.now(),
        version: sql`${jobsTable.version} + 1`,
      })
      .where(eq(jobsTable.id, jobId))
      .returning()
      .get();
  }

  private transition(
    jobId: string,
    to: JobStatus,
    patch: Partial<typeof jobsTable.$inferInsert>,
  ): JobRow {
    const job = this.get(jobId);
    if (!canTransitionJob(job.status, to)) {
      throw conflict(`Job ${jobId} cannot move from ${job.status} to ${to}`);
    }
    return this.db
      .update(jobsTable)
      .set({ ...patch, status: to, updatedAt: this.clock.now(), version: sql`${jobsTable.version} + 1` })
      .where(eq(jobsTable.id, jobId))
      .returning()
      .get();
  }

  get(jobId: string): JobRow {
    const row = this.db.select().from(jobsTable).where(eq(jobsTable.id, jobId)).get();
    if (!row) throw notFound('job', jobId);
    return row;
  }

  /** Spec §44 — the job centre listing. */
  list(opts: {
    workspaceId: string;
    queue?: QueueName;
    status?: JobStatus[];
    characterId?: string;
    limit?: number;
  }): JobRow[] {
    const clauses = [eq(jobsTable.workspaceId, opts.workspaceId)];
    if (opts.queue) clauses.push(eq(jobsTable.queue, opts.queue));
    if (opts.status?.length) clauses.push(inArray(jobsTable.status, opts.status));
    if (opts.characterId) clauses.push(eq(jobsTable.characterId, opts.characterId));

    return this.db
      .select()
      .from(jobsTable)
      .where(and(...clauses))
      .orderBy(desc(jobsTable.createdAt))
      .limit(opts.limit ?? 100)
      .all();
  }

  /** Queue depth per status — the numbers on the system health cards (§90). */
  stats(workspaceId: string): Record<string, number> {
    const rows = this.db
      .select({ status: jobsTable.status, n: sql<number>`count(*)` })
      .from(jobsTable)
      .where(eq(jobsTable.workspaceId, workspaceId))
      .groupBy(jobsTable.status)
      .all();
    return Object.fromEntries(rows.map((r) => [r.status, r.n]));
  }

  /**
   * Release leases held by workers that died. Called at boot: any job left
   * `running` with an expired lease is put back on the queue.
   */
  reclaimExpired(): number {
    const now = this.clock.now();
    const rows = this.db
      .update(jobsTable)
      .set({ status: 'queued', lockedBy: null, lockedUntil: null, updatedAt: now })
      .where(and(eq(jobsTable.status, 'running'), lte(jobsTable.lockedUntil, now)))
      .returning({ id: jobsTable.id })
      .all();
    return rows.length;
  }
}

function isUniqueViolation(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    String((error as { code: unknown }).code).includes('SQLITE_CONSTRAINT')
  );
}
