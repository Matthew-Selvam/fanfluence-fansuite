import { and, eq, isNull } from 'drizzle-orm';
import { z } from 'zod';
import {
  characters, costRecords, creativeBriefs, generationJobs, generationOutputs,
  homes, mediaAssets, wardrobeItems,
} from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';
import type { EventBus } from '../events/bus.js';
import type { JobQueue } from '../jobs/queue.js';
import type { ProviderRouter } from '../providers/router.js';
import type { MediaService } from './media.js';
import type { RateLimiter } from './rateLimit.js';
import { HOUR_MS } from './rateLimit.js';
import { requirePermission, workspaceOf, type Actor } from './context.js';
import { badRequest, notFound } from '../core/errors.js';
import { idempotencyKey, newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import { CreativeBriefSpec } from '../domain/studio.js';
import type { Capability } from '../domain/capabilities.js';
import { buildPrompt, exportBrief, type PromptInputs } from './prompt.js';

export const CreateBriefInput = z.object({
  title: z.string().min(1).max(300),
  kind: z.enum(['image', 'video', 'audio']),
  characterId: z.string().optional(),
  brandDealId: z.string().optional(),
  campaignId: z.string().optional(),
  scriptId: z.string().optional(),
  spec: CreativeBriefSpec,
  preferredProviderId: z.string().optional(),
  preferredModel: z.string().optional(),
});
export type CreateBriefInput = z.infer<typeof CreateBriefInput>;

const CAPABILITY_FOR_KIND: Record<'image' | 'video' | 'audio', Capability> = {
  image: 'image_generation',
  video: 'video_generation',
  audio: 'audio_generation',
};

/**
 * Spec §151 — the ImageGeneration / VideoGeneration capability.
 *
 * Studio calls `generation.submit(briefId)`. It never names a provider: the
 * router picks one, and a brief remains fully usable (create, edit, export)
 * when no provider exists at all.
 */
export class GenerationService {
  private readonly briefRepo: Repository<typeof creativeBriefs>;

  constructor(
    private readonly db: Db,
    private readonly queue: JobQueue,
    private readonly router: ProviderRouter,
    private readonly media: MediaService,
    private readonly events: EventBus,
    private readonly rateLimiter: RateLimiter,
    private readonly clock: Clock,
  ) {
    this.briefRepo = new Repository(db, creativeBriefs, 'creative brief');
  }

  // ── Briefs ────────────────────────────────────────────────────────────────

  listBriefs(actor: Actor, opts: { characterId?: string; limit?: number; cursor?: string } = {}) {
    requirePermission(actor, 'studio:read');
    return this.briefRepo.list(workspaceOf(actor), {
      limit: opts.limit,
      cursor: opts.cursor,
      where: opts.characterId ? eq(creativeBriefs.characterId, opts.characterId) : undefined,
    });
  }

  getBrief(actor: Actor, id: string) {
    requirePermission(actor, 'studio:read');
    return this.briefRepo.get(workspaceOf(actor), id);
  }

  createBrief(actor: Actor, input: CreateBriefInput) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const row = this.briefRepo.insert({
      id: newId('creativeBrief'),
      workspaceId,
      title: input.title,
      kind: input.kind,
      characterId: input.characterId ?? null,
      brandDealId: input.brandDealId ?? null,
      campaignId: input.campaignId ?? null,
      scriptId: input.scriptId ?? null,
      spec: input.spec,
      preferredProviderId: input.preferredProviderId ?? null,
      preferredModel: input.preferredModel ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });

    this.events.emit({
      workspaceId, type: 'brief.created', characterId: row.characterId,
      entityType: 'brief', entityId: row.id,
      actor: actor.kind, actorId: actor.principal.userId, payload: { kind: row.kind },
    });
    return row;
  }

  updateBrief(actor: Actor, id: string, patch: Partial<CreateBriefInput>) {
    requirePermission(actor, 'studio:write');
    return this.briefRepo.update(workspaceOf(actor), id, patch as never);
  }

  deleteBrief(actor: Actor, id: string) {
    requirePermission(actor, 'studio:write');
    return this.briefRepo.softDelete(workspaceOf(actor), id);
  }

  /**
   * Spec §112 — compile a brief to a prompt. Works with no provider connected;
   * this is the "export prompt, generate elsewhere" path.
   */
  compile(actor: Actor, briefId: string) {
    requirePermission(actor, 'studio:read');
    const workspaceId = workspaceOf(actor);
    const brief = this.briefRepo.get(workspaceId, briefId);
    const inputs = this.promptInputs(workspaceId, brief);
    const built = buildPrompt(inputs);
    return { brief, ...built, markdown: exportBrief(inputs, built) };
  }

  // ── Submission ────────────────────────────────────────────────────────────

  /**
   * Queue a generation. This only enqueues: the actual provider call happens in
   * the worker, so a submission survives a restart and shows up in the job
   * centre either way.
   */
  submit(actor: Actor, briefId: string, opts: { providerId?: string; model?: string } = {}) {
    requirePermission(actor, 'studio:generate');
    const workspaceId = workspaceOf(actor);
    const brief = this.briefRepo.get(workspaceId, briefId);

    // Spec §125 — cap generations per character per hour before anything bills.
    if (brief.characterId) {
      this.rateLimiter.require({
        workspaceId,
        dimension: 'character',
        subject: brief.characterId,
        action: 'generation',
        limit: 60,
        windowMs: HOUR_MS,
      });
    }

    const providerId = opts.providerId ?? brief.preferredProviderId ?? undefined;
    const capability = CAPABILITY_FOR_KIND[brief.kind];

    // Fail fast with an actionable error when nothing can serve the request,
    // rather than queueing a job that is certain to fail.
    const provider = this.router.select({
      workspaceId,
      capability,
      kind: 'media',
      providerId: providerId ?? null,
    });

    const model = opts.model ?? brief.preferredModel ?? provider.row.defaultModel;
    if (!model) {
      throw badRequest('No model selected and the provider has no default model configured');
    }

    const job = this.queue.enqueue({
      workspaceId,
      type: brief.kind === 'video' ? 'generation.video'
        : brief.kind === 'audio' ? 'generation.audio'
        : 'generation.image',
      payload: { briefId, providerId: provider.row.id, model },
      idempotencyKey: idempotencyKey(`gen-${briefId}-${this.clock.nowMs()}`),
      characterId: brief.characterId ?? undefined,
      providerId: provider.row.id,
      createdByUserId: actor.principal.userId,
      automationRunId: actor.automationRunId ?? undefined,
      maxAttempts: 1, // Submission is not idempotent; the poll job handles recovery.
      timeoutMs: brief.kind === 'video' ? 600_000 : 180_000,
    });

    this.briefRepo.update(workspaceId, briefId, { status: 'queued' });

    this.events.emit({
      workspaceId, type: 'generation.started', characterId: brief.characterId,
      entityType: 'job', entityId: job.id,
      actor: actor.kind, actorId: actor.principal.userId,
      payload: { briefId, providerId: provider.row.id, model, kind: brief.kind },
    });

    return job;
  }

  // ── Worker-side operations ────────────────────────────────────────────────

  /**
   * Called by the generation worker. Returns the provider handle; the worker
   * parks the job on it rather than waiting, so a long render does not hold a
   * worker slot.
   */
  async performSubmission(workspaceId: string, jobId: string, payload: { briefId: string; providerId: string; model: string }) {
    const brief = this.briefRepo.get(workspaceId, payload.briefId);
    const provider = this.router.byId(workspaceId, payload.providerId);
    const { prompt, negativePrompt } = buildPrompt(this.promptInputs(workspaceId, brief));

    if (!provider.adapter.generate) {
      throw badRequest(`Provider "${provider.adapter.label}" cannot generate media`);
    }

    const references = this.resolveReferences(workspaceId, brief);
    // A stable key per job means a worker retry cannot become a second billed
    // submission even if the transport failed after the provider accepted (§73).
    const key = `fanfluence-job-${jobId}`;

    const handle = await provider.adapter.generate(provider.ctx, {
      kind: brief.kind,
      model: payload.model,
      prompt,
      negativePrompt,
      referenceRefs: references.referenceUrls,
      characterReferenceRefs: references.characterReferenceUrls,
      aspect: brief.spec.output?.aspect === 'custom' ? brief.spec.output.customAspect : brief.spec.output?.aspect,
      resolution: brief.spec.output?.resolution,
      durationMs: brief.spec.output?.durationMs,
      seed: brief.spec.output?.seed,
      variants: brief.spec.output?.variants,
      idempotencyKey: key,
    });

    this.db.insert(generationJobs).values({
      id: newId('generationJob'),
      workspaceId,
      jobId,
      briefId: brief.id,
      providerId: provider.row.id,
      model: payload.model,
      kind: brief.kind,
      externalId: handle.externalId,
      request: { prompt, negativePrompt, model: payload.model, idempotencyKey: key },
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    }).run();

    return handle;
  }

  /** Poll a parked generation and, when complete, download its outputs. */
  async pollAndCollect(actor: Actor, workspaceId: string, jobId: string) {
    const generation = this.db
      .select().from(generationJobs)
      .where(and(eq(generationJobs.workspaceId, workspaceId), eq(generationJobs.jobId, jobId)))
      .get();
    if (!generation?.externalId) throw notFound('generation job', jobId);

    const provider = this.router.byId(workspaceId, generation.providerId!);
    if (!provider.adapter.result) throw badRequest('Provider cannot report generation results');

    const result = await provider.adapter.result(provider.ctx, generation.externalId);

    this.db.update(generationJobs)
      .set({
        rawResponse: (result.raw ?? null) as Record<string, unknown> | null,
        actualCostMinor: result.costMinor ?? null,
        creditsUsed: result.creditsUsed ?? null,
        updatedAt: this.clock.now(),
      })
      .where(eq(generationJobs.id, generation.id))
      .run();

    if (result.state !== 'completed') return { state: result.state, assets: [], progress: result.progress };

    const brief = generation.briefId ? this.briefRepo.find(workspaceId, generation.briefId) : null;
    const assets = [];

    for (const [index, output] of result.outputs.entries()) {
      const data = output.data ?? (output.url ? await downloadBytes(output.url) : null);
      if (!data) continue;

      const asset = await this.media.upload(actor, data, {
        filename: `${brief?.title ?? 'generation'}-${index + 1}.${extensionFor(output.mimeType)}`,
        mimeType: output.mimeType ?? 'application/octet-stream',
        kind: generation.kind === 'video' ? 'video' : generation.kind === 'audio' ? 'audio' : 'image',
        characterId: brief?.characterId ?? undefined,
        brandDealId: brief?.brandDealId ?? undefined,
        campaignId: brief?.campaignId ?? undefined,
        scriptId: brief?.scriptId ?? undefined,
        source: 'generation',
        providerId: generation.providerId ?? undefined,
        model: generation.model ?? undefined,
        prompt: (generation.request as { prompt?: string })?.prompt,
        generationParams: generation.request as Record<string, unknown>,
        generationJobId: generation.id,
      });

      this.db.insert(generationOutputs).values({
        id: newId('generationOutput'),
        workspaceId,
        generationJobId: generation.id,
        assetId: asset.id,
        remoteUrl: output.url ?? null,
        index,
        metadata: output.metadata ?? null,
        createdAt: this.clock.now(),
        updatedAt: this.clock.now(),
      }).run();

      assets.push(asset);
    }

    // Spec §70 — cost is recorded per job so it can be sliced by character,
    // campaign, provider and model later.
    if (result.costMinor !== undefined || result.creditsUsed !== undefined) {
      this.db.insert(costRecords).values({
        id: newId('job'),
        workspaceId,
        providerId: generation.providerId,
        model: generation.model,
        jobId,
        characterId: brief?.characterId ?? null,
        campaignId: brief?.campaignId ?? null,
        kind: `generation.${generation.kind}`,
        quantity: result.outputs.length,
        unit: generation.kind === 'video' ? 'video' : 'image',
        actualMinor: result.costMinor ?? null,
        occurredAt: this.clock.now(),
        createdAt: this.clock.now(),
        updatedAt: this.clock.now(),
      }).run();
    }

    if (brief) this.briefRepo.update(workspaceId, brief.id, { status: 'generated' });

    this.events.emit({
      workspaceId, type: 'generation.completed', characterId: brief?.characterId ?? null,
      entityType: 'job', entityId: jobId, actor: 'provider',
      payload: { assetIds: assets.map((a) => a.id), briefId: brief?.id },
    });

    if (brief?.characterId) {
      this.db.update(characters)
        .set({ lastGeneratedAt: this.clock.now() })
        .where(eq(characters.id, brief.characterId))
        .run();
    }

    return { state: 'completed' as const, assets, progress: 1 };
  }

  async cancel(actor: Actor, workspaceId: string, jobId: string) {
    requirePermission(actor, 'studio:generate');
    const generation = this.db
      .select().from(generationJobs)
      .where(and(eq(generationJobs.workspaceId, workspaceId), eq(generationJobs.jobId, jobId)))
      .get();

    if (generation?.externalId && generation.providerId) {
      const provider = this.router.byId(workspaceId, generation.providerId);
      // Cancelling upstream is best-effort; the local job is cancelled regardless.
      if (provider.adapter.cancel) {
        await provider.adapter.cancel(provider.ctx, generation.externalId).catch(() => undefined);
      }
    }

    const job = this.queue.cancel(jobId);
    this.events.emit({
      workspaceId, type: 'generation.cancelled', entityType: 'job', entityId: jobId,
      actor: actor.kind, actorId: actor.principal.userId, payload: {},
    });
    return job;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────

  private promptInputs(workspaceId: string, brief: typeof creativeBriefs.$inferSelect): PromptInputs {
    const character = brief.characterId
      ? this.db.select().from(characters)
          .where(and(eq(characters.id, brief.characterId), eq(characters.workspaceId, workspaceId)))
          .get()
      : null;

    const outfit = brief.spec.outfit?.wardrobeItemId
      ? this.db.select().from(wardrobeItems)
          .where(and(
            eq(wardrobeItems.id, brief.spec.outfit.wardrobeItemId),
            eq(wardrobeItems.workspaceId, workspaceId),
            isNull(wardrobeItems.deletedAt),
          ))
          .get()
      : null;

    const home = brief.spec.scene?.homeId
      ? this.db.select().from(homes).where(and(
          eq(homes.id, brief.spec.scene.homeId),
          eq(homes.workspaceId, workspaceId),
          isNull(homes.deletedAt),
        )).get()
      : null;

    return {
      spec: brief.spec,
      character: character
        ? { name: character.name, gender: character.gender, age: character.age, visual: character.visual }
        : null,
      outfitDescription: outfit ? [outfit.name, outfit.description].filter(Boolean).join(' — ') : null,
      locationDescription: home ? [home.name, home.description].filter(Boolean).join(' — ') : null,
      brandRules: character?.brand
        ? { visualDos: character.brand.visualDos, visualDonts: character.brand.visualDonts }
        : null,
    };
  }

  /**
   * Spec §133 — when strict identity is requested, only approved references are
   * passed to the provider. Otherwise the brief's explicit list is used.
   */
  private resolveReferences(workspaceId: string, brief: typeof creativeBriefs.$inferSelect) {
    const ids = new Set(brief.spec.references?.characterReferenceAssetIds ?? []);

    if (brief.spec.references?.strictIdentity && brief.characterId) {
      for (const { asset } of this.media.approvedReferences(workspaceId, brief.characterId)) {
        ids.add(asset.id);
      }
    }

    const referenceIds = [...(brief.spec.props?.referenceAssetIds ?? []), ...(brief.spec.props?.productAssetIds ?? [])];

    return {
      characterReferenceUrls: this.assetUrls(workspaceId, [...ids]),
      referenceUrls: this.assetUrls(workspaceId, referenceIds),
    };
  }

  /**
   * Providers need a fetchable URL. Local assets are exposed through the
   * server's own asset route, which the desktop bridge and server both serve.
   */
  private assetUrls(workspaceId: string, assetIds: string[]): string[] {
    if (assetIds.length === 0) return [];
    return this.db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.workspaceId, workspaceId), isNull(mediaAssets.deletedAt)))
      .all()
      .filter((row) => assetIds.includes(row.id))
      .map((row) => `/api/assets/${row.id}/content`);
  }
}

