import type { Capability } from '../domain/capabilities.js';
import type { HealthState } from '../domain/health.js';

/**
 * Spec §42 — the common internal interface every provider implements.
 *
 * Application code calls `media.generate(...)`, never `higgsfield.generate(...)`.
 * Adding a provider means writing an adapter against this interface and
 * registering it; no domain or API code changes.
 */

export interface ProviderContext {
  workspaceId: string;
  providerId: string;
  endpoint: string | null;
  config: Record<string, unknown>;
  /** Resolved secret. Never logged, never persisted outside the secret store. */
  credential: string | null;
  signal?: AbortSignal;
}

export interface HealthProbe {
  step: 'reachability' | 'authentication' | 'models' | 'chat' | 'streaming' | 'tool_call' | 'structured_output' | 'embedding';
  ok: boolean;
  detail?: string;
  latencyMs?: number;
}

/** Spec §31 — a health result is a state plus the probes that produced it. */
export interface HealthResult {
  state: HealthState;
  detail: string;
  probes: HealthProbe[];
  checkedAt: string;
}

/** Spec §115 */
export interface ModelDescriptor {
  id: string;
  name: string;
  capabilities: Capability[];
  inputTypes?: string[];
  outputTypes?: string[];
  /** JSON Schema the UI turns into a form (§116). */
  paramSchema?: Record<string, unknown>;
  contextWindow?: number;
  maxResolution?: string;
  maxDurationMs?: number;
  costPerUnitMinor?: number;
  costUnit?: string;
  available?: boolean;
}

export interface UploadInput {
  filename: string;
  mimeType: string;
  data: Buffer;
}

export interface UploadResult {
  /** Provider-side handle to reference this file in a later generate call. */
  ref: string;
  url?: string;
}

export type GenerationKind = 'image' | 'video' | 'audio';

export interface GenerateInput {
  kind: GenerationKind;
  model: string;
  prompt: string;
  negativePrompt?: string;
  /** Provider-side refs from `upload`, or public URLs the provider can fetch. */
  referenceRefs?: string[];
  characterReferenceRefs?: string[];
  aspect?: string;
  resolution?: string;
  durationMs?: number;
  seed?: number;
  variants?: number;
  /** Model-specific parameters, validated against the model's paramSchema. */
  params?: Record<string, unknown>;
  /** Spec §73 — passed to the provider where supported. */
  idempotencyKey: string;
  webhookUrl?: string;
}

export type GenerationState = 'submitted' | 'running' | 'completed' | 'failed' | 'cancelled' | 'unknown';

export interface GenerationHandle {
  /** The provider's own id. This, not a resubmission, is how a result is fetched. */
  externalId: string;
  state: GenerationState;
  /** Recommended delay before the first poll. */
  pollAfterMs?: number;
  raw?: unknown;
}

export interface GenerationOutput {
  url?: string;
  data?: Buffer;
  mimeType?: string;
  width?: number;
  height?: number;
  durationMs?: number;
  metadata?: Record<string, unknown>;
}

export interface GenerationResult {
  externalId: string;
  state: GenerationState;
  progress?: number;
  outputs: GenerationOutput[];
  error?: string;
  costMinor?: number;
  creditsUsed?: number;
  raw?: unknown;
}

// ── LLM ─────────────────────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  toolCallId?: string;
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatInput {
  model: string;
  messages: ChatMessage[];
  temperature?: number;
  maxTokens?: number;
  stop?: string[];
  tools?: ToolDefinition[];
  /** JSON Schema; only sent when the provider advertises `structured_output`. */
  responseSchema?: Record<string, unknown>;
  stream?: boolean;
}

export interface ChatToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ChatResult {
  text: string;
  toolCalls: ChatToolCall[];
  finishReason: 'stop' | 'length' | 'tool_calls' | 'content_filter' | 'error' | 'unknown';
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
  costMinor?: number;
  raw?: unknown;
}

export interface EmbedInput {
  model: string;
  texts: string[];
}

export interface EmbedResult {
  vectors: number[][];
  model: string;
  usage?: { totalTokens?: number };
}

// ── Publishing ──────────────────────────────────────────────────────────────

export interface PublishInput {
  platform: string;
  accountHandle?: string;
  caption?: string;
  media: Array<{ url?: string; ref?: string; mimeType?: string }>;
  scheduledAt?: string;
  idempotencyKey: string;
  /** Spec §94/§95 — sandbox must never reach a production channel. */
  sandbox: boolean;
}

export type PublishState = 'queued' | 'publishing' | 'published' | 'failed' | 'dead';

export interface PublishHandle {
  externalId: string;
  state: PublishState;
  raw?: unknown;
}

export interface PublishResult {
  externalId: string;
  state: PublishState;
  permalink?: string;
  error?: string;
  raw?: unknown;
}

// ── The adapter contract ────────────────────────────────────────────────────

export interface ProviderAdapter {
  /** Registry key, e.g. `ollama`, `higgsfield`, `open_dispatch`, `mock_llm`. */
  readonly key: string;
  readonly label: string;
  readonly kind: 'llm' | 'media' | 'publishing' | 'embedding' | 'storage';
  /** Everything this adapter could support; the probe narrows it per install. */
  readonly declaredCapabilities: Capability[];
  /** Default endpoint offered by the connection wizard. */
  readonly defaultEndpoint?: string;
  readonly authKind: 'none' | 'bearer' | 'api_key_header' | 'basic' | 'oauth2';
  /** True when credentials must stay server-side (§40). */
  readonly requiresServerSideCredentials: boolean;

  health(ctx: ProviderContext): Promise<HealthResult>;
  capabilities(ctx: ProviderContext): Promise<Capability[]>;
  models(ctx: ProviderContext): Promise<ModelDescriptor[]>;

  upload?(ctx: ProviderContext, input: UploadInput): Promise<UploadResult>;
  generate?(ctx: ProviderContext, input: GenerateInput): Promise<GenerationHandle>;
  status?(ctx: ProviderContext, externalId: string): Promise<GenerationResult>;
  result?(ctx: ProviderContext, externalId: string): Promise<GenerationResult>;
  cancel?(ctx: ProviderContext, externalId: string): Promise<void>;

  chat?(ctx: ProviderContext, input: ChatInput): Promise<ChatResult>;
  chatStream?(ctx: ProviderContext, input: ChatInput): AsyncIterable<string>;
  embed?(ctx: ProviderContext, input: EmbedInput): Promise<EmbedResult>;

  publish?(ctx: ProviderContext, input: PublishInput): Promise<PublishHandle>;
  publishStatus?(ctx: ProviderContext, externalId: string): Promise<PublishResult>;
  retryPublish?(ctx: ProviderContext, externalId: string): Promise<PublishHandle>;
  adaptCaption?(ctx: ProviderContext, input: { text: string; platform: string }): Promise<string>;
  transcode?(ctx: ProviderContext, input: { url: string; platform: string }): Promise<{ url: string }>;

  /** Verify an inbound webhook and map it to a provider-neutral shape (§117). */
  verifyWebhook?(
    ctx: ProviderContext,
    input: { headers: Record<string, string>; rawBody: string },
  ): { valid: boolean; externalEventId?: string };
  parseWebhook?(body: unknown): {
    externalId: string;
    state: GenerationState | PublishState;
    outputs?: GenerationOutput[];
    error?: string;
  } | null;
}
