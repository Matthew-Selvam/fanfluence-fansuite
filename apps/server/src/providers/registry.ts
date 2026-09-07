import type { ProviderAdapter } from './types.js';
import { mockLlmAdapter } from './mock/mockLlm.js';
import { mockMediaAdapter } from './mock/mockMedia.js';
import { mockPublishingAdapter } from './mock/mockPublishing.js';
import { ollamaAdapter } from './llm/ollama.js';
import { lmStudioAdapter } from './llm/lmStudio.js';
import { anthropicCompatibleAdapter, customOpenAiAdapter } from './llm/customLlm.js';
import { higgsfieldAdapter } from './media/higgsfield.js';
import { wavespeedAdapter } from './media/wavespeed.js';
import { openDispatchAdapter } from './publishing/openDispatch.js';
import { notFound } from '../core/errors.js';

/**
 * Spec §118 — the integration registry. Adding a connector is a matter of
 * writing an adapter and listing it here; nothing in the domain, service or
 * API layers changes.
 */
export class IntegrationRegistry {
  private readonly adapters = new Map<string, ProviderAdapter>();

  constructor(adapters: ProviderAdapter[] = []) {
    for (const adapter of adapters) this.register(adapter);
  }

  register(adapter: ProviderAdapter): this {
    this.adapters.set(adapter.key, adapter);
    return this;
  }

  get(key: string): ProviderAdapter {
    const adapter = this.adapters.get(key);
    if (!adapter) throw notFound('provider adapter', key);
    return adapter;
  }

  has(key: string): boolean {
    return this.adapters.has(key);
  }

  list(): ProviderAdapter[] {
    return [...this.adapters.values()];
  }

  byKind(kind: ProviderAdapter['kind']): ProviderAdapter[] {
    return this.list().filter((a) => a.kind === kind);
  }

  /** Metadata for the "Connect Provider" wizard (§26). */
  catalog() {
    return this.list().map((a) => ({
      key: a.key,
      label: a.label,
      kind: a.kind,
      declaredCapabilities: a.declaredCapabilities,
      defaultEndpoint: a.defaultEndpoint ?? null,
      authKind: a.authKind,
      requiresServerSideCredentials: a.requiresServerSideCredentials,
      isMock: a.key.startsWith('mock_'),
    }));
  }
}

/**
 * Spec §96 — the mocks are part of the default registry, not a test fixture.
 * They are what makes "the entire application can be developed and demonstrated
 * without external AI" true out of the box.
 */
export function createDefaultRegistry(): IntegrationRegistry {
  return new IntegrationRegistry([
    mockLlmAdapter,
    mockMediaAdapter,
    mockPublishingAdapter,
    ollamaAdapter,
    lmStudioAdapter,
    customOpenAiAdapter,
    anthropicCompatibleAdapter,
    higgsfieldAdapter,
    wavespeedAdapter,
    openDispatchAdapter,
  ]);
}