async function downloadBytes(url: string): Promise<Buffer | null> {
  if (url.startsWith('mock://') || url.startsWith('/')) return null;

  const parsed = new URL(url);
  if (!['http:', 'https:'].includes(parsed.protocol) || isBlockedHost(parsed.hostname)) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 30_000);
  try {
    const response = await fetch(parsed, { signal: controller.signal, redirect: 'error' });
    if (!response.ok) return null;

    const maxBytes = 100 * 1024 * 1024;
    const declared = Number(response.headers.get('content-length') ?? 0);
    if (declared > maxBytes) return null;

    const chunks: Buffer[] = [];
    let total = 0;
    if (!response.body) return null;
    for await (const chunk of response.body as AsyncIterable<Uint8Array>) {
      total += chunk.byteLength;
      if (total > maxBytes) return null;
      chunks.push(Buffer.from(chunk));
    }
    return Buffer.concat(chunks, total);
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

function isBlockedHost(hostname: string): boolean {
  const host = hostname.toLowerCase().replace(/[\[\]]/g, '');
  if (host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local') || host === '::1') return true;
  const octets = host.split('.').map(Number);
  if (octets.length !== 4 || octets.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return false;
  const a = octets[0]!;
  const b = octets[1]!;
  return a === 10 || a === 127 || (a === 169 && b === 254) || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

function extensionFor(mimeType: string | undefined): string {
  const map: Record<string, string> = {
    'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp',
    'video/mp4': 'mp4', 'video/webm': 'webm',
    'audio/mpeg': 'mp3', 'audio/wav': 'wav',
  };
  return map[mimeType ?? ''] ?? 'bin';
}
