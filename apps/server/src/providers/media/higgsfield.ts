import { createHmac, timingSafeEqual } from 'node:crypto';
import { httpJson, joinUrl } from '../http.js';
import type {
  GenerateInput, GenerationHandle, GenerationResult, GenerationState,
  HealthResult, ModelDescriptor, ProviderAdapter, ProviderContext,
  UploadInput, UploadResult,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';
import { AppError } from '../../core/errors.js';

/**
 * Spec §40 — Higgsfield as a Studio generation provider.
 *
 * Credentials stay server-side (§40, §58): the adapter runs only inside the
 * server or the desktop bridge, and the key/secret pair never reaches browser
 * JavaScript. Character-reference workflows are exposed through the generic
 * `characterReferenceRefs` field so Photo Studio never names Higgsfield.
 */

const CAPABILITIES: Capability[] = [
  'image_generation', 'image_edit', 'video_generation',
  'character_reference', 'upload', 'job_polling', 'webhooks', 'cancel',
];

const DEFAULT_ENDPOINT = 'https://platform.higgsfield.ai';

interface HiggsfieldJobSet {
  id?: string;
  status?: string;
  jobs?: Array<{
    id?: string;
    status?: string;
    results?: { raw?: { url?: string }; min?: { url?: string } };
    error?: string;
  }>;
}

export const higgsfieldAdapter: ProviderAdapter = {
  key: 'higgsfield',
  label: 'Higgsfield',
  kind: 'media',
  declaredCapabilities: CAPABILITIES,
  defaultEndpoint: DEFAULT_ENDPOINT,
  authKind: 'api_key_header',
  requiresServerSideCredentials: true,

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    const t0 = Date.now();

    if (!ctx.credential) {
      return {
        state: 'auth_error',
        detail: 'No Higgsfield credentials are configured.',
        probes: [{ step: 'authentication', ok: false, detail: 'Missing credential.' }],
        checkedAt,
      };
    }

    try {
      await httpJson(joinUrl(base(ctx), '/v1/motions'), {
        method: 'GET',
        headers: credentialHeaders(ctx),
        provider: 'Higgsfield',
        signal: ctx.signal,
        timeoutMs: 10_000,
        allowStatuses: [404],
      });
      return {
        state: 'connected',
        detail: 'Authenticated successfully.',
        probes: [
          { step: 'reachability', ok: true, latencyMs: Date.now() - t0 },
          { step: 'authentication', ok: true },
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

  async models(ctx: ProviderContext): Promise<ModelDescriptor[]> {
    const configured = (ctx.config.models as ModelDescriptor[] | undefined) ?? [];
    return configured.length > 0 ? configured : DEFAULT_MODELS;
  },

  async upload(ctx: ProviderContext, input: UploadInput): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.data)], { type: input.mimeType }), input.filename);

    const { body } = await httpJson<{ url?: string; id?: string }>(
      joinUrl(base(ctx), '/v1/uploads'),
      {
        method: 'POST',
        headers: credentialHeaders(ctx),
        form,
        provider: 'Higgsfield',
        signal: ctx.signal,
        timeoutMs: 120_000,
      },
    );

    const ref = body.url ?? body.id;
    if (!ref) {
      throw new AppError('PROVIDER_ERROR', 'Higgsfield upload returned no reference', {
        affected: 'Higgsfield',
        remediation: ['retry', 'view_logs'],
        retryable: true,
      });
    }
    return { ref, url: body.url };
  },

  async generate(ctx: ProviderContext, input: GenerateInput): Promise<GenerationHandle> {
    const path = input.kind === 'video' ? '/v1/video-generations' : '/v1/image-generations';

    const params: Record<string, unknown> = {
      prompt: input.prompt,
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.aspect ? { aspect_ratio: input.aspect } : {}),
      ...(input.resolution ? { quality: input.resolution } : {}),
      ...(input.durationMs ? { duration: Math.round(input.durationMs / 1000) } : {}),
      ...(input.variants && input.variants > 1 ? { batch_size: input.variants } : {}),
      ...(input.referenceRefs?.length
        ? { input_images: input.referenceRefs.map((url) => ({ type: 'image_url', image_url: url })) }
        : {}),
      ...(input.characterReferenceRefs?.length
        ? { character_reference: input.characterReferenceRefs.map((url) => ({ type: 'image_url', image_url: url })) }
        : {}),
      ...(input.params ?? {}),
    };

    const { body } = await httpJson<HiggsfieldJobSet>(joinUrl(base(ctx), path), {
      method: 'POST',
      headers: { ...credentialHeaders(ctx), 'Idempotency-Key': input.idempotencyKey },
      body: { model: input.model, params, ...(input.webhookUrl ? { webhook: { url: input.webhookUrl } } : {}) },
      provider: 'Higgsfield',
      signal: ctx.signal,
      timeoutMs: 60_000,
    });

    if (!body.id) {
      throw new AppError('PROVIDER_ERROR', 'Higgsfield returned no job set id', {
        affected: 'Higgsfield',
        remediation: ['view_logs'],
        // Same reasoning as WaveSpeed: a submission may have been accepted.
        retryable: false,
        details: { idempotencyKey: input.idempotencyKey },
      });
    }

    return { externalId: body.id, state: mapState(body.status), pollAfterMs: 4_000, raw: body };
  },

  async status(ctx: ProviderContext, externalId: string): Promise<GenerationResult> {
    return higgsfieldAdapter.result!(ctx, externalId);
  },

  async result(ctx: ProviderContext, externalId: string): Promise<GenerationResult> {
    const { body } = await httpJson<HiggsfieldJobSet>(
      joinUrl(base(ctx), `/v1/job-sets/${externalId}`),
      {
        method: 'GET',
        headers: credentialHeaders(ctx),
        provider: 'Higgsfield',
        signal: ctx.signal,
        timeoutMs: 30_000,
      },
    );

    return { externalId, ...mapJobSet(body), raw: body };
  },

  async cancel(ctx: ProviderContext, externalId: string): Promise<void> {
    await httpJson(joinUrl(base(ctx), `/v1/job-sets/${externalId}/cancel`), {
      method: 'POST',
      headers: credentialHeaders(ctx),
      provider: 'Higgsfield',
      signal: ctx.signal,
      timeoutMs: 15_000,
      allowStatuses: [404, 409],
    });
  },

  /** Spec §117 — constant-time signature comparison before anything is parsed. */
  verifyWebhook(ctx: ProviderContext, input: { headers: Record<string, string>; rawBody: string }) {
    const secret = ctx.config.webhookSecret as string | undefined;
    const signature = input.headers['x-higgsfield-signature'] ?? input.headers['X-Higgsfield-Signature'];
    if (!secret || !signature) return { valid: false };

    const expected = createHmac('sha256', secret).update(input.rawBody).digest('hex');
    const a = Buffer.from(expected, 'utf8');
    const b = Buffer.from(signature.replace(/^sha256=/, ''), 'utf8');
    const valid = a.length === b.length && timingSafeEqual(a, b);

    return { valid, externalEventId: input.headers['x-higgsfield-event-id'] };
  },

  parseWebhook(rawBody: unknown) {
    if (!rawBody || typeof rawBody !== 'object') return null;
    const jobSet = rawBody as HiggsfieldJobSet;
    if (!jobSet.id) return null;
    const mapped = mapJobSet(jobSet);
    return { externalId: jobSet.id, state: mapped.state, outputs: mapped.outputs, error: mapped.error };
  },
};

