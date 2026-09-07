import { createHash, randomUUID } from 'node:crypto';
import type {
  GenerateInput, GenerationHandle, GenerationResult, HealthResult,
  ModelDescriptor, ProviderAdapter, ProviderContext, UploadInput, UploadResult,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';

/**
 * Spec §96 — MockImageProvider / MockVideoProvider.
 *
 * Jobs are held in memory and progress over a short, deterministic timeline,
 * so the whole async generation pipeline — submit, poll, park, complete,
 * download — is exercised end to end with no external service.
 */

interface MockJob {
  externalId: string;
  kind: GenerateInput['kind'];
  submittedAt: number;
  durationMs: number;
  variants: number;
  prompt: string;
  /** Set when the caller asked for a failure, via a `fail` marker in the prompt. */
  shouldFail: boolean;
  cancelled: boolean;
}

const jobsByKey = new Map<string, MockJob>();
const jobsById = new Map<string, MockJob>();
const uploads = new Map<string, UploadInput>();

const IMAGE_MODELS: ModelDescriptor[] = [
  {
    id: 'mock-image-v1',
    name: 'Mock Image v1',
    capabilities: ['image_generation', 'character_reference', 'upload', 'job_polling', 'cancel'],
    inputTypes: ['text', 'image'],
    outputTypes: ['image'],
    maxResolution: '2048x2048',
    costPerUnitMinor: 0,
    costUnit: 'image',
    paramSchema: {
      type: 'object',
      properties: {
        guidance: { type: 'number', minimum: 0, maximum: 20, default: 7 },
        steps: { type: 'integer', minimum: 1, maximum: 60, default: 30 },
        style: { type: 'string', enum: ['photographic', 'editorial', 'cinematic'], default: 'photographic' },
      },
    },
  },
];

const VIDEO_MODELS: ModelDescriptor[] = [
  {
    id: 'mock-video-v1',
    name: 'Mock Video v1',
    capabilities: ['video_generation', 'character_reference', 'upload', 'job_polling', 'cancel', 'webhooks'],
    inputTypes: ['text', 'image'],
    outputTypes: ['video'],
    maxDurationMs: 10_000,
    costPerUnitMinor: 0,
    costUnit: 'second',
    paramSchema: {
      type: 'object',
      properties: {
        motion: { type: 'integer', minimum: 1, maximum: 10, default: 5 },
        camera: { type: 'string', enum: ['static', 'pan', 'orbit', 'dolly'], default: 'static' },
      },
    },
  },
];

const AUDIO_MODELS: ModelDescriptor[] = [
  {
    id: 'mock-audio-v1',
    name: 'Mock Audio v1',
    capabilities: ['audio_generation', 'job_polling'],
    inputTypes: ['text'],
    outputTypes: ['audio'],
    costPerUnitMinor: 0,
    costUnit: 'second',
  },
];

const CAPABILITIES: Capability[] = [
  'image_generation', 'video_generation', 'audio_generation',
  'character_reference', 'upload', 'job_polling', 'cancel', 'webhooks',
];

/** A 1×1 transparent PNG — a real, decodable image for the download path. */
const PNG_1PX = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
  'base64',
);

