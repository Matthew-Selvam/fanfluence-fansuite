import { and, count, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import {
  brandDeals, characterAssets, characterVersions, characters, homes,
  mediaAssets, publishingAccounts, scripts, wardrobeItems, wardrobes,
} from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';
import type { EventBus } from '../events/bus.js';
import type { AuditLog } from './audit.js';
import { diff } from './audit.js';
import { requirePermission, workspaceOf, type Actor } from './context.js';
import { badRequest, conflict } from '../core/errors.js';
import { newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import {
  BrandIdentity, CharacterLocks, CharacterStatus, ContentRating,
  isLocked, OperationalIdentity, PersonalityProfile, VisualIdentity,
  type LockableField,
} from '../domain/character.js';
import { blockers, generateTodos, profileCompletion, type ProfileState } from '../domain/todo.js';

export const CreateCharacterInput = z.object({
  name: z.string().min(1).max(200),
  displayName: z.string().max(200).optional(),
  username: z.string().max(100).regex(/^[a-zA-Z0-9._-]*$/).optional(),
  gender: z.string().max(50).optional(),
  age: z.number().int().min(18).max(120).optional(),
  niche: z.string().max(200).optional(),
  category: z.string().max(200).optional(),
  location: z.string().max(200).optional(),
  timezone: z.string().max(100).optional(),
  language: z.string().max(20).default('en'),
  contentRating: ContentRating.default('sfw'),
  status: CharacterStatus.default('draft'),
  backstory: z.string().max(20_000).optional(),
  personality: PersonalityProfile.optional(),
  visual: VisualIdentity.optional(),
  brand: BrandIdentity.optional(),
  operational: OperationalIdentity.optional(),
  contentPillars: z.array(z.string()).optional(),
  goals: z.array(z.string()).optional(),
  audience: z.record(z.string(), z.unknown()).optional(),
});
export type CreateCharacterInput = z.infer<typeof CreateCharacterInput>;

export const UpdateCharacterInput = CreateCharacterInput.partial().extend({
  locks: CharacterLocks.optional(),
  archived: z.boolean().optional(),
  mainAssetId: z.string().nullable().optional(),
  characterSheetAssetId: z.string().nullable().optional(),
  sortOrder: z.number().int().optional(),
  expectedVersion: z.number().int().optional(),
});
export type UpdateCharacterInput = z.infer<typeof UpdateCharacterInput>;

/** Which lock guards which updatable field (spec §134). */
const LOCK_GUARDS: Partial<Record<keyof UpdateCharacterInput, LockableField>> = {
  personality: 'personality',
  visual: 'style',
  brand: 'brandColors',
};

export class CharacterService {
  private readonly repo: Repository<typeof characters>;

  constructor(
    private readonly db: Db,
    private readonly events: EventBus,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {
    this.repo = new Repository(db, characters, 'character');
  }

  list(actor: Actor, opts: { limit?: number; cursor?: string; status?: CharacterStatus; includeArchived?: boolean } = {}) {
    requirePermission(actor, 'studio:read');
    const clauses = [];
    if (opts.status) clauses.push(eq(characters.status, opts.status));
    if (!opts.includeArchived) clauses.push(eq(characters.archived, false));
    return this.repo.list(workspaceOf(actor), {
      limit: opts.limit,
      cursor: opts.cursor,
      where: clauses.length ? and(...clauses) : undefined,
      orderBy: characters.createdAt,
    });
  }

  get(actor: Actor, id: string) {
    requirePermission(actor, 'studio:read');
    return this.repo.get(workspaceOf(actor), id);
  }

  create(actor: Actor, input: CreateCharacterInput) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);

    if (input.username) this.assertUsernameFree(workspaceId, input.username);

    const row = this.repo.insert({
      id: newId('character'),
      workspaceId,
      name: input.name,
      displayName: input.displayName ?? null,
      username: input.username ?? null,
      gender: input.gender ?? null,
      age: input.age ?? null,
      niche: input.niche ?? null,
      category: input.category ?? null,
      location: input.location ?? null,
      timezone: input.timezone ?? null,
      language: input.language,
      status: input.status,
      contentRating: input.contentRating,
      backstory: input.backstory ?? null,
      personality: input.personality ?? null,
      visual: input.visual ?? null,
      brand: input.brand ?? null,
      operational: input.operational ?? null,
      contentPillars: input.contentPillars ?? null,
      goals: input.goals ?? null,
      audience: input.audience ?? null,
      locks: {},
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });

    this.snapshot(row, actor, 'created');
    this.audit.record({
      workspaceId, action: 'character.created', entityType: 'character', entityId: row.id,
      userId: actor.principal.userId, actor: actor.kind, after: row,
    });
    this.events.emit({
      workspaceId, type: 'character.created', characterId: row.id,
      entityType: 'character', entityId: row.id,
      actor: actor.kind, actorId: actor.principal.userId, source: actor.source ?? 'api',
      payload: { name: row.name },
    });

    return row;
  }

  update(actor: Actor, id: string, input: UpdateCharacterInput) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const before = this.repo.get(workspaceId, id);

    // Spec §134 — automation may not overwrite a locked field. A human with
    // studio:write still can, which is what "without explicit permission" means.
    if (actor.kind === 'automation' || actor.kind === 'ai') {
      for (const [field, lock] of Object.entries(LOCK_GUARDS) as Array<[keyof UpdateCharacterInput, LockableField]>) {
        if (input[field] !== undefined && isLocked(before.locks, lock)) {
          throw conflict(`Field "${String(field)}" is locked on this character`, {
            lock, actor: actor.kind,
          });
        }
      }
    }

    if (input.username && input.username !== before.username) {
      this.assertUsernameFree(workspaceId, input.username);
    }

    const { expectedVersion, ...patch } = input;
    const after = this.repo.update(workspaceId, id, patch as never, expectedVersion);

    const changes = diff(before as Record<string, unknown>, after as Record<string, unknown>);
    this.snapshot(after, actor, 'updated');
    this.audit.record({
      workspaceId, action: 'character.updated', entityType: 'character', entityId: id,
      userId: actor.principal.userId, actor: actor.kind,
      before: changes.before, after: changes.after,
    });
    this.events.emit({
      workspaceId, type: 'character.updated', characterId: id,
      entityType: 'character', entityId: id,
      actor: actor.kind, actorId: actor.principal.userId, source: actor.source ?? 'api',
      payload: { changed: Object.keys(changes.after) },
    });

    return after;
  }

  archive(actor: Actor, id: string) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.update(workspaceId, id, { archived: true, status: 'archived' });
    this.audit.record({
      workspaceId, action: 'character.archived', entityType: 'character', entityId: id,
      userId: actor.principal.userId, actor: actor.kind,
    });
    this.events.emit({
      workspaceId, type: 'character.archived', characterId: id,
      entityType: 'character', entityId: id, actor: actor.kind, actorId: actor.principal.userId,
      payload: {},
    });
    return row;
  }

  delete(actor: Actor, id: string) {
    requirePermission(actor, 'studio:delete');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.softDelete(workspaceId, id);
    this.audit.record({
      workspaceId, action: 'character.deleted', entityType: 'character', entityId: id,
      userId: actor.principal.userId, actor: actor.kind, before: row,
    });
    return row;
  }

  /** Spec §134 — set or clear a field lock. */
  setLock(actor: Actor, id: string, field: LockableField, locked: boolean) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const current = this.repo.get(workspaceId, id);
    const locks: CharacterLocks = { ...(current.locks ?? {}), [field]: locked };
    const row = this.repo.update(workspaceId, id, { locks });
    this.events.emit({
      workspaceId, type: 'character.locked', characterId: id,
      entityType: 'character', entityId: id, actor: actor.kind, actorId: actor.principal.userId,
      payload: { field, locked },
    });
    return row;
  }

  // ── Versions (spec §88) ───────────────────────────────────────────────────

  versions(actor: Actor, id: string, limit = 50) {
    requirePermission(actor, 'studio:read');
    return this.db
      .select()
      .from(characterVersions)
      .where(and(
        eq(characterVersions.workspaceId, workspaceOf(actor)),
        eq(characterVersions.characterId, id),
      ))
      .orderBy(sql`${characterVersions.versionNumber} DESC`)
      .limit(limit)
      .all();
  }

  restoreVersion(actor: Actor, id: string, versionNumber: number) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const version = this.db
      .select()
      .from(characterVersions)
      .where(and(
        eq(characterVersions.workspaceId, workspaceId),
        eq(characterVersions.characterId, id),
        eq(characterVersions.versionNumber, versionNumber),
      ))
      .get();

    if (!version) throw badRequest(`Version ${versionNumber} does not exist for this character`);

    // Identity columns are never restored: they are the row's identity, not its content.
    const { id: _id, workspaceId: _ws, createdAt: _c, updatedAt: _u, version: _v, deletedAt: _d, ...content } =
      version.snapshot as Record<string, unknown>;

    return this.repo.update(workspaceId, id, content as never);
  }

  private snapshot(row: typeof characters.$inferSelect, actor: Actor, label: string): void {
    const last = this.db
      .select({ n: sql<number>`coalesce(max(${characterVersions.versionNumber}), 0)` })
      .from(characterVersions)
      .where(eq(characterVersions.characterId, row.id))
      .get();

    this.db.insert(characterVersions).values({
      id: newId('characterVersion'),
      workspaceId: row.workspaceId,
      characterId: row.id,
      versionNumber: (last?.n ?? 0) + 1,
      snapshot: row as unknown as Record<string, unknown>,
      label,
      authorUserId: actor.principal.userId,
      sourceRunId: actor.automationRunId ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    }).run();
  }

  private assertUsernameFree(workspaceId: string, username: string): void {
    const existing = this.db
      .select({ id: characters.id })
      .from(characters)
      .where(and(
        eq(characters.workspaceId, workspaceId),
        eq(characters.username, username),
        isNull(characters.deletedAt),
      ))
      .get();
    if (existing) throw conflict(`Username "${username}" is already taken in this workspace`);
  }

  // ── Todo engine (spec §6) ─────────────────────────────────────────────────

  /**
   * Assemble the deterministic profile state the todo engine consumes. Every
   * input is a count or a null check — no AI, and no provider needs to exist.
   */
  profileState(workspaceId: string, characterId: string): ProfileState {
    const character = this.repo.get(workspaceId, characterId);

    const assetRoleCount = (role: string) =>
      this.db
        .select({ n: count() })
        .from(characterAssets)
        .where(and(
          eq(characterAssets.characterId, characterId),
          eq(characterAssets.role, role as never),
          isNull(characterAssets.deletedAt),
        ))
        .get()?.n ?? 0;

    const scalar = (value: number | undefined) => value ?? 0;

    const wardrobeIds = this.db
      .select({ id: wardrobes.id })
      .from(wardrobes)
      .where(and(eq(wardrobes.workspaceId, workspaceId), eq(wardrobes.characterId, characterId), isNull(wardrobes.deletedAt)))
      .all()
      .map((r) => r.id);

    const wardrobeItemCount = wardrobeIds.length === 0 ? 0 : scalar(
      this.db.select({ n: count() }).from(wardrobeItems)
        .where(and(inArray(wardrobeItems.wardrobeId, wardrobeIds), isNull(wardrobeItems.deletedAt)))
        .get()?.n,
    );

    return {
      characterId,
      characterName: character.name,
      hasBio: Boolean(character.backstory?.trim()),
      hasNiche: Boolean(character.niche?.trim()),
      hasAudience: Boolean(character.audience && Object.keys(character.audience).length > 0),
      hasStory: Boolean(character.backstory && character.backstory.length > 200),
      hasContentPillars: Boolean(character.contentPillars?.length),
      hasVoice: Boolean(character.operational?.defaultVoice),
      hasBrandColors: Boolean(character.brand?.colors?.length),
      hasMainImage: Boolean(character.mainAssetId) || assetRoleCount('main') > 0,
      hasCharacterSheet: Boolean(character.characterSheetAssetId) || assetRoleCount('character_sheet') > 0,
      faceReferenceCount: assetRoleCount('face_reference'),
      wardrobeItemCount,
      homeCount: scalar(
        this.db.select({ n: count() }).from(homes)
          .where(and(eq(homes.workspaceId, workspaceId), eq(homes.characterId, characterId), isNull(homes.deletedAt)))
          .get()?.n,
      ),
      brandDealCount: scalar(
        this.db.select({ n: count() }).from(brandDeals)
          .where(and(eq(brandDeals.workspaceId, workspaceId), eq(brandDeals.characterId, characterId), isNull(brandDeals.deletedAt)))
          .get()?.n,
      ),
      scriptCount: scalar(
        this.db.select({ n: count() }).from(scripts)
          .where(and(eq(scripts.workspaceId, workspaceId), eq(scripts.characterId, characterId), isNull(scripts.deletedAt)))
          .get()?.n,
      ),
      contentAssetCount: scalar(
        this.db.select({ n: count() }).from(mediaAssets)
          .where(and(eq(mediaAssets.workspaceId, workspaceId), eq(mediaAssets.characterId, characterId), isNull(mediaAssets.deletedAt)))
          .get()?.n,
      ),
      publishingAccountCount: scalar(
        this.db.select({ n: count() }).from(publishingAccounts)
          .where(and(eq(publishingAccounts.workspaceId, workspaceId), isNull(publishingAccounts.deletedAt)))
          .get()?.n,
      ),
    };
  }

  todos(actor: Actor, characterId: string) {
    requirePermission(actor, 'studio:read');
    const state = this.profileState(workspaceOf(actor), characterId);
    return {
      characterId,
      characterName: state.characterName,
      completion: profileCompletion(state),
      todos: generateTodos(state),
      blockers: blockers(state),
    };
  }
}
