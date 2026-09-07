import { eq, lte, sql } from 'drizzle-orm';
import { rateCounters } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import type { Clock } from '../core/clock.js';
import { AppError } from '../core/errors.js';

/**
 * Spec §125 — rate limits per provider, workspace, character, fan, automation
 * and publishing account.
 *
 * Counters are persisted rather than in-memory so a limit survives a restart:
 * "max 3 messages to this fan per day" must not reset because the process was
 * relaunched.
 */
export type LimitDimension =
  | 'provider' | 'workspace' | 'character' | 'fan'
  | 'automation' | 'publishing_account' | 'campaign' | 'goal';

export interface LimitCheck {
  workspaceId: string;
  dimension: LimitDimension;
  subject: string;
  /** Distinguishes independent limits on the same subject, e.g. `messages`. */
  action: string;
  limit: number;
  windowMs: number;
}

export interface LimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

export class RateLimiter {
  constructor(
    private readonly db: Db,
    private readonly clock: Clock,
  ) {}

  /** Check and consume one unit. Fixed windows — simple, and enough here. */
  consume(check: LimitCheck): LimitResult {
    const now = this.clock.now();
    const key = keyFor(check);
    const windowStart = new Date(Math.floor(now.getTime() / check.windowMs) * check.windowMs);
    const resetAt = new Date(windowStart.getTime() + check.windowMs);

    const existing = this.db.select().from(rateCounters).where(eq(rateCounters.key, key)).get();

    if (!existing || existing.windowStart.getTime() !== windowStart.getTime()) {
      this.db
        .insert(rateCounters)
        .values({
          key,
          workspaceId: check.workspaceId,
          windowStart,
          windowMs: check.windowMs,
          count: 1,
          limit: check.limit,
        })
        .onConflictDoUpdate({
          target: rateCounters.key,
          set: { windowStart, windowMs: check.windowMs, count: 1, limit: check.limit },
        })
        .run();
      return { allowed: true, remaining: check.limit - 1, limit: check.limit, resetAt };
    }

    if (existing.count >= check.limit) {
      return { allowed: false, remaining: 0, limit: check.limit, resetAt };
    }

    this.db
      .update(rateCounters)
      .set({ count: sql`${rateCounters.count} + 1`, limit: check.limit })
      .where(eq(rateCounters.key, key))
      .run();

    return { allowed: true, remaining: check.limit - existing.count - 1, limit: check.limit, resetAt };
  }

  /** Read the current state without consuming. */
  peek(check: LimitCheck): LimitResult {
    const now = this.clock.now();
    const windowStart = new Date(Math.floor(now.getTime() / check.windowMs) * check.windowMs);
    const resetAt = new Date(windowStart.getTime() + check.windowMs);
    const existing = this.db.select().from(rateCounters).where(eq(rateCounters.key, keyFor(check))).get();

    const count = existing && existing.windowStart.getTime() === windowStart.getTime() ? existing.count : 0;
    return {
      allowed: count < check.limit,
      remaining: Math.max(0, check.limit - count),
      limit: check.limit,
      resetAt,
    };
  }

  /** Consume, or throw the actionable §66-shaped error. */
  require(check: LimitCheck): LimitResult {
    const result = this.consume(check);
    if (!result.allowed) {
      throw new AppError('RATE_LIMITED', `Rate limit reached for ${check.action}`, {
        reason: `At most ${check.limit} per window for this ${check.dimension}.`,
        affected: `${check.dimension}:${check.subject}`,
        remediation: ['wait', 'open_settings'],
        details: { resetAt: result.resetAt.toISOString(), limit: check.limit },
        retryable: true,
      });
    }
    return result;
  }

  /** Drop windows that can no longer be current. Run by the maintenance queue. */
  prune(olderThan: Date): number {
    return this.db
      .delete(rateCounters)
      .where(lte(rateCounters.windowStart, olderThan))
      .returning({ key: rateCounters.key })
      .all().length;
  }
}

function keyFor(check: LimitCheck): string {
  return `${check.workspaceId}:${check.dimension}:${check.subject}:${check.action}:${check.windowMs}`;
}

export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
export const MINUTE_MS = 60_000;
