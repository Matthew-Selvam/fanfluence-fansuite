import { randomUUID } from 'node:crypto';
import type {
  HealthResult, ModelDescriptor, ProviderAdapter, ProviderContext,
  PublishHandle, PublishInput, PublishResult,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';

/**
 * Spec §96 — MockPublishingProvider. Mirrors Open-Dispatch's queue states so
 * the publishing pipeline can be developed and demonstrated without any real
 * social account being touched.
 */
interface MockPublication {
  externalId: string;
  platform: string;
  queuedAt: number;
  shouldFail: boolean;
  sandbox: boolean;
}

const byKey = new Map<string, MockPublication>();
const byId = new Map<string, MockPublication>();

const CAPABILITIES: Capability[] = ['publish', 'caption_adapt', 'transcode', 'queue_inspect', 'retry'];

const PLATFORM_LIMITS: Record<string, number> = {
  x: 280, bluesky: 300, instagram: 2_200, threads: 500,
  telegram: 4_096, linkedin: 3_000, youtube: 5_000,
};

export const mockPublishingAdapter: ProviderAdapter = {
  key: 'mock_publishing',
  label: 'Mock Publishing Provider',
  kind: 'publishing',
  declaredCapabilities: CAPABILITIES,
  authKind: 'none',
  requiresServerSideCredentials: false,

  async health(): Promise<HealthResult> {
    return {
      state: 'connected',
      detail: 'Mock publishing provider is always available.',
      probes: [{ step: 'reachability', ok: true }, { step: 'authentication', ok: true }],
      checkedAt: new Date().toISOString(),
    };
  },

  async capabilities(): Promise<Capability[]> {
    return CAPABILITIES;
  },

  async models(): Promise<ModelDescriptor[]> {
    return Object.keys(PLATFORM_LIMITS).map((platform) => ({
      id: platform,
      name: platform,
      capabilities: ['publish'],
      outputTypes: ['post'],
      paramSchema: {
        type: 'object',
        properties: { captionMaxLength: { type: 'integer', default: PLATFORM_LIMITS[platform] } },
      },
    }));
  },

  async publish(_ctx: ProviderContext, input: PublishInput): Promise<PublishHandle> {
    const existing = byKey.get(input.idempotencyKey);
    if (existing) return { externalId: existing.externalId, state: stateOf(existing) };

    const publication: MockPublication = {
      externalId: `mockpub_${randomUUID().slice(0, 12)}`,
      platform: input.platform,
      queuedAt: Date.now(),
      shouldFail: /\[\[mock:fail\]\]/i.test(input.caption ?? ''),
      sandbox: input.sandbox,
    };
    byKey.set(input.idempotencyKey, publication);
    byId.set(publication.externalId, publication);
    return { externalId: publication.externalId, state: 'queued' };
  },

  async publishStatus(_ctx: ProviderContext, externalId: string): Promise<PublishResult> {
    const pub = byId.get(externalId);
    if (!pub) return { externalId, state: 'failed', error: 'No such mock publication' };
    const state = stateOf(pub);
    return {
      externalId,
      state,
      permalink: state === 'published' ? `mock://${pub.platform}/${externalId}` : undefined,
      error: state === 'failed' ? 'Mock provider was asked to fail' : undefined,
    };
  },

  async retryPublish(_ctx: ProviderContext, externalId: string): Promise<PublishHandle> {
    const pub = byId.get(externalId);
    if (!pub) return { externalId, state: 'failed' };
    pub.queuedAt = Date.now();
    pub.shouldFail = false;
    return { externalId, state: 'queued' };
  },

  /** Deterministic truncation on a word boundary — no model involved. */
  async adaptCaption(_ctx: ProviderContext, input: { text: string; platform: string }): Promise<string> {
    const limit = PLATFORM_LIMITS[input.platform] ?? 1_000;
    if (input.text.length <= limit) return input.text;
    const cut = input.text.slice(0, limit - 1);
    const lastSpace = cut.lastIndexOf(' ');
    return `${(lastSpace > limit * 0.6 ? cut.slice(0, lastSpace) : cut).trimEnd()}…`;
  },

  async transcode(_ctx: ProviderContext, input: { url: string; platform: string }): Promise<{ url: string }> {
    return { url: `${input.url}#transcoded-for-${input.platform}` };
  },
};

function stateOf(pub: MockPublication): PublishResult['state'] {
  if (Date.now() - pub.queuedAt < 300) return 'publishing';
  return pub.shouldFail ? 'failed' : 'published';
}

export function resetMockPublishing(): void {
  byKey.clear();
  byId.clear();
}
