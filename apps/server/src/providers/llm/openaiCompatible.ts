import { authHeaders, httpJson, joinUrl } from '../http.js';
import type {
  ChatInput, ChatResult, ChatToolCall, EmbedInput, EmbedResult,
  HealthProbe, HealthResult, ModelDescriptor, ProviderAdapter, ProviderContext,
} from '../types.js';
import type { Capability } from '../../domain/capabilities.js';
import type { HealthState } from '../../domain/health.js';
import { AppError } from '../../core/errors.js';

/**
 * The OpenAI-compatible chat/embeddings surface. Ollama and LM Studio both
 * expose it at `/v1`, and so does every "custom endpoint" the user might add,
 * so one implementation backs all three adapters (§28, §29, §30).
 */

interface OpenAiModelList {
  data?: Array<{ id: string; owned_by?: string }>;
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: { content?: string | null; tool_calls?: Array<{ id: string; function: { name: string; arguments: string } }> };
    finish_reason?: string;
  }>;
  usage?: { prompt_tokens?: number; completion_tokens?: number; total_tokens?: number };
}

interface OpenAiEmbeddingResponse {
  data?: Array<{ embedding: number[] }>;
  model?: string;
  usage?: { total_tokens?: number };
}

export interface OpenAiCompatibleOptions {
  key: string;
  label: string;
  defaultEndpoint?: string;
  authKind: ProviderAdapter['authKind'];
  apiKeyHeader?: string;
  /** Endpoint paths, overridable for servers that deviate from the convention. */
  paths?: { models?: string; chat?: string; embeddings?: string };
  requiresServerSideCredentials?: boolean;
  /** Extra probes to run during a health check. */
  extraCapabilities?: Capability[];
}

const BASE_CAPABILITIES: Capability[] = ['chat', 'streaming', 'embeddings'];

