import { createHmac, timingSafeEqual } from 'node:crypto';
import { authHeaders, httpJson, joinUrl } from '../http.js';
import type {
  HealthResult, ModelDescriptor, ProviderAdapter, ProviderContext,
  PublishHandle, PublishInput, PublishResult, PublishState,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';
import { AppError } from '../../core/errors.js';

/**
 * Spec §37–§39 — Open-Dispatch as the publishing abstraction.
 *
 * Fanfluence does not hard-code social APIs and does not invent a competing
 * publishing state machine: it consumes Open-Dispatch's own queue states
 * (queued / publishing / published / failed / dead) and mirrors them locally.
 */

const CAPABILITIES: Capability[] = ['publish', 'caption_adapt', 'transcode', 'queue_inspect', 'retry'];

const DEFAULT_ENDPOINT = 'http://127.0.0.1:8080';

interface DispatchQueueItem {
  id?: string;
  state?: string;
  platform?: string;
  permalink?: string;
  url?: string;
  error?: string;
  attempts?: number;
}

export const openDispatchAdapter: ProviderAdapter = {
  key: 'open_dispatch',
  label: 'Open-Dispatch',
  kind: 'publishing',
  declaredCapabilities: CAPABILITIES,
  defaultEndpoint: DEFAULT_ENDPOINT,
  authKind: 'bearer',
  requiresServerSideCredentials: true,

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      await httpJson(joinUrl(base(ctx), '/healthz'), {
        method: 'GET',
        headers: authHeaders('bearer', ctx.credential),
        provider: 'Open-Dispatch',
        signal: ctx.signal,
        timeoutMs: 5_000,
      });

      // A queue read proves authentication as well as reachability.
      const queueProbe = await httpJson(joinUrl(base(ctx), '/queue'), {
        method: 'GET',
        headers: authHeaders('bearer', ctx.credential),
        provider: 'Open-Dispatch',
        signal: ctx.signal,
        timeoutMs: 10_000,
        allowStatuses: [401, 403],
      });

      const authed = queueProbe.status < 400;
      return {
        state: authed ? 'connected' : 'auth_error',
        detail: authed ? 'Reachable and authenticated.' : 'Reachable but the queue read was rejected.',
        probes: [
          { step: 'reachability', ok: true, latencyMs: Date.now() - t0 },
          { step: 'authentication', ok: authed },
        ],
        checkedAt,
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : null;
      return {
        state: appError?.code === 'PROVIDER_AUTH' ? 'auth_error' : 'unavailable',
        detail: appError?.message ?? String(error),
        probes: [{ step: 'reachability', ok: false, detail: appError?.reason, latencyMs: Date.now() - t0 }],
        checkedAt,
      };
    }
  },

  async capabilities(): Promise<Capability[]> {
    return CAPABILITIES;
  },

  /** Platform specs double as the model catalog for the publishing kind. */
  async models(ctx: ProviderContext): Promise<ModelDescriptor[]> {
    try {
      const { body } = await httpJson<Record<string, Record<string, unknown>>>(
        joinUrl(base(ctx), '/media/specs'),
        {
          method: 'GET',
          headers: authHeaders('bearer', ctx.credential),
          provider: 'Open-Dispatch',
          signal: ctx.signal,
          timeoutMs: 10_000,
        },
      );

      return Object.entries(body ?? {}).map(([platform, spec]) => ({
        id: platform,
        name: platform,
        capabilities: ['publish'] as Capability[],
        outputTypes: ['post'],
        paramSchema: { type: 'object', properties: spec ?? {} },
        available: true,
      }));
    } catch {
      // Specs are advisory; a missing endpoint must not make publishing unusable.
      return [];
    }
  },

  async publish(ctx: ProviderContext, input: PublishInput): Promise<PublishHandle> {
    const { body } = await httpJson<DispatchQueueItem>(joinUrl(base(ctx), '/dispatch'), {
      method: 'POST',
      headers: {
        ...authHeaders('bearer', ctx.credential),
        'Idempotency-Key': input.idempotencyKey,
      },
      body: {
        platform: input.platform,
        account: input.accountHandle,
        text: input.caption ?? '',
        media: input.media.map((m) => ({ url: m.url ?? m.ref, mime: m.mimeType })),
        ...(input.scheduledAt ? { scheduled_at: input.scheduledAt } : {}),
        // Spec §94 — the dry-run flag is what keeps test mode off production channels.
        ...(input.sandbox ? { dry_run: true } : {}),
        queue: (ctx.config.defaultQueue as string) ?? undefined,
      },
      provider: 'Open-Dispatch',
      signal: ctx.signal,
      timeoutMs: 60_000,
    });

    if (!body.id) {
      throw new AppError('PROVIDER_ERROR', 'Open-Dispatch returned no queue id', {
        affected: 'Open-Dispatch',
        remediation: ['view_logs'],
        details: { idempotencyKey: input.idempotencyKey },
        retryable: false,
      });
    }

    return { externalId: body.id, state: mapState(body.state), raw: body };
  },

  async publishStatus(ctx: ProviderContext, externalId: string): Promise<PublishResult> {
    const { body } = await httpJson<DispatchQueueItem>(
      joinUrl(base(ctx), `/queue/${encodeURIComponent(externalId)}`),
      {
        method: 'GET',
        headers: authHeaders('bearer', ctx.credential),
        provider: 'Open-Dispatch',
        signal: ctx.signal,
        timeoutMs: 15_000,
      },
    );

    return {
      externalId,
      state: mapState(body.state),
      permalink: body.permalink ?? body.url,
      error: body.error,
      raw: body,
    };
  },

  async retryPublish(ctx: ProviderContext, externalId: string): Promise<PublishHandle> {
    const { body } = await httpJson<DispatchQueueItem>(
      joinUrl(base(ctx), `/queue/${encodeURIComponent(externalId)}/retry`),
      {
        method: 'POST',
        headers: authHeaders('bearer', ctx.credential),
        provider: 'Open-Dispatch',
        signal: ctx.signal,
        timeoutMs: 30_000,
      },
    );
    return { externalId, state: mapState(body.state ?? 'queued'), raw: body };
  },

  async adaptCaption(ctx: ProviderContext, input: { text: string; platform: string }): Promise<string> {
    const { body } = await httpJson<{ text?: string }>(joinUrl(base(ctx), '/ai/adapt'), {
      method: 'POST',
      headers: authHeaders('bearer', ctx.credential),
      body: { text: input.text, platform: input.platform },
      provider: 'Open-Dispatch',
      signal: ctx.signal,
      timeoutMs: 60_000,
    });
    return body.text ?? input.text;
  },

  async transcode(ctx: ProviderContext, input: { url: string; platform: string }): Promise<{ url: string }> {
    const { body } = await httpJson<{ url?: string }>(joinUrl(base(ctx), '/media/transcode'), {
      method: 'POST',
      headers: authHeaders('bearer', ctx.credential),
      body: { url: input.url, platform: input.platform },
      provider: 'Open-Dispatch',
      signal: ctx.signal,
      timeoutMs: 300_000,
    });
    return { url: body.url ?? input.url };
  },

  verifyWebhook(ctx: ProviderContext, input: { headers: Record<string, string>; rawBody: string }) {
    const secret = ctx.config.webhookSecret as string | undefined;
    const signature = input.headers['x-dispatch-signature'] ?? input.headers['X-Dispatch-Signature'];
    if (!secret || !signature) return { valid: false };

    const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8');
    return {
      valid: a.length === b.length && timingSafeEqual(a, b),
      externalEventId: input.headers['x-dispatch-event-id'],
    };
  },

  parseWebhook(rawBody: unknown) {
    if (!rawBody || typeof rawBody !== 'object') return null;
    const item = rawBody as DispatchQueueItem;
    if (!item.id) return null;
    return { externalId: item.id, state: mapState(item.state), error: item.error };
  },
};

function base(ctx: ProviderContext): string {
  return ctx.endpoint ?? DEFAULT_ENDPOINT;
}

/** Open-Dispatch's own vocabulary, consumed rather than reinterpreted (§39). */
function mapState(state: string | undefined): PublishState {
  switch ((state ?? '').toLowerCase()) {
    case 'queued': case 'pending': return 'queued';
    case 'publishing': case 'in_progress': return 'publishing';
    case 'published': case 'done': case 'success': return 'published';
    case 'failed': case 'error': return 'failed';
    case 'dead': case 'dead_letter': return 'dead';
    default: return 'queued';
  }
}