function base(ctx: ProviderContext): string {
  return ctx.endpoint ?? DEFAULT_ENDPOINT;
}

/**
 * Higgsfield authenticates with a key/secret pair. The stored credential is
 * `key:secret`; splitting happens here so the rest of the system only ever
 * handles one opaque secret reference.
 */
function credentialHeaders(ctx: ProviderContext): Record<string, string> {
  if (!ctx.credential) return {};
  const separator = ctx.credential.indexOf(':');
  if (separator === -1) return { 'hf-api-key': ctx.credential };
  return {
    'hf-api-key': ctx.credential.slice(0, separator),
    'hf-secret': ctx.credential.slice(separator + 1),
  };
}

function mapJobSet(body: HiggsfieldJobSet): Pick<GenerationResult, 'state' | 'outputs' | 'error' | 'progress'> {
  const jobs = body.jobs ?? [];
  const outputs = jobs
    .map((j) => j.results?.raw?.url ?? j.results?.min?.url)
    .filter((url): url is string => Boolean(url))
    .map((url) => ({ url }));

  const state = mapState(body.status);
  const done = jobs.filter((j) => ['completed', 'failed', 'canceled'].includes((j.status ?? '').toLowerCase())).length;

  return {
    state,
    outputs,
    progress: jobs.length > 0 ? done / jobs.length : undefined,
    error: jobs.find((j) => j.error)?.error,
  };
}

function mapState(status: string | undefined): GenerationState {
  switch ((status ?? '').toLowerCase()) {
    case 'queued': case 'pending': case 'created': return 'submitted';
    case 'in_progress': case 'processing': case 'running': return 'running';
    case 'completed': case 'succeeded': return 'completed';
    case 'failed': case 'nsfw': return 'failed';
    case 'canceled': case 'cancelled': return 'cancelled';
    default: return 'unknown';
  }
}

const DEFAULT_MODELS: ModelDescriptor[] = [
  {
    id: 'soul',
    name: 'Higgsfield Soul',
    capabilities: ['image_generation', 'character_reference'],
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    costUnit: 'image',
    paramSchema: {
      type: 'object',
      properties: {
        quality: { type: 'string', enum: ['720p', '1080p'], default: '1080p' },
        aspect_ratio: { type: 'string', enum: ['9:16', '16:9', '1:1', '4:5'], default: '9:16' },
        batch_size: { type: 'integer', minimum: 1, maximum: 4, default: 1 },
      },
    },
  },
  {
    id: 'dop',
    name: 'Higgsfield DoP (video)',
    capabilities: ['video_generation', 'character_reference'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    maxDurationMs: 10_000,
    costUnit: 'second',
    paramSchema: {
      type: 'object',
      properties: {
        duration: { type: 'integer', enum: [3, 5, 10], default: 5 },
        motion_id: { type: 'string' },
        quality: { type: 'string', enum: ['720p', '1080p'], default: '1080p' },
      },
    },
  },
];