export function createOpenAiCompatibleAdapter(opts: OpenAiCompatibleOptions): ProviderAdapter {
  const paths = {
    models: opts.paths?.models ?? '/models',
    chat: opts.paths?.chat ?? '/chat/completions',
    embeddings: opts.paths?.embeddings ?? '/embeddings',
  };

  const base = (ctx: ProviderContext): string => {
    const endpoint = ctx.endpoint ?? opts.defaultEndpoint;
    if (!endpoint) {
      throw new AppError('PROVIDER_ERROR', `${opts.label} has no endpoint configured`, {
        reason: 'This provider needs a base URL before it can be used.',
        affected: opts.label,
        remediation: ['open_settings'],
        retryable: false,
      });
    }
    return endpoint;
  };

  const headers = (ctx: ProviderContext) =>
    authHeaders(opts.authKind, ctx.credential, opts.apiKeyHeader);

  const adapter: ProviderAdapter = {
    key: opts.key,
    label: opts.label,
    kind: 'llm',
    declaredCapabilities: [...BASE_CAPABILITIES, ...(opts.extraCapabilities ?? [])],
    defaultEndpoint: opts.defaultEndpoint,
    authKind: opts.authKind,
    requiresServerSideCredentials: opts.requiresServerSideCredentials ?? opts.authKind !== 'none',

    /**
     * Spec §31 — probes run in dependency order and stop at the first hard
     * failure, so the reported state names the actual cause rather than a
     * downstream symptom.
     */
    async health(ctx: ProviderContext): Promise<HealthResult> {
      const probes: HealthProbe[] = [];
      const checkedAt = new Date().toISOString();
      let models: ModelDescriptor[] = [];

      const t0 = Date.now();
      try {
        models = await adapter.models(ctx);
        probes.push({ step: 'reachability', ok: true, latencyMs: Date.now() - t0 });
        probes.push({ step: 'authentication', ok: true });
        probes.push({ step: 'models', ok: true, detail: `${models.length} models available` });
      } catch (error) {
        const appError = error instanceof AppError ? error : null;
        const state: HealthState =
          appError?.code === 'PROVIDER_AUTH' ? 'auth_error' : 'unavailable';
        probes.push({
          step: appError?.code === 'PROVIDER_AUTH' ? 'authentication' : 'reachability',
          ok: false,
          detail: appError?.reason ?? String(error),
          latencyMs: Date.now() - t0,
        });
        return { state, detail: appError?.message ?? String(error), probes, checkedAt };
      }

      if (models.length === 0) {
        probes.push({ step: 'models', ok: false, detail: 'Server reported no models.' });
        return {
          state: 'model_missing',
          detail: `${opts.label} is reachable but has no models installed.`,
          probes,
          checkedAt,
        };
      }

      const probeModel = ctx.config.defaultModel as string | undefined;
      const model = probeModel ?? models[0]!.id;
      const t1 = Date.now();
      try {
        await adapter.chat!(ctx, {
          model,
          messages: [{ role: 'user', content: 'ping' }],
          maxTokens: 8,
        });
        probes.push({ step: 'chat', ok: true, latencyMs: Date.now() - t1 });
      } catch (error) {
        probes.push({
          step: 'chat',
          ok: false,
          detail: error instanceof Error ? error.message : String(error),
          latencyMs: Date.now() - t1,
        });
        return {
          state: 'degraded',
          detail: `${opts.label} lists models but a test completion failed.`,
          probes,
          checkedAt,
        };
      }

      return { state: 'connected', detail: `${models.length} models available.`, probes, checkedAt };
    },

    /**
     * Spec §32 — capabilities are what the server actually demonstrated, not
     * what the adapter hopes for. Tool calling and structured output are only
     * claimed when a probe succeeds.
     */
    async capabilities(ctx: ProviderContext): Promise<Capability[]> {
      const found: Capability[] = ['chat', 'streaming'];

      try {
        const models = await adapter.models(ctx);
        const model = (ctx.config.defaultModel as string | undefined) ?? models[0]?.id;
        if (!model) return found;

        try {
          const result = await adapter.chat!(ctx, {
            model,
            messages: [{ role: 'user', content: 'Return the JSON {"ok":true}.' }],
            responseSchema: { type: 'object', properties: { ok: { type: 'boolean' } } },
            maxTokens: 32,
          });
          JSON.parse(result.text);
          found.push('structured_output');
        } catch {
          // Structured output is genuinely optional; absence is not an error.
        }

        try {
          const result = await adapter.chat!(ctx, {
            model,
            messages: [{ role: 'user', content: 'What is the weather in Paris?' }],
            tools: [{
              name: 'get_weather',
              description: 'Get the weather for a city',
              parameters: { type: 'object', properties: { city: { type: 'string' } }, required: ['city'] },
            }],
            maxTokens: 64,
          });
          if (result.toolCalls.length > 0) found.push('tool_calling');
        } catch {
          // Same: tool calling is model-dependent.
        }

        const embedModel = (ctx.config.embeddingModel as string | undefined) ?? model;
        try {
          await adapter.embed!(ctx, { model: embedModel, texts: ['ping'] });
          found.push('embeddings');
        } catch {
          // No embedding model installed — vector search stays disabled (§109).
        }
      } catch {
        return found;
      }

      return found;
    },

    async models(ctx: ProviderContext): Promise<ModelDescriptor[]> {
      const { body } = await httpJson<OpenAiModelList>(joinUrl(base(ctx), paths.models), {
        method: 'GET',
        headers: headers(ctx),
        provider: opts.label,
        signal: ctx.signal,
        timeoutMs: 10_000,
      });

      return (body.data ?? []).map((m) => ({
        id: m.id,
        name: m.id,
        capabilities: ['chat', 'streaming'] as Capability[],
        inputTypes: ['text'],
        outputTypes: ['text'],
        available: true,
      }));
    },

    async chat(ctx: ProviderContext, input: ChatInput): Promise<ChatResult> {
      const payload: Record<string, unknown> = {
        model: input.model,
        messages: input.messages.map((m) => ({
          role: m.role,
          content: m.content,
          ...(m.name ? { name: m.name } : {}),
          ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
        })),
        stream: false,
      };
      if (input.temperature !== undefined) payload.temperature = input.temperature;
      if (input.maxTokens !== undefined) payload.max_tokens = input.maxTokens;
      if (input.stop?.length) payload.stop = input.stop;
      if (input.tools?.length) {
        payload.tools = input.tools.map((t) => ({
          type: 'function',
          function: { name: t.name, description: t.description, parameters: t.parameters },
        }));
      }
      if (input.responseSchema) {
        payload.response_format = {
          type: 'json_schema',
          json_schema: { name: 'response', schema: input.responseSchema, strict: true },
        };
      }

      const { body } = await httpJson<OpenAiChatResponse>(joinUrl(base(ctx), paths.chat), {
        method: 'POST',
        headers: headers(ctx),
        body: payload,
        provider: opts.label,
        signal: ctx.signal,
        timeoutMs: 120_000,
      });

      const choice = body.choices?.[0];
      const toolCalls: ChatToolCall[] = (choice?.message?.tool_calls ?? []).map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: safeParseJson(tc.function.arguments),
      }));

      return {
        text: choice?.message?.content ?? '',
        toolCalls,
        finishReason: mapFinishReason(choice?.finish_reason),
        usage: {
          promptTokens: body.usage?.prompt_tokens,
          completionTokens: body.usage?.completion_tokens,
          totalTokens: body.usage?.total_tokens,
        },
      };
    },

    async *chatStream(ctx: ProviderContext, input: ChatInput): AsyncIterable<string> {
      const response = await fetch(joinUrl(base(ctx), paths.chat), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...headers(ctx) },
        body: JSON.stringify({
          model: input.model,
          messages: input.messages.map((m) => ({ role: m.role, content: m.content })),
          stream: true,
          ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
          ...(input.maxTokens !== undefined ? { max_tokens: input.maxTokens } : {}),
        }),
        signal: ctx.signal ?? null,
      });

      if (!response.ok || !response.body) {
        throw new AppError('PROVIDER_ERROR', `${opts.label} streaming request failed`, {
          reason: `Upstream responded ${response.status}.`,
          affected: opts.label,
          remediation: ['retry', 'view_logs'],
          retryable: response.status >= 500,
        });
      }

      // Server-sent events; frames can split mid-line, so buffer across chunks.
      const decoder = new TextDecoder();
      let buffer = '';
      for await (const chunk of response.body as unknown as AsyncIterable<Uint8Array>) {
        buffer += decoder.decode(chunk, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;
          const data = trimmed.slice(5).trim();
          if (data === '[DONE]') return;
          const delta = safeParseJson(data) as {
            choices?: Array<{ delta?: { content?: string } }>;
          };
          const text = delta.choices?.[0]?.delta?.content;
          if (text) yield text;
        }
      }
    },

    async embed(ctx: ProviderContext, input: EmbedInput): Promise<EmbedResult> {
      const { body } = await httpJson<OpenAiEmbeddingResponse>(joinUrl(base(ctx), paths.embeddings), {
        method: 'POST',
        headers: headers(ctx),
        body: { model: input.model, input: input.texts },
        provider: opts.label,
        signal: ctx.signal,
        timeoutMs: 60_000,
      });

      return {
        vectors: (body.data ?? []).map((d) => d.embedding),
        model: body.model ?? input.model,
        usage: { totalTokens: body.usage?.total_tokens },
      };
    },
  };

  return adapter;
}

function mapFinishReason(reason: string | undefined): ChatResult['finishReason'] {
  switch (reason) {
    case 'stop': return 'stop';
    case 'length': return 'length';
    case 'tool_calls': case 'function_call': return 'tool_calls';
    case 'content_filter': return 'content_filter';
    default: return reason ? 'unknown' : 'stop';
  }
}

function safeParseJson(text: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(text);
    return typeof parsed === 'object' && parsed !== null ? (parsed as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}
