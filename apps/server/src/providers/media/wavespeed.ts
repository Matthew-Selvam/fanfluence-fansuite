import { authHeaders, httpJson, joinUrl } from '../http.js';
import type {
  GenerateInput, GenerationHandle, GenerationResult, GenerationState,
  HealthResult, ModelDescriptor, ProviderAdapter, ProviderContext,
  UploadInput, UploadResult,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';
import { AppError } from '../../core/errors.js';

/**
 * Spec §41 — WaveSpeed.
 *
 * The critical behaviour: WaveSpeed cautions that a disconnected response to a
 * submission POST can still represent an accepted and billed prediction. So
 * `generate` never retries on transport failure. It throws a non-retryable
 * error carrying the idempotency key, and the job is parked for reconciliation
 * rather than resubmitted.
 */

const CAPABILITIES: Capability[] = [
  'image_generation', 'video_generation', 'audio_generation',
  'upload', 'job_polling', 'webhooks', 'cancel',
];

interface WaveSpeedSubmitResponse {
  code?: number;
  message?: string;
  data?: { id?: string; status?: string; model?: string; urls?: { get?: string } };
}

interface WaveSpeedResultResponse {
  code?: number;
  message?: string;
  data?: {
    id?: string;
    status?: string;
    outputs?: string[];
    error?: string;
    timings?: { inference?: number };
    has_nsfw_contents?: boolean[];
  };
}

const DEFAULT_ENDPOINT = 'https://api.wavespeed.ai';

/**
 * WaveSpeed exposes model-specific endpoints under `/api/v3/{model_id}`, so the
 * model id is part of the path rather than the body.
 */
const submitPath = (modelId: string) => `/api/v3/${modelId}`;
const resultPath = (predictionId: string) => `/api/v3/predictions/${predictionId}/result`;

export const wavespeedAdapter: ProviderAdapter = {
  key: 'wavespeed',
  label: 'WaveSpeed',
  kind: 'media',
  declaredCapabilities: CAPABILITIES,
  defaultEndpoint: DEFAULT_ENDPOINT,
  authKind: 'bearer',
  requiresServerSideCredentials: true,

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    const t0 = Date.now();

    if (!ctx.credential) {
      return {
        state: 'auth_error',
        detail: 'No WaveSpeed API key is configured.',
        probes: [{ step: 'authentication', ok: false, detail: 'Missing credential.' }],
        checkedAt,
      };
    }

    // A balance read is the cheapest authenticated call that proves the key works.
    try {
      await httpJson(joinUrl(base(ctx), '/api/v3/balance'), {
        method: 'GET',
        headers: authHeaders('bearer', ctx.credential),
        provider: 'WaveSpeed',
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

  /**
   * WaveSpeed's catalog is per-model-endpoint rather than a single list, so the
   * models a workspace uses are configured and stored locally (§115).
   */
  async models(ctx: ProviderContext): Promise<ModelDescriptor[]> {
    const configured = (ctx.config.models as ModelDescriptor[] | undefined) ?? [];
    return configured.length > 0 ? configured : DEFAULT_MODELS;
  },

  async upload(ctx: ProviderContext, input: UploadInput): Promise<UploadResult> {
    const form = new FormData();
    form.append('file', new Blob([new Uint8Array(input.data)], { type: input.mimeType }), input.filename);

    const { body } = await httpJson<{ data?: { download_url?: string } }>(
      joinUrl(base(ctx), '/api/v3/media/upload/binary'),
      {
        method: 'POST',
        headers: authHeaders('bearer', ctx.credential),
        form,
        provider: 'WaveSpeed',
        signal: ctx.signal,
        timeoutMs: 120_000,
      },
    );

    const url = body.data?.download_url;
    if (!url) {
      throw new AppError('PROVIDER_ERROR', 'WaveSpeed upload returned no URL', {
        affected: 'WaveSpeed',
        remediation: ['retry', 'view_logs'],
        retryable: true,
      });
    }
    return { ref: url, url };
  },

  async generate(ctx: ProviderContext, input: GenerateInput): Promise<GenerationHandle> {
    const payload: Record<string, unknown> = {
      prompt: input.prompt,
      ...(input.negativePrompt ? { negative_prompt: input.negativePrompt } : {}),
      ...(input.referenceRefs?.length ? { images: input.referenceRefs } : {}),
      ...(input.seed !== undefined ? { seed: input.seed } : {}),
      ...(input.aspect ? { size: input.aspect } : {}),
      ...(input.durationMs ? { duration: Math.round(input.durationMs / 1000) } : {}),
      ...(input.variants && input.variants > 1 ? { num_images: input.variants } : {}),
      ...(input.webhookUrl ? { webhook_url: input.webhookUrl } : {}),
      ...(input.params ?? {}),
    };

    try {
      const { body } = await httpJson<WaveSpeedSubmitResponse>(
        joinUrl(base(ctx), submitPath(input.model)),
        {
          method: 'POST',
          headers: {
            ...authHeaders('bearer', ctx.credential),
            'Idempotency-Key': input.idempotencyKey,
          },
          body: payload,
          provider: 'WaveSpeed',
          signal: ctx.signal,
          timeoutMs: 60_000,
        },
      );

      const predictionId = body.data?.id;
      if (!predictionId) {
        throw new AppError('PROVIDER_ERROR', 'WaveSpeed accepted the request but returned no prediction id', {
          reason: body.message ?? 'Missing data.id in the submission response.',
          affected: 'WaveSpeed',
          remediation: ['view_logs'],
          retryable: false,
        });
      }

      return { externalId: predictionId, state: mapState(body.data?.status), pollAfterMs: 3_000, raw: body };
    } catch (error) {
      throw asNonResubmittable(error, input.idempotencyKey);
    }
  },

  async status(ctx: ProviderContext, externalId: string): Promise<GenerationResult> {
    return wavespeedAdapter.result!(ctx, externalId);
  },

  async result(ctx: ProviderContext, externalId: string): Promise<GenerationResult> {
    const { body } = await httpJson<WaveSpeedResultResponse>(
      joinUrl(base(ctx), resultPath(externalId)),
      {
        method: 'GET',
        headers: authHeaders('bearer', ctx.credential),
        provider: 'WaveSpeed',
        signal: ctx.signal,
        timeoutMs: 30_000,
      },
    );

    const state = mapState(body.data?.status);
    return {
      externalId,
      state,
      outputs: (body.data?.outputs ?? []).map((url) => ({ url })),
      error: body.data?.error ?? (state === 'failed' ? body.message : undefined),
      raw: body,
    };
  },

  parseWebhook(rawBody: unknown) {
    if (!rawBody || typeof rawBody !== 'object') return null;
    const data = (rawBody as WaveSpeedResultResponse).data;
    if (!data?.id) return null;
    return {
      externalId: data.id,
      state: mapState(data.status),
      outputs: (data.outputs ?? []).map((url) => ({ url })),
      error: data.error,
    };
  },
};

function base(ctx: ProviderContext): string {
  return ctx.endpoint ?? DEFAULT_ENDPOINT;
}

function mapState(status: string | undefined): GenerationState {
  switch ((status ?? '').toLowerCase()) {
    case 'created': case 'queued': case 'pending': return 'submitted';
    case 'processing': case 'running': return 'running';
    case 'completed': case 'succeeded': case 'success': return 'completed';
    case 'failed': case 'error': return 'failed';
    case 'canceled': case 'cancelled': return 'cancelled';
    default: return 'unknown';
  }
}

/**
 * Spec §41 — turn any submission failure into a non-retryable error. Even a
 * timeout may correspond to an accepted, billed prediction, so the caller must
 * reconcile by polling rather than POST again.
 */
function asNonResubmittable(error: unknown, idempotencyKey: string): AppError {
  if (error instanceof AppError) {
    if (error.code === 'PROVIDER_AUTH') return error;
    return new AppError(error.code, error.message, {
      reason: error.reason,
      affected: error.affected,
      remediation: ['view_logs', 'open_settings'],
      details: {
        ...(typeof error.details === 'object' && error.details ? error.details : {}),
        idempotencyKey,
        note: 'Submission was not retried: a lost response may still be an accepted, billed prediction.',
      },
      retryable: false,
      cause: error,
    });
  }
  return new AppError('PROVIDER_ERROR', 'WaveSpeed submission failed', {
    reason: error instanceof Error ? error.message : String(error),
    affected: 'WaveSpeed',
    remediation: ['view_logs'],
    details: { idempotencyKey },
    retryable: false,
    cause: error,
  });
}

const DEFAULT_MODELS: ModelDescriptor[] = [
  {
    id: 'wavespeed-ai/flux-dev',
    name: 'Flux Dev',
    capabilities: ['image_generation'],
    inputTypes: ['text'],
    outputTypes: ['image'],
    costUnit: 'image',
    paramSchema: {
      type: 'object',
      properties: {
        num_inference_steps: { type: 'integer', minimum: 1, maximum: 50, default: 28 },
        guidance_scale: { type: 'number', minimum: 0, maximum: 20, default: 3.5 },
        size: { type: 'string', default: '1024*1024' },
      },
    },
  },
];
