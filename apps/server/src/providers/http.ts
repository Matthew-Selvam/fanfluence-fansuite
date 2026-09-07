import { AppError } from '../core/errors.js';

/**
 * The single HTTP path every remote adapter goes through. Centralising it means
 * timeouts, error classification and credential redaction are uniform, and no
 * adapter can accidentally log an Authorization header.
 */

export interface HttpOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'PUT' | 'DELETE';
  headers?: Record<string, string>;
  body?: unknown;
  /** Sent as multipart instead of JSON when present. */
  form?: FormData;
  timeoutMs?: number;
  signal?: AbortSignal;
  /** Provider name, used only for error messages. */
  provider: string;
  /** Treat a non-2xx with this status as a normal result rather than an error. */
  allowStatuses?: number[];
}

export interface HttpResponse<T> {
  status: number;
  headers: Record<string, string>;
  body: T;
}

export async function httpJson<T = unknown>(url: string, opts: HttpOptions): Promise<HttpResponse<T>> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  // Honour an outer abort (job timeout, request cancellation) as well as ours.
  const onOuterAbort = () => controller.abort();
  opts.signal?.addEventListener('abort', onOuterAbort, { once: true });

  try {
    const headers: Record<string, string> = { Accept: 'application/json', ...opts.headers };
    let body: string | FormData | undefined;

    if (opts.form) {
      body = opts.form;
    } else if (opts.body !== undefined) {
      headers['Content-Type'] = 'application/json';
      body = JSON.stringify(opts.body);
    }

    const response = await fetch(url, {
      method: opts.method ?? (body ? 'POST' : 'GET'),
      headers,
      body,
      signal: controller.signal,
    });

    const text = await response.text();
    let parsed: unknown = null;
    if (text) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }

    if (!response.ok && !opts.allowStatuses?.includes(response.status)) {
      throw classifyHttpError(opts.provider, response.status, parsed, url);
    }

    return {
      status: response.status,
      headers: headersToObject(response.headers),
      body: parsed as T,
    };
  } catch (error) {
    if (error instanceof AppError) throw error;
    if (controller.signal.aborted) {
      throw new AppError('PROVIDER_UNAVAILABLE', `${opts.provider} request timed out`, {
        reason: `No response within ${timeoutMs}ms.`,
        affected: opts.provider,
        remediation: ['retry', 'view_logs'],
        retryable: true,
      });
    }
    throw new AppError('PROVIDER_UNAVAILABLE', `${opts.provider} is unreachable`, {
      reason: error instanceof Error ? error.message : String(error),
      affected: opts.provider,
      remediation: ['retry', 'reconnect', 'open_settings'],
      cause: error,
      retryable: true,
    });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener('abort', onOuterAbort);
  }
}

/**
 * Map an HTTP status onto the error vocabulary the UI renders (§66). The
 * distinction that matters most is retryable vs not: a 401 must never be
 * retried in a loop, and a 429 must never be treated as a hard failure.
 */
/** `Headers` is iterable at runtime but not typed as such under the Node libs. */
function headersToObject(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key] = value;
  });
  return out;
}

export function classifyHttpError(
  provider: string,
  status: number,
  body: unknown,
  url: string,
): AppError {
  const detail = extractMessage(body);
  const affected = provider;
  const endpoint = safeEndpoint(url);

  if (status === 401 || status === 403) {
    return new AppError('PROVIDER_AUTH', `${provider} rejected the credentials`, {
      reason: detail ?? 'The provider could not authenticate this request.',
      affected,
      remediation: ['reconnect', 'open_settings'],
      details: { status, endpoint },
      retryable: false,
    });
  }
  if (status === 404) {
    return new AppError('PROVIDER_ERROR', `${provider} endpoint or model not found`, {
      reason: detail ?? 'The requested resource does not exist on this provider.',
      affected,
      remediation: ['open_settings', 'view_logs'],
      details: { status, endpoint },
      retryable: false,
    });
  }
  if (status === 429) {
    return new AppError('RATE_LIMITED', `${provider} rate limit reached`, {
      reason: detail ?? 'Too many requests in the current window.',
      affected,
      remediation: ['wait', 'retry'],
      details: { status, endpoint },
      retryable: true,
    });
  }
  if (status >= 500) {
    return new AppError('PROVIDER_UNAVAILABLE', `${provider} returned a server error`, {
      reason: detail ?? `Upstream responded ${status}.`,
      affected,
      remediation: ['retry', 'view_logs'],
      details: { status, endpoint },
      retryable: true,
    });
  }
  return new AppError('PROVIDER_ERROR', `${provider} rejected the request`, {
    reason: detail ?? `Upstream responded ${status}.`,
    affected,
    remediation: ['view_logs'],
    details: { status, endpoint },
    retryable: false,
  });
}

function extractMessage(body: unknown): string | undefined {
  if (typeof body === 'string') return body.slice(0, 500);
  if (body && typeof body === 'object') {
    const b = body as Record<string, unknown>;
    const candidate =
      (typeof b.message === 'string' && b.message) ||
      (typeof b.error === 'string' && b.error) ||
      (b.error && typeof b.error === 'object' && typeof (b.error as Record<string, unknown>).message === 'string'
        ? String((b.error as Record<string, unknown>).message)
        : undefined) ||
      (typeof b.detail === 'string' && b.detail);
    if (candidate) return String(candidate).slice(0, 500);
  }
  return undefined;
}

/** Strip query strings — they can carry tokens — before an endpoint reaches a log. */
function safeEndpoint(url: string): string {
  try {
    const u = new URL(url);
    return `${u.origin}${u.pathname}`;
  } catch {
    return url.split('?')[0] ?? url;
  }
}

export function authHeaders(
  authKind: 'none' | 'bearer' | 'api_key_header' | 'basic' | 'oauth2',
  credential: string | null,
  headerName = 'X-API-Key',
): Record<string, string> {
  if (!credential || authKind === 'none') return {};
  switch (authKind) {
    case 'bearer':
    case 'oauth2':
      return { Authorization: `Bearer ${credential}` };
    case 'api_key_header':
      return { [headerName]: credential };
    case 'basic':
      return { Authorization: `Basic ${Buffer.from(credential).toString('base64')}` };
    default:
      return {};
  }
}

/** Join a base endpoint and a path without producing a double slash. */
export function joinUrl(base: string, path: string): string {
  return `${base.replace(/\/+$/, '')}/${path.replace(/^\/+/, '')}`;
}