export const mockMediaAdapter: ProviderAdapter = {
  key: 'mock_media',
  label: 'Mock Media Provider',
  kind: 'media',
  declaredCapabilities: CAPABILITIES,
  authKind: 'none',
  requiresServerSideCredentials: false,

  async health(): Promise<HealthResult> {
    return {
      state: 'connected',
      detail: 'Mock media provider is always available.',
      probes: [
        { step: 'reachability', ok: true, latencyMs: 0 },
        { step: 'authentication', ok: true },
        { step: 'models', ok: true, detail: `${IMAGE_MODELS.length + VIDEO_MODELS.length + AUDIO_MODELS.length} models` },
      ],
      checkedAt: new Date().toISOString(),
    };
  },

  async capabilities(): Promise<Capability[]> {
    return CAPABILITIES;
  },

  async models(): Promise<ModelDescriptor[]> {
    return [...IMAGE_MODELS, ...VIDEO_MODELS, ...AUDIO_MODELS];
  },

  async upload(_ctx: ProviderContext, input: UploadInput): Promise<UploadResult> {
    const ref = `mockref_${createHash('sha256').update(input.data).digest('hex').slice(0, 16)}`;
    uploads.set(ref, input);
    return { ref, url: `mock://uploads/${ref}` };
  },

  /**
   * Idempotent by key, which is what lets the retry/failover tests assert that
   * a duplicate submission never produces a second billable job (§72/§73).
   */
  async generate(_ctx: ProviderContext, input: GenerateInput): Promise<GenerationHandle> {
    const existing = jobsByKey.get(input.idempotencyKey);
    if (existing) {
      return { externalId: existing.externalId, state: stateOf(existing), pollAfterMs: 200 };
    }

    const job: MockJob = {
      externalId: `mockjob_${randomUUID().slice(0, 12)}`,
      kind: input.kind,
      submittedAt: Date.now(),
      durationMs: input.kind === 'video' ? 1_500 : 400,
      variants: Math.max(1, input.variants ?? 1),
      prompt: input.prompt,
      shouldFail: /\[\[mock:fail\]\]/i.test(input.prompt),
      cancelled: false,
    };
    jobsByKey.set(input.idempotencyKey, job);
    jobsById.set(job.externalId, job);
    return { externalId: job.externalId, state: 'submitted', pollAfterMs: 200 };
  },

  async status(ctx: ProviderContext, externalId: string): Promise<GenerationResult> {
    return this.result!(ctx, externalId);
  },

  async result(_ctx: ProviderContext, externalId: string): Promise<GenerationResult> {
    const job = jobsById.get(externalId);
    if (!job) {
      return { externalId, state: 'unknown', outputs: [], error: 'No such mock job' };
    }

    const state = stateOf(job);
    if (state !== 'completed') {
      const elapsed = Date.now() - job.submittedAt;
      return {
        externalId,
        state,
        progress: Math.min(0.99, elapsed / job.durationMs),
        outputs: [],
        error: state === 'failed' ? 'Mock provider was asked to fail' : undefined,
      };
    }

    return {
      externalId,
      state: 'completed',
      progress: 1,
      outputs: Array.from({ length: job.variants }, (_, i) => ({
        data: PNG_1PX,
        mimeType: job.kind === 'video' ? 'video/mp4' : job.kind === 'audio' ? 'audio/mpeg' : 'image/png',
        width: 1,
        height: 1,
        durationMs: job.kind === 'image' ? undefined : 3_000,
        metadata: { variant: i, mock: true, prompt: job.prompt.slice(0, 120) },
      })),
      costMinor: 0,
      creditsUsed: 0,
    };
  },

  async cancel(_ctx: ProviderContext, externalId: string): Promise<void> {
    const job = jobsById.get(externalId);
    if (job) job.cancelled = true;
  },

  parseWebhook(body: unknown) {
    if (!body || typeof body !== 'object') return null;
    const b = body as Record<string, unknown>;
    if (typeof b.externalId !== 'string') return null;
    return {
      externalId: b.externalId,
      state: (b.state as GenerationResult['state']) ?? 'completed',
      outputs: [],
    };
  },
};

function stateOf(job: MockJob): GenerationResult['state'] {
  if (job.cancelled) return 'cancelled';
  const elapsed = Date.now() - job.submittedAt;
  if (elapsed < job.durationMs) return 'running';
  return job.shouldFail ? 'failed' : 'completed';
}

/** Reset between tests so mock state never leaks across cases. */
export function resetMockMedia(): void {
  jobsByKey.clear();
  jobsById.clear();
  uploads.clear();
}
