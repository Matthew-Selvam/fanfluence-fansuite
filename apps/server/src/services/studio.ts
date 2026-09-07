import { and, eq, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  brandAssets, brandDealDeliverables, brandDeals, contentProjects, contentShots,
  homes, inspirationAssets, inspirationBoards, scripts, wardrobeItems, wardrobes,
} from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';
import type { EventBus } from '../events/bus.js';
import type { AuditLog } from './audit.js';
import { requirePermission, workspaceOf, type Actor } from './context.js';
import { badRequest, conflict } from '../core/errors.js';
import { newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import {
  BrandDealStage, canTransitionDeal, DeliverableKind, ScriptStatus, WardrobeCategory,
} from '../domain/studio.js';

// ── Wardrobe (spec §11) ─────────────────────────────────────────────────────

export const CreateWardrobeInput = z.object({
  name: z.string().min(1).max(200),
  characterId: z.string().optional(),
  description: z.string().max(2000).optional(),
  isDefault: z.boolean().default(false),
});

export const CreateWardrobeItemInput = z.object({
  wardrobeId: z.string(),
  name: z.string().min(1).max(200),
  category: WardrobeCategory,
  style: z.string().max(100).optional(),
  description: z.string().max(4000).optional(),
  assetId: z.string().optional(),
  brandDealId: z.string().optional(),
  campaignId: z.string().optional(),
  tags: z.array(z.string()).optional(),
});

export class WardrobeService {
  private readonly wardrobeRepo: Repository<typeof wardrobes>;
  private readonly itemRepo: Repository<typeof wardrobeItems>;

  constructor(private readonly db: Db, private readonly clock: Clock) {
    this.wardrobeRepo = new Repository(db, wardrobes, 'wardrobe');
    this.itemRepo = new Repository(db, wardrobeItems, 'wardrobe item');
  }

  listWardrobes(actor: Actor, characterId?: string) {
    requirePermission(actor, 'studio:read');
    return this.wardrobeRepo.all(
      workspaceOf(actor),
      characterId ? eq(wardrobes.characterId, characterId) : undefined,
    );
  }

  createWardrobe(actor: Actor, input: z.infer<typeof CreateWardrobeInput>) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);

    // Only one default per character; setting a new one clears the previous.
    if (input.isDefault && input.characterId) {
      this.db.update(wardrobes).set({ isDefault: false })
        .where(and(eq(wardrobes.workspaceId, workspaceId), eq(wardrobes.characterId, input.characterId)))
        .run();
    }

    return this.wardrobeRepo.insert({
      id: newId('wardrobe'),
      workspaceId,
      characterId: input.characterId ?? null,
      name: input.name,
      description: input.description ?? null,
      isDefault: input.isDefault,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  listItems(actor: Actor, wardrobeId: string, category?: WardrobeCategory) {
    requirePermission(actor, 'studio:read');
    const clauses = [eq(wardrobeItems.wardrobeId, wardrobeId)];
    if (category) clauses.push(eq(wardrobeItems.category, category));
    return this.itemRepo.all(workspaceOf(actor), and(...clauses));
  }

  createItem(actor: Actor, input: z.infer<typeof CreateWardrobeItemInput>) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    this.wardrobeRepo.get(workspaceId, input.wardrobeId);

    return this.itemRepo.insert({
      id: newId('wardrobeItem'),
      workspaceId,
      wardrobeId: input.wardrobeId,
      name: input.name,
      category: input.category,
      style: input.style ?? null,
      description: input.description ?? null,
      assetId: input.assetId ?? null,
      brandDealId: input.brandDealId ?? null,
      campaignId: input.campaignId ?? null,
      tags: input.tags ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  updateItem(actor: Actor, id: string, patch: Partial<z.infer<typeof CreateWardrobeItemInput>> & {
    favorite?: boolean; locked?: boolean; archived?: boolean;
  }) {
    requirePermission(actor, 'studio:write');
    const current = this.itemRepo.get(workspaceOf(actor), id);
    // A locked item may be unlocked, but not otherwise edited (§11 asset controls).
    if (current.locked && patch.locked !== false) {
      throw conflict('This wardrobe item is locked', { itemId: id });
    }
    return this.itemRepo.update(workspaceOf(actor), id, patch as never);
  }

  duplicateItem(actor: Actor, id: string) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const source = this.itemRepo.get(workspaceId, id);
    const { id: _id, createdAt: _c, updatedAt: _u, version: _v, ...rest } = source;
    return this.itemRepo.insert({
      ...rest,
      id: newId('wardrobeItem'),
      name: `${source.name} (copy)`,
      locked: false,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  deleteItem(actor: Actor, id: string) {
    requirePermission(actor, 'studio:write');
    return this.itemRepo.softDelete(workspaceOf(actor), id);
  }
}

// ── Homes ───────────────────────────────────────────────────────────────────

export class HomeService {
  private readonly repo: Repository<typeof homes>;

  constructor(db: Db, private readonly clock: Clock) {
    this.repo = new Repository(db, homes, 'home');
  }

  list(actor: Actor, characterId?: string) {
    requirePermission(actor, 'studio:read');
    return this.repo.all(workspaceOf(actor), characterId ? eq(homes.characterId, characterId) : undefined);
  }

  create(actor: Actor, input: {
    name: string;
    characterId?: string;
    description?: string;
    rooms?: Array<{ name: string; description?: string; assetId?: string }>;
    assetId?: string;
  }) {
    requirePermission(actor, 'studio:write');
    return this.repo.insert({
      id: newId('home'),
      workspaceId: workspaceOf(actor),
      characterId: input.characterId ?? null,
      name: input.name,
      description: input.description ?? null,
      rooms: input.rooms ?? null,
      assetId: input.assetId ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  update(actor: Actor, id: string, patch: Record<string, unknown>) {
    requirePermission(actor, 'studio:write');
    return this.repo.update(workspaceOf(actor), id, patch as never);
  }

  delete(actor: Actor, id: string) {
    requirePermission(actor, 'studio:write');
    return this.repo.softDelete(workspaceOf(actor), id);
  }
}

// ── Brand deals (spec §12) ──────────────────────────────────────────────────

export const CreateBrandDealInput = z.object({
  brand: z.string().min(1).max(200),
  characterId: z.string().optional(),
  category: z.string().max(200).optional(),
  contractStatus: z.string().max(100).optional(),
  startDate: z.coerce.date().optional(),
  endDate: z.coerce.date().optional(),
  guidelines: z.string().max(20_000).optional(),
  usageNotes: z.string().max(20_000).optional(),
  publishingChannels: z.array(z.string()).optional(),
  valueMinor: z.number().int().nonnegative().optional(),
  currency: z.string().length(3).default('USD'),
  compliance: z.object({
    required: z.array(z.string()).optional(),
    forbidden: z.array(z.string()).optional(),
    preferred: z.array(z.string()).optional(),
    mandatoryAssetIds: z.array(z.string()).optional(),
    requiredWording: z.array(z.string()).optional(),
    hashtagRules: z.array(z.string()).optional(),
    productPlacement: z.string().optional(),
    visualRestrictions: z.array(z.string()).optional(),
    publishingRestrictions: z.array(z.string()).optional(),
  }).optional(),
});

export class BrandDealService {
  private readonly repo: Repository<typeof brandDeals>;

  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {
    this.repo = new Repository(db, brandDeals, 'brand deal');
  }

  list(actor: Actor, opts: { characterId?: string; stage?: BrandDealStage; limit?: number; cursor?: string } = {}) {
    requirePermission(actor, 'studio:read');
    const clauses = [];
    if (opts.characterId) clauses.push(eq(brandDeals.characterId, opts.characterId));
    if (opts.stage) clauses.push(eq(brandDeals.stage, opts.stage));
    return this.repo.list(workspaceOf(actor), {
      limit: opts.limit, cursor: opts.cursor,
      where: clauses.length ? and(...clauses) : undefined,
    });
  }

  get(actor: Actor, id: string) {
    requirePermission(actor, 'studio:read');
    const deal = this.repo.get(workspaceOf(actor), id);
    return {
      ...deal,
      deliverables: this.db.select().from(brandDealDeliverables)
        .where(and(eq(brandDealDeliverables.brandDealId, id), isNull(brandDealDeliverables.deletedAt)))
        .all(),
      assets: this.db.select().from(brandAssets)
        .where(and(eq(brandAssets.brandDealId, id), isNull(brandAssets.deletedAt)))
        .all(),
    };
  }

  create(actor: Actor, input: z.infer<typeof CreateBrandDealInput>) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.insert({
      id: newId('brandDeal'),
      workspaceId,
      characterId: input.characterId ?? null,
      brand: input.brand,
      category: input.category ?? null,
      contractStatus: input.contractStatus ?? null,
      startDate: input.startDate ?? null,
      endDate: input.endDate ?? null,
      guidelines: input.guidelines ?? null,
      usageNotes: input.usageNotes ?? null,
      publishingChannels: input.publishingChannels ?? null,
      valueMinor: input.valueMinor ?? null,
      currency: input.currency,
      compliance: input.compliance ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });

    this.events.emit({
      workspaceId, type: 'brand_deal.created', characterId: row.characterId,
      entityType: 'brand_deal', entityId: row.id,
      actor: actor.kind, actorId: actor.principal.userId, payload: { brand: row.brand },
    });
    return row;
  }

  update(actor: Actor, id: string, patch: Partial<z.infer<typeof CreateBrandDealInput>>) {
    requirePermission(actor, 'studio:write');
    return this.repo.update(workspaceOf(actor), id, patch as never);
  }

  /** Spec §12 — the workflow is a guarded state machine, not a free-text field. */
  setStage(actor: Actor, id: string, stage: BrandDealStage) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const current = this.repo.get(workspaceId, id);

    if (!canTransitionDeal(current.stage, stage)) {
      throw badRequest(`A brand deal cannot move from "${current.stage}" to "${stage}"`, {
        from: current.stage, to: stage,
      });
    }

    const row = this.repo.update(workspaceId, id, { stage });
    this.audit.record({
      workspaceId, action: 'brand_deal.stage_changed', entityType: 'brand_deal', entityId: id,
      userId: actor.principal.userId, actor: actor.kind,
      before: { stage: current.stage }, after: { stage },
    });
    this.events.emit({
      workspaceId, type: 'brand_deal.stage_changed', characterId: row.characterId,
      entityType: 'brand_deal', entityId: id, actor: actor.kind, actorId: actor.principal.userId,
      payload: { from: current.stage, to: stage },
    });
    return row;
  }

  addDeliverable(actor: Actor, brandDealId: string, input: {
    kind: DeliverableKind; title: string; quantity?: number; dueDate?: Date; notes?: string;
  }) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    this.repo.get(workspaceId, brandDealId);
    return this.db.insert(brandDealDeliverables).values({
      id: newId('brandDeal'),
      workspaceId,
      brandDealId,
      kind: input.kind,
      title: input.title,
      quantity: input.quantity ?? 1,
      dueDate: input.dueDate ?? null,
      notes: input.notes ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    }).returning().get();
  }

  delete(actor: Actor, id: string) {
    requirePermission(actor, 'studio:delete');
    return this.repo.softDelete(workspaceOf(actor), id);
  }
}

// ── Inspiration (spec §13) ──────────────────────────────────────────────────

export class InspirationService {
  private readonly boardRepo: Repository<typeof inspirationBoards>;
  private readonly assetRepo: Repository<typeof inspirationAssets>;

  constructor(private readonly db: Db, private readonly clock: Clock) {
    this.boardRepo = new Repository(db, inspirationBoards, 'inspiration board');
    this.assetRepo = new Repository(db, inspirationAssets, 'inspiration asset');
  }

  listBoards(actor: Actor) {
    requirePermission(actor, 'studio:read');
    return this.boardRepo.all(workspaceOf(actor));
  }

  createBoard(actor: Actor, input: { name: string; description?: string; characterId?: string; campaignId?: string; brandDealId?: string }) {
    requirePermission(actor, 'studio:write');
    return this.boardRepo.insert({
      id: newId('inspirationBoard'),
      workspaceId: workspaceOf(actor),
      name: input.name,
      description: input.description ?? null,
      characterId: input.characterId ?? null,
      campaignId: input.campaignId ?? null,
      brandDealId: input.brandDealId ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  updateBoard(actor: Actor, id: string, patch: Record<string, unknown>) {
    requirePermission(actor, 'studio:write');
    return this.boardRepo.update(workspaceOf(actor), id, patch as never);
  }

  deleteBoard(actor: Actor, id: string) {
    requirePermission(actor, 'studio:write');
    return this.boardRepo.softDelete(workspaceOf(actor), id);
  }

  items(actor: Actor, boardId: string) {
    requirePermission(actor, 'studio:read');
    return this.assetRepo.all(workspaceOf(actor), eq(inspirationAssets.boardId, boardId));
  }

  addItem(actor: Actor, boardId: string, input: { assetId: string; note?: string; tags?: string[]; palette?: string[] }) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    this.boardRepo.get(workspaceId, boardId);
    return this.assetRepo.insert({
      id: newId('inspirationAsset'),
      workspaceId,
      boardId,
      assetId: input.assetId,
      note: input.note ?? null,
      tags: input.tags ?? null,
      palette: input.palette ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  removeItem(actor: Actor, id: string) {
    requirePermission(actor, 'studio:write');
    return this.assetRepo.softDelete(workspaceOf(actor), id);
  }
}

// ── Scripts (spec §14) ──────────────────────────────────────────────────────

export const CreateScriptInput = z.object({
  title: z.string().min(1).max(300),
  characterId: z.string().optional(),
  campaignId: z.string().optional(),
  brandDealId: z.string().optional(),
  channel: z.string().max(100).optional(),
  hook: z.string().max(4000).optional(),
  body: z.string().max(50_000).optional(),
  cta: z.string().max(4000).optional(),
  caption: z.string().max(10_000).optional(),
  notes: z.string().max(20_000).optional(),
  dialogue: z.array(z.object({ speaker: z.string(), line: z.string() })).optional(),
  referenceAssetIds: z.array(z.string()).optional(),
});

/** Ordered lifecycle; a script may always be archived. */
const SCRIPT_FLOW: Record<ScriptStatus, ScriptStatus[]> = {
  idea: ['draft', 'archived'],
  draft: ['ready', 'idea', 'archived'],
  ready: ['in_production', 'draft', 'archived'],
  in_production: ['review', 'ready', 'archived'],
  review: ['approved', 'in_production', 'archived'],
  approved: ['scheduled', 'review', 'archived'],
  scheduled: ['published', 'approved', 'archived'],
  published: ['archived'],
  archived: ['draft'],
};

export class ScriptService {
  private readonly repo: Repository<typeof scripts>;

  constructor(
    db: Db,
    private readonly events: EventBus,
    private readonly clock: Clock,
  ) {
    this.repo = new Repository(db, scripts, 'script');
  }

  list(actor: Actor, opts: { characterId?: string; status?: ScriptStatus; limit?: number; cursor?: string } = {}) {
    requirePermission(actor, 'studio:read');
    const clauses = [];
    if (opts.characterId) clauses.push(eq(scripts.characterId, opts.characterId));
    if (opts.status) clauses.push(eq(scripts.status, opts.status));
    return this.repo.list(workspaceOf(actor), {
      limit: opts.limit, cursor: opts.cursor,
      where: clauses.length ? and(...clauses) : undefined,
    });
  }

  get(actor: Actor, id: string) {
    requirePermission(actor, 'studio:read');
    return this.repo.get(workspaceOf(actor), id);
  }

  create(actor: Actor, input: z.infer<typeof CreateScriptInput>) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.insert({
      id: newId('script'),
      workspaceId,
      title: input.title,
      characterId: input.characterId ?? null,
      campaignId: input.campaignId ?? null,
      brandDealId: input.brandDealId ?? null,
      channel: input.channel ?? null,
      hook: input.hook ?? null,
      body: input.body ?? null,
      cta: input.cta ?? null,
      caption: input.caption ?? null,
      notes: input.notes ?? null,
      dialogue: input.dialogue ?? null,
      referenceAssetIds: input.referenceAssetIds ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
    this.events.emit({
      workspaceId, type: 'script.created', characterId: row.characterId,
      entityType: 'script', entityId: row.id,
      actor: actor.kind, actorId: actor.principal.userId, payload: { title: row.title },
    });
    return row;
  }

  update(actor: Actor, id: string, patch: Partial<z.infer<typeof CreateScriptInput>>) {
    requirePermission(actor, 'studio:write');
    return this.repo.update(workspaceOf(actor), id, patch as never);
  }

  setStatus(actor: Actor, id: string, status: ScriptStatus) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const current = this.repo.get(workspaceId, id);
    if (current.status !== status && !SCRIPT_FLOW[current.status].includes(status)) {
      throw badRequest(`A script cannot move from "${current.status}" to "${status}"`);
    }
    const row = this.repo.update(workspaceId, id, { status });
    this.events.emit({
      workspaceId, type: 'script.status_changed', characterId: row.characterId,
      entityType: 'script', entityId: id, actor: actor.kind, actorId: actor.principal.userId,
      payload: { from: current.status, to: status },
    });
    return row;
  }

  delete(actor: Actor, id: string) {
    requirePermission(actor, 'studio:delete');
    return this.repo.softDelete(workspaceOf(actor), id);
  }
}

// ── Content Studio projects (spec §10) ──────────────────────────────────────

export class ContentProjectService {
  private readonly projectRepo: Repository<typeof contentProjects>;
  private readonly shotRepo: Repository<typeof contentShots>;

  constructor(private readonly db: Db, private readonly clock: Clock) {
    this.projectRepo = new Repository(db, contentProjects, 'content project');
    this.shotRepo = new Repository(db, contentShots, 'shot');
  }

  list(actor: Actor, characterId?: string) {
    requirePermission(actor, 'studio:read');
    return this.projectRepo.all(
      workspaceOf(actor),
      characterId ? eq(contentProjects.characterId, characterId) : undefined,
    );
  }

  get(actor: Actor, id: string) {
    requirePermission(actor, 'studio:read');
    const workspaceId = workspaceOf(actor);
    return {
      project: this.projectRepo.get(workspaceId, id),
      shots: this.db.select().from(contentShots)
        .where(and(eq(contentShots.projectId, id), isNull(contentShots.deletedAt)))
        .orderBy(contentShots.position)
        .all(),
    };
  }

  create(actor: Actor, input: { title: string; characterId?: string; scriptId?: string; brandDealId?: string; aspect?: string }) {
    requirePermission(actor, 'studio:write');
    return this.projectRepo.insert({
      id: newId('creativeBrief'),
      workspaceId: workspaceOf(actor),
      title: input.title,
      characterId: input.characterId ?? null,
      scriptId: input.scriptId ?? null,
      brandDealId: input.brandDealId ?? null,
      aspect: input.aspect ?? '9:16',
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  addShot(actor: Actor, projectId: string, input: {
    title?: string; camera?: string; action?: string; dialogue?: string;
    audio?: string; durationMs?: number; startFrameAssetId?: string;
  }) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    this.projectRepo.get(workspaceId, projectId);

    const last = this.db
      .select({ n: sql<number>`coalesce(max(${contentShots.position}), 0)` })
      .from(contentShots)
      .where(eq(contentShots.projectId, projectId))
      .get();

    return this.shotRepo.insert({
      id: newId('creativeBrief'),
      workspaceId,
      projectId,
      position: (last?.n ?? 0) + 1,
      title: input.title ?? null,
      camera: input.camera ?? null,
      action: input.action ?? null,
      dialogue: input.dialogue ?? null,
      audio: input.audio ?? null,
      durationMs: input.durationMs ?? null,
      startFrameAssetId: input.startFrameAssetId ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  updateShot(actor: Actor, shotId: string, patch: Record<string, unknown>) {
    requirePermission(actor, 'studio:write');
    const current = this.shotRepo.get(workspaceOf(actor), shotId);
    // Spec §10 — a locked shot is excluded from regeneration and bulk edits.
    if (current.locked && patch.locked !== false) {
      throw conflict('This shot is locked', { shotId });
    }
    return this.shotRepo.update(workspaceOf(actor), shotId, patch as never);
  }

  duplicateShot(actor: Actor, shotId: string) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const source = this.shotRepo.get(workspaceId, shotId);
    const last = this.db
      .select({ n: sql<number>`coalesce(max(${contentShots.position}), 0)` })
      .from(contentShots).where(eq(contentShots.projectId, source.projectId)).get();
    const { id: _id, createdAt: _c, updatedAt: _u, version: _v, ...rest } = source;
    return this.shotRepo.insert({
      ...rest,
      id: newId('creativeBrief'),
      position: (last?.n ?? 0) + 1,
      locked: false,
      approvalState: 'pending',
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });
  }

  /**
   * Reorder shots. Positions are rewritten in a single transaction via a
   * two-phase shift, because `(projectId, position)` is unique and a naive
   * in-place swap would violate it midway.
   */
  reorderShots(actor: Actor, projectId: string, orderedShotIds: string[]) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    this.projectRepo.get(workspaceId, projectId);

    this.db.transaction((tx) => {
      orderedShotIds.forEach((shotId, index) => {
        tx.update(contentShots)
          .set({ position: -(index + 1), updatedAt: this.clock.now() })
          .where(and(eq(contentShots.id, shotId), eq(contentShots.projectId, projectId)))
          .run();
      });
      orderedShotIds.forEach((shotId, index) => {
        tx.update(contentShots)
          .set({ position: index + 1 })
          .where(and(eq(contentShots.id, shotId), eq(contentShots.projectId, projectId)))
          .run();
      });
    });

    return this.get(actor, projectId);
  }

  deleteShot(actor: Actor, shotId: string) {
    requirePermission(actor, 'studio:write');
    return this.shotRepo.softDelete(workspaceOf(actor), shotId);
  }
}
