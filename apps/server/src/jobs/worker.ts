import { randomUUID } from 'node:crypto';
import type { Logger } from '../core/logger.js';
import { toAppError } from '../core/errors.js';
import type { JobType, QueueName } from '../domain/jobs.js';
import type { JobQueue, JobRow } from './queue.js';

export interface JobContext {
  job: JobRow;
  workspaceId: string;
  log: Logger;
  /** Extend the lease during long provider calls. */
  heartbeat(extraMs?: number): void;
  progress(fraction: number, label?: string): void;
  /** Park the job awaiting a provider result rather than completing it (§41). */
  awaitExternal(externalRef: string, pollDelayMs?: number): void;
  signal: AbortSignal;
}

export type JobHandler = (ctx: JobContext) => Promise<Record<string, unknown> | void>;

/** Sentinel thrown by `awaitExternal` so the runner knows not to complete. */
const PARKED = Symbol('parked');

/**
 * Spec §101 — workers are stateless. All state lives in the job row, so a
 * worker can be killed at any point and another picks the job up when the
 * lease expires.
 */
export class WorkerPool {
  private readonly handlers = new Map<JobType, JobHandler>();
  private readonly timers = new Map<QueueName, NodeJS.Timeout>();
  private readonly inFlight = new Set<Promise<void>>();
  private running = false;
  readonly id = `worker_${randomUUID().slice(0, 8)}`;

  constructor(
    private readonly queue: JobQueue,
    private readonly log: Logger,
    private readonly options: {
      queues: QueueName[];
      concurrency: number;
      pollIntervalMs?: number;
    },
  ) {}

  register(type: JobType, handler: JobHandler): this {
    this.handlers.set(type, handler);
    return this;
  }

  registered(): JobType[] {
    return [...this.handlers.keys()];
  }

  start(): void {
    if (this.running) return;
    this.running = true;

    const reclaimed = this.queue.reclaimExpired();
    if (reclaimed > 0) this.log.warn('reclaimed expired job leases', { count: reclaimed });

    const interval = this.options.pollIntervalMs ?? 1_000;
    for (const queue of this.options.queues) {
      const timer = setInterval(() => {
        void this.tick(queue);
      }, interval);
      timer.unref();
      this.timers.set(queue, timer);
    }
    this.log.info('worker pool started', {
      workerId: this.id,
      queues: this.options.queues,
      concurrency: this.options.concurrency,
    });
  }

  async stop(): Promise<void> {
    this.running = false;
    for (const timer of this.timers.values()) clearInterval(timer);
    this.timers.clear();
    await Promise.allSettled([...this.inFlight]);
  }

  /** Drain every queue once. Tests call this instead of running the timers. */
  async tickAll(): Promise<void> {
    for (const queue of this.options.queues) await this.tick(queue);
    await Promise.allSettled([...this.inFlight]);
  }

  private async tick(queue: QueueName): Promise<void> {
    const capacity = this.options.concurrency - this.inFlight.size;
    if (capacity <= 0) return;

    let claimed: JobRow[];
    try {
      claimed = this.queue.claim(queue, this.id, capacity);
    } catch (error) {
      this.log.error('failed to claim jobs', { queue, error });
      return;
    }

    for (const job of claimed) {
      const promise = this.run(job).finally(() => this.inFlight.delete(promise));
      this.inFlight.add(promise);
    }
  }

  private async run(job: JobRow): Promise<void> {
    const handler = this.handlers.get(job.type);
    const log = this.log.child({ jobId: job.id, jobType: job.type, workspaceId: job.workspaceId });

    if (!handler) {
      log.error('no handler registered for job type');
      this.queue.fail(job.id, {
        message: `No handler registered for job type "${job.type}"`,
        code: 'NO_HANDLER',
        retryable: false,
      });
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), job.timeoutMs);
    let parked = false;

    const ctx: JobContext = {
      job,
      workspaceId: job.workspaceId,
      log,
      heartbeat: (extraMs) => this.queue.heartbeat(job.id, this.id, extraMs),
      progress: (fraction, label) => this.queue.progress(job.id, fraction, label),
      awaitExternal: (externalRef, pollDelayMs) => {
        parked = true;
        this.queue.markSubmitted(job.id, externalRef, pollDelayMs);
        throw PARKED;
      },
      signal: controller.signal,
    };

    const startedAt = Date.now();
    try {
      const result = await handler(ctx);
      this.queue.complete(job.id, result ?? {});
      log.info('job completed', { durationMs: Date.now() - startedAt });
    } catch (error) {
      if (error === PARKED || parked) {
        log.info('job parked awaiting provider result');
        return;
      }
      const appError = toAppError(error);
      const aborted = controller.signal.aborted;
      this.queue.fail(job.id, {
        message: aborted ? `Job timed out after ${job.timeoutMs}ms` : appError.message,
        code: aborted ? 'TIMEOUT' : appError.code,
        retryable: aborted ? true : appError.retryable,
      });
      log.error('job failed', {
        durationMs: Date.now() - startedAt,
        attempts: job.attempts,
        error: appError.message,
        code: appError.code,
      });
    } finally {
      clearTimeout(timeout);
    }
  }
}
