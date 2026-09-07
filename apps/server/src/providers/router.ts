import { and, asc, eq, isNull } from 'drizzle-orm';
import { providers as providersTable } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import type { Logger } from '../core/logger.js';
import { AppError } from '../core/errors.js';
import { isUsable, type HealthState } from '../domain/health.js';
import { supports, type Capability } from '../domain/capabilities.js';
import type { IntegrationRegistry } from './registry.js';
import type { ProviderAdapter, ProviderContext } from './types.js';
import type { SecretStore } from '../services/secrets.js';
import { validateEndpoint } from './egress.js';

export type ProviderRow = typeof providersTable.$inferSelect;

export interface ResolvedProvider {
  row: ProviderRow;
  adapter: ProviderAdapter;
  ctx: ProviderContext;
}

export interface RouteRequest {
  workspaceId: string;
  capability: Capability;
  kind: ProviderAdapter['kind'];
  /** Pin to one provider; routing is skipped and a missing capability is an error. */
  providerId?: string | null;
  /** Restrict routing to an allowlist — used by autonomy guardrails (§35). */
  allowedProviderIds?: string[] | null;
  signal?: AbortSignal;
}

/**
 * Spec §71/§72 — the provider router.
 *
 * Selection is policy-driven (capability → allowed → health → priority), and
 * failover walks the ordered candidates. The one rule that overrides
 * everything: a billable operation is never automatically duplicated, so
 * failover is refused once a submission has been attempted unless the caller
 * states the operation is idempotent.
 */
export class ProviderRouter {
  constructor(
    private readonly db: Db,
    private readonly registry: IntegrationRegistry,
    private readonly secrets: SecretStore,
    private readonly log: Logger,
  ) {}

  /** Ordered candidates: healthy first, then by configured priority. */
  candidates(request: RouteRequest): ResolvedProvider[] {
    const rows = this.db
      .select()
      .from(providersTable)
      .where(
        and(
          eq(providersTable.workspaceId, request.workspaceId),
          eq(providersTable.kind, request.kind),
          eq(providersTable.enabled, true),
          isNull(providersTable.deletedAt),
        ),
      )
      .orderBy(asc(providersTable.priority))
      .all();

    const filtered = rows.filter((row) => {
      if (request.providerId && row.id !== request.providerId) return false;
      if (request.allowedProviderIds && !request.allowedProviderIds.includes(row.id)) return false;
      if (!this.registry.has(row.adapter)) return false;
      // A provider that has never been probed has null capabilities; trust the
      // adapter's declaration until the first health check narrows it.
      const advertised = row.capabilities ?? this.registry.get(row.adapter).declaredCapabilities;
      return supports(advertised, request.capability);
    });

    const usable = filtered.filter((row) => isUsable(row.health as HealthState));
    const ordered = [...usable, ...filtered.filter((r) => !usable.includes(r))];

    return ordered.map((row) => this.resolve(row, request.signal));
  }

  /** The first usable provider, or an actionable error explaining what is missing. */
  select(request: RouteRequest): ResolvedProvider {
    const [first] = this.candidates(request);
    if (first) return first;
    throw this.noProviderError(request);
  }

