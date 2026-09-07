import { createHash } from 'node:crypto';
import type {
  ChatInput, ChatResult, EmbedInput, EmbedResult, HealthResult,
  ModelDescriptor, ProviderAdapter, ProviderContext,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';

/**
 * Spec §96 — MockLLM. Deterministic: the same input always produces the same
 * output, so tests and demos are reproducible and the whole application can be
 * exercised with no external AI at all.
 */
const CAPABILITIES: Capability[] = ['chat', 'streaming', 'structured_output', 'embeddings', 'tool_calling'];

const MODELS: ModelDescriptor[] = [
  {
    id: 'mock-chat',
    name: 'Mock Chat',
    capabilities: ['chat', 'streaming', 'structured_output', 'tool_calling'],
    contextWindow: 8192,
    costPerUnitMinor: 0,
    costUnit: '1k_tokens',
  },
  {
    id: 'mock-embed',
    name: 'Mock Embeddings',
    capabilities: ['embeddings'],
    contextWindow: 8192,
    costPerUnitMinor: 0,
    costUnit: '1k_tokens',
  },
];

/** A stable pseudo-random stream seeded by a string. */
function seeded(seed: string): () => number {
  let h = createHash('sha256').update(seed).digest().readUInt32BE(0) || 1;
  return () => {
    h ^= h << 13; h >>>= 0;
    h ^= h >> 17;
    h ^= h << 5; h >>>= 0;
    return h / 0xffffffff;
  };
}

export const mockLlmAdapter: ProviderAdapter = {
  key: 'mock_llm',
  label: 'Mock LLM',
  kind: 'llm',
  declaredCapabilities: CAPABILITIES,
  authKind: 'none',
  requiresServerSideCredentials: false,

  async health(): Promise<HealthResult> {
    return {
      state: 'connected',
      detail: 'Mock provider is always available.',
      probes: [
        { step: 'reachability', ok: true, latencyMs: 0 },
        { step: 'authentication', ok: true, detail: 'No authentication required.' },
        { step: 'models', ok: true, detail: `${MODELS.length} models` },
        { step: 'chat', ok: true },
        { step: 'embedding', ok: true },
      ],
      checkedAt: new Date().toISOString(),
    };
  },

  async capabilities(): Promise<Capability[]> {
    return CAPABILITIES;
  },

  async models(): Promise<ModelDescriptor[]> {
    return MODELS;
  },

  async chat(_ctx: ProviderContext, input: ChatInput): Promise<ChatResult> {
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    const prompt = lastUser?.content ?? '';

    // Structured output is echoed back as a schema-shaped object so callers
    // that expect JSON get valid JSON without a real model.
    if (input.responseSchema) {
      return {
        text: JSON.stringify(synthesiseFromSchema(input.responseSchema, prompt)),
        toolCalls: [],
        finishReason: 'stop',
        usage: { promptTokens: estimateTokens(input.messages), completionTokens: 32, totalTokens: 0 },
        costMinor: 0,
      };
    }

    return {
      text: mockReply(prompt),
      toolCalls: [],
      finishReason: 'stop',
      usage: {
        promptTokens: estimateTokens(input.messages),
        completionTokens: 24,
        totalTokens: estimateTokens(input.messages) + 24,
      },
      costMinor: 0,
    };
  },

  async *chatStream(_ctx: ProviderContext, input: ChatInput): AsyncIterable<string> {
    const lastUser = [...input.messages].reverse().find((m) => m.role === 'user');
    for (const token of mockReply(lastUser?.content ?? '').split(/(\s+)/)) {
      yield token;
    }
  },

  async embed(_ctx: ProviderContext, input: EmbedInput): Promise<EmbedResult> {
    // 384 dimensions, unit-normalised, derived from the text hash. Similar
    // strings produce similar vectors, which is enough to exercise the drift
    // and retrieval code paths without an embedding model.
    const vectors = input.texts.map((text) => {
      const rand = seeded(text.toLowerCase().trim());
      const raw = Array.from({ length: 384 }, () => rand() * 2 - 1);
      const norm = Math.sqrt(raw.reduce((s, v) => s + v * v, 0)) || 1;
      return raw.map((v) => v / norm);
    });
    return { vectors, model: input.model, usage: { totalTokens: input.texts.join(' ').length / 4 } };
  },
};

/**
 * The reply is intentionally disclosure-compliant: it admits to being an AI
 * when asked, so the policy guard's happy path is exercised by default.
 */
function mockReply(prompt: string): string {
  const p = prompt.toLowerCase();
  if (/\bare\s+you\s+(a\s+)?(real|human|bot|ai)/.test(p)) {
    return "I'm an AI character, not a real person — but I'm glad you asked. What can I help you with?";
  }
  if (/\b(price|cost|how much|buy)\b/.test(p)) {
    return 'Happy to walk you through the options whenever you like.';
  }
  if (/\?\s*$/.test(prompt)) {
    return 'Good question. Here is a mock response generated without any external model.';
  }
  return 'This is a mock response. No external AI provider was contacted.';
}

function estimateTokens(messages: ChatInput['messages']): number {
  return Math.ceil(messages.reduce((n, m) => n + m.content.length, 0) / 4);
}

/** Produce a minimal value satisfying the top level of a JSON Schema. */
function synthesiseFromSchema(schema: Record<string, unknown>, seed: string): unknown {
  const type = schema.type as string | undefined;
  if (type === 'object' || schema.properties) {
    const props = (schema.properties ?? {}) as Record<string, Record<string, unknown>>;
    return Object.fromEntries(
      Object.entries(props).map(([key, sub]) => [key, synthesiseFromSchema(sub, `${seed}:${key}`)]),
    );
  }
  if (type === 'array') {
    const items = (schema.items ?? { type: 'string' }) as Record<string, unknown>;
    return [synthesiseFromSchema(items, seed)];
  }
  if (Array.isArray(schema.enum) && schema.enum.length > 0) return schema.enum[0];
  if (type === 'number' || type === 'integer') return Math.round(seeded(seed)() * 100);
  if (type === 'boolean') return seeded(seed)() > 0.5;
  return `mock:${seed.slice(0, 24)}`;
}
