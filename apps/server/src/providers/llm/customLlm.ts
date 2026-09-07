import { createOpenAiCompatibleAdapter } from './openaiCompatible.js';
import { authHeaders, httpJson, joinUrl } from '../http.js';
import type {
  ChatInput, ChatResult, EmbedInput, EmbedResult, HealthResult,
  ModelDescriptor, ProviderAdapter, ProviderContext,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';
import { AppError } from '../../core/errors.js';

/**
 * Spec §30 — the generic custom connector. The user supplies name, endpoint,
 * auth and model; the advanced fields let them point each operation at a
 * different path when a server deviates from the OpenAI convention.
 */
export const customOpenAiAdapter = createOpenAiCompatibleAdapter({
  key: 'custom_openai',
  label: 'Custom (OpenAI-compatible)',
  authKind: 'bearer',
  requiresServerSideCredentials: true,
});

// ── Anthropic-compatible ────────────────────────────────────────────────────

interface AnthropicResponse {
  content?: Array<{ type: string; text?: string; id?: string; name?: string; input?: Record<string, unknown> }>;
  stop_reason?: string;
  usage?: { input_tokens?: number; output_tokens?: number };
}

const ANTHROPIC_CAPABILITIES: Capability[] = ['chat', 'streaming', 'tool_calling', 'vision'];

export const anthropicCompatibleAdapter: ProviderAdapter = {
  key: 'custom_anthropic',
  label: 'Custom (Anthropic-compatible)',
  kind: 'llm',
  declaredCapabilities: ANTHROPIC_CAPABILITIES,
  defaultEndpoint: 'https://api.anthropic.com/v1',
  authKind: 'api_key_header',
  requiresServerSideCredentials: true,

  async health(ctx: ProviderContext): Promise<HealthResult> {
    const checkedAt = new Date().toISOString();
    const t0 = Date.now();
    try {
      await this.chat!(ctx, {
        model: (ctx.config.defaultModel as string) ?? 'claude-sonnet-5',
        messages: [{ role: 'user', content: 'ping' }],
        maxTokens: 8,
      });
      return {
        state: 'connected',
        detail: 'Test completion succeeded.',
        probes: [
          { step: 'reachability', ok: true, latencyMs: Date.now() - t0 },
          { step: 'authentication', ok: true },
          { step: 'chat', ok: true },
        ],
        checkedAt,
      };
    } catch (error) {
      const appError = error instanceof AppError ? error : null;
      return {
        state: appError?.code === 'PROVIDER_AUTH' ? 'auth_error' : 'unavailable',
        detail: appError?.message ?? String(error),
        probes: [{ step: 'chat', ok: false, detail: appError?.reason, latencyMs: Date.now() - t0 }],
        checkedAt,
      };
    }
  },

  async capabilities(): Promise<Capability[]> {
    return ANTHROPIC_CAPABILITIES;
  },

  /**
   * Anthropic-compatible servers do not all expose a model list, so the
   * configured models are used and the catalog stays user-driven.
   */
  async models(ctx: ProviderContext): Promise<ModelDescriptor[]> {
    const configured = (ctx.config.models as string[] | undefined) ?? [];
    return configured.map((id) => ({
      id,
      name: id,
      capabilities: ANTHROPIC_CAPABILITIES,
      inputTypes: ['text', 'image'],
      outputTypes: ['text'],
      available: true,
    }));
  },

  async chat(ctx: ProviderContext, input: ChatInput): Promise<ChatResult> {
    const endpoint = ctx.endpoint ?? anthropicCompatibleAdapter.defaultEndpoint!;
    const system = input.messages.filter((m) => m.role === 'system').map((m) => m.content).join('\n\n');
    const turns = input.messages
      .filter((m) => m.role === 'user' || m.role === 'assistant')
      .map((m) => ({ role: m.role, content: m.content }));

    const { body } = await httpJson<AnthropicResponse>(joinUrl(endpoint, '/messages'), {
      method: 'POST',
      headers: {
        ...authHeaders('api_key_header', ctx.credential, 'x-api-key'),
        'anthropic-version': (ctx.config.anthropicVersion as string) ?? '2023-06-01',
      },
      body: {
        model: input.model,
        max_tokens: input.maxTokens ?? 1024,
        ...(system ? { system } : {}),
        messages: turns,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.stop?.length ? { stop_sequences: input.stop } : {}),
        ...(input.tools?.length
          ? { tools: input.tools.map((t) => ({ name: t.name, description: t.description, input_schema: t.parameters })) }
          : {}),
      },
      provider: 'Anthropic-compatible endpoint',
      signal: ctx.signal,
      timeoutMs: 120_000,
    });

    const text = (body.content ?? []).filter((b) => b.type === 'text').map((b) => b.text ?? '').join('');
    const toolCalls = (body.content ?? [])
      .filter((b) => b.type === 'tool_use')
      .map((b) => ({ id: b.id ?? '', name: b.name ?? '', arguments: b.input ?? {} }));

    return {
      text,
      toolCalls,
      finishReason:
        body.stop_reason === 'tool_use' ? 'tool_calls'
        : body.stop_reason === 'max_tokens' ? 'length'
        : 'stop',
      usage: {
        promptTokens: body.usage?.input_tokens,
        completionTokens: body.usage?.output_tokens,
        totalTokens: (body.usage?.input_tokens ?? 0) + (body.usage?.output_tokens ?? 0),
      },
    };
  },

  async embed(_ctx: ProviderContext, _input: EmbedInput): Promise<EmbedResult> {
    throw new AppError('CAPABILITY_UNSUPPORTED', 'This endpoint does not provide embeddings', {
      reason: 'Anthropic-compatible endpoints do not expose an embeddings API.',
      affected: 'embeddings',
      remediation: ['open_settings'],
      retryable: false,
    });
  },
};