  /**
   * Run `operation` against candidates in order.
   *
   * `idempotent` must be true before a failed attempt is retried on another
   * provider. For submissions this is false, so a lost response is surfaced
   * rather than turned into a second billed job (§41, §72, §73).
   */
  async withFailover<T>(
    request: RouteRequest & { idempotent: boolean },
    operation: (provider: ResolvedProvider) => Promise<T>,
  ): Promise<{ result: T; provider: ResolvedProvider; attempts: number }> {
    const candidates = this.candidates(request);
    if (candidates.length === 0) throw this.noProviderError(request);

    let lastError: unknown;
    let attempts = 0;

    for (const provider of candidates) {
      attempts++;
      try {
        const result = await operation(provider);
        return { result, provider, attempts };
      } catch (error) {
        lastError = error;
        const appError = error instanceof AppError ? error : null;

        this.log.warn('provider attempt failed', {
          providerId: provider.row.id,
          adapter: provider.row.adapter,
          capability: request.capability,
          code: appError?.code,
          message: appError?.message ?? String(error),
        });

        if (appError?.code === 'PROVIDER_AUTH') {
          this.markHealth(provider.row.id, 'auth_error', appError.message);
        } else if (appError?.code === 'RATE_LIMITED') {
          this.markHealth(provider.row.id, 'rate_limited', appError.message);
        } else if (appError?.code === 'PROVIDER_UNAVAILABLE') {
          this.markHealth(provider.row.id, 'unavailable', appError.message);
        }

        // Non-idempotent operations stop at the first failure. Trying the next
        // provider could mean paying twice for one user action.
        if (!request.idempotent) {
          throw appError ?? error;
        }
        // A hard rejection is not made better by a different provider either.
        if (appError && !appError.retryable && appError.code !== 'PROVIDER_UNAVAILABLE') {
          throw appError;
        }
      }
    }

    throw lastError instanceof AppError
      ? lastError
      : new AppError('PROVIDER_UNAVAILABLE', `All ${request.kind} providers failed`, {
          reason: lastError instanceof Error ? lastError.message : String(lastError),
          affected: request.capability,
          remediation: ['retry', 'open_settings', 'view_logs'],
          retryable: true,
        });
  }

  resolve(row: ProviderRow, signal?: AbortSignal): ResolvedProvider {
    const adapter = this.registry.get(row.adapter);
    const endpoint = validateEndpoint(row.endpoint ?? adapter.defaultEndpoint ?? null);
    const ctx: ProviderContext = {
      workspaceId: row.workspaceId,
      providerId: row.id,
      endpoint,
      config: {
        ...((row.config ?? {}) as Record<string, unknown>),
        defaultModel: row.defaultModel,
        embeddingModel: row.embeddingModel,
      },
      credential: row.credentialRef
        ? this.secrets.reveal(row.workspaceId, row.credentialRef)
        : null,
      signal,
    };
    return { row, adapter, ctx };
  }

  byId(workspaceId: string, providerId: string, signal?: AbortSignal): ResolvedProvider {
    const row = this.db
      .select()
      .from(providersTable)
      .where(and(eq(providersTable.id, providerId), eq(providersTable.workspaceId, workspaceId)))
      .get();
    if (!row) {
      throw new AppError('NOT_FOUND', 'Provider not found', {
        reason: `No provider with id ${providerId} in this workspace.`,
        affected: 'provider',
        remediation: ['open_settings'],
      });
    }
    return this.resolve(row, signal);
  }

  markHealth(providerId: string, state: HealthState, detail: string): void {
    this.db
      .update(providersTable)
      .set({ health: state, healthDetail: detail.slice(0, 500), healthCheckedAt: new Date(), updatedAt: new Date() })
      .where(eq(providersTable.id, providerId))
      .run();
  }

  /**
   * Spec §66 — when nothing can serve the request, say what is missing and what
   * the user can do, rather than throwing a bare "no provider".
   */
  private noProviderError(request: RouteRequest): AppError {
    const anyConfigured = this.db
      .select({ id: providersTable.id })
      .from(providersTable)
      .where(
        and(
          eq(providersTable.workspaceId, request.workspaceId),
          eq(providersTable.kind, request.kind),
          isNull(providersTable.deletedAt),
        ),
      )
      .all();

    if (anyConfigured.length === 0) {
      return new AppError('CAPABILITY_UNSUPPORTED', `No ${request.kind} provider is connected`, {
        reason: `This action needs the "${request.capability}" capability, and no ${request.kind} provider is configured.`,
        affected: request.capability,
        remediation: ['open_settings'],
        retryable: false,
      });
    }

    return new AppError('CAPABILITY_UNSUPPORTED', `No connected provider supports "${request.capability}"`, {
      reason: `${anyConfigured.length} ${request.kind} provider(s) are configured, but none advertises this capability or is currently healthy.`,
      affected: request.capability,
      remediation: ['open_settings', 'retry', 'view_logs'],
      retryable: false,
    });
  }
}
