/**
 * Structured errors. Every error carries enough to render the spec §66 shape:
 * what happened, why, what is affected, what can be done.
 */
export type ErrorCode =
  | 'BAD_REQUEST'
  | 'VALIDATION_FAILED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'RATE_LIMITED'
  | 'PROVIDER_UNAVAILABLE'
  | 'PROVIDER_AUTH'
  | 'PROVIDER_ERROR'
  | 'CAPABILITY_UNSUPPORTED'
  | 'APPROVAL_REQUIRED'
  | 'GUARDRAIL_BLOCKED'
  | 'KILL_SWITCH'
  | 'OFFLINE'
  | 'INTERNAL';

const STATUS: Record<ErrorCode, number> = {
  BAD_REQUEST: 400,
  VALIDATION_FAILED: 422,
  NOT_FOUND: 404,
  CONFLICT: 409,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 502,
  PROVIDER_AUTH: 502,
  PROVIDER_ERROR: 502,
  CAPABILITY_UNSUPPORTED: 501,
  APPROVAL_REQUIRED: 409,
  GUARDRAIL_BLOCKED: 403,
  KILL_SWITCH: 503,
  OFFLINE: 503,
  INTERNAL: 500,
};

export interface AppErrorOptions {
  /** Why it happened, in words a user can act on. */
  reason?: string;
  /** What is affected. */
  affected?: string;
  /** What can be done: machine-readable remediation hints. */
  remediation?: Array<'retry' | 'reconnect' | 'open_settings' | 'view_logs' | 'approve' | 'wait'>;
  details?: unknown;
  cause?: unknown;
  retryable?: boolean;
}

export class AppError extends Error {
  readonly code: ErrorCode;
  readonly status: number;
  readonly reason?: string;
  readonly affected?: string;
  readonly remediation: NonNullable<AppErrorOptions['remediation']>;
  readonly details?: unknown;
  readonly retryable: boolean;

  constructor(code: ErrorCode, message: string, opts: AppErrorOptions = {}) {
    super(message, opts.cause !== undefined ? { cause: opts.cause } : undefined);
    this.name = 'AppError';
    this.code = code;
    this.status = STATUS[code];
    this.reason = opts.reason;
    this.affected = opts.affected;
    this.remediation = opts.remediation ?? [];
    this.details = opts.details;
    this.retryable = opts.retryable ?? RETRYABLE_BY_DEFAULT.has(code);
  }

  toJSON() {
    return {
      error: {
        code: this.code,
        message: this.message,
        reason: this.reason,
        affected: this.affected,
        remediation: this.remediation,
        details: this.details,
        retryable: this.retryable,
      },
    };
  }
}

const RETRYABLE_BY_DEFAULT = new Set<ErrorCode>([
  'RATE_LIMITED',
  'PROVIDER_UNAVAILABLE',
  'PROVIDER_ERROR',
  'OFFLINE',
  'INTERNAL',
]);

export const notFound = (what: string, id?: string) =>
  new AppError('NOT_FOUND', `${what} not found`, {
    reason: id ? `No ${what} exists with id ${id} in this workspace.` : undefined,
    affected: what,
  });

export const badRequest = (message: string, details?: unknown) =>
  new AppError('BAD_REQUEST', message, { details });

export const conflict = (message: string, details?: unknown) =>
  new AppError('CONFLICT', message, { details });

export const forbidden = (message: string, reason?: string) =>
  new AppError('FORBIDDEN', message, { reason });

export function isAppError(e: unknown): e is AppError {
  return e instanceof AppError;
}

/** Wrap an unknown thrown value into an AppError without losing the cause. */
export function toAppError(e: unknown): AppError {
  if (isAppError(e)) return e;
  const message = e instanceof Error ? e.message : String(e);
  return new AppError('INTERNAL', message, { cause: e });
}
