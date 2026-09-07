import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { z } from 'zod';
import { characterAssets, mediaAssets } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';
import type { EventBus } from '../events/bus.js';
import type { AuditLog } from './audit.js';
import { AssetStorage, mimeToAssetKind, probeImageDimensions } from './storage.js';
import { requirePermission, workspaceOf, type Actor } from './context.js';
import { badRequest } from '../core/errors.js';
import { newId } from '../core/ids.js';
import type { Clock } from '../core/clock.js';
import { ApprovalState, AssetKind } from '../domain/studio.js';

export const UploadAssetInput = z.object({
  filename: z.string().min(1).max(500),
  mimeType: z.string().min(1).max(200),
  kind: AssetKind.optional(),
  characterId: z.string().optional(),
  brandDealId: z.string().optional(),
  campaignId: z.string().optional(),
  scriptId: z.string().optional(),
  tags: z.array(z.string()).optional(),
  prompt: z.string().optional(),
  source: z.enum(['upload', 'generation', 'import', 'derived', 'external']).default('upload'),
  providerId: z.string().optional(),
  model: z.string().optional(),
  generationParams: z.record(z.string(), z.unknown()).optional(),
  generationJobId: z.string().optional(),
  parentAssetId: z.string().optional(),
});
export type UploadAssetInput = z.infer<typeof UploadAssetInput>;

export const AssetRole = z.enum([
  'main', 'character_sheet', 'close_up', 'feature_sheet',
  'face_reference', 'style_reference', 'full_body', 'wardrobe', 'home', 'content',
]);
export type AssetRole = z.infer<typeof AssetRole>;

/**
 * Spec §15 — the unified media library.
 *
 * The service owns the pairing of a database row with bytes on disk; nothing
 * else in the system touches the filesystem for assets.
 */
export class MediaService {
  private readonly repo: Repository<typeof mediaAssets>;

  constructor(
    private readonly db: Db,
    private readonly storage: AssetStorage,
    private readonly events: EventBus,
    private readonly audit: AuditLog,
    private readonly clock: Clock,
  ) {
    this.repo = new Repository(db, mediaAssets, 'asset');
  }

  async upload(actor: Actor, data: Buffer, input: UploadAssetInput) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    if (data.byteLength === 0) throw badRequest('Uploaded file is empty');

    const kind = input.kind ?? mimeToAssetKind(input.mimeType);
    const stored = await this.storage.put({
      workspaceId,
      kind,
      filename: input.filename,
      data,
    });

    // Content-addressed storage means an identical file already in the library
    // is returned rather than duplicated (§132 keeps versions, not copies).
    const existing = this.db
      .select()
      .from(mediaAssets)
      .where(and(
        eq(mediaAssets.workspaceId, workspaceId),
        eq(mediaAssets.checksum, stored.checksum),
        isNull(mediaAssets.deletedAt),
      ))
      .get();
    if (existing && stored.deduped) return existing;

    const dimensions = kind === 'image' ? probeImageDimensions(data) : null;

    const row = this.repo.insert({
      id: newId('mediaAsset'),
      workspaceId,
      kind,
      mimeType: input.mimeType,
      filename: input.filename,
      storageKey: stored.storageKey,
      checksum: stored.checksum,
      sizeBytes: stored.sizeBytes,
      width: dimensions?.width ?? null,
      height: dimensions?.height ?? null,
      characterId: input.characterId ?? null,
      brandDealId: input.brandDealId ?? null,
      campaignId: input.campaignId ?? null,
      scriptId: input.scriptId ?? null,
      providerId: input.providerId ?? null,
      model: input.model ?? null,
      prompt: input.prompt ?? null,
      generationParams: input.generationParams ?? null,
      generationJobId: input.generationJobId ?? null,
      source: input.source,
      parentAssetId: input.parentAssetId ?? null,
      versionNumber: input.parentAssetId ? this.nextVersion(workspaceId, input.parentAssetId) : 1,
      tags: input.tags ?? null,
      createdAt: this.clock.now(),
      updatedAt: this.clock.now(),
    });

    this.events.emit({
      workspaceId,
      type: 'asset.created',
      characterId: row.characterId,
      entityType: 'asset',
      entityId: row.id,
      actor: actor.kind,
      actorId: actor.principal.userId,
      payload: { kind, source: input.source, sizeBytes: stored.sizeBytes },
    });

    return row;
  }

  get(actor: Actor, id: string) {
    requirePermission(actor, 'studio:read');
    return this.repo.get(workspaceOf(actor), id);
  }

  async bytes(actor: Actor, id: string): Promise<{ data: Buffer; mimeType: string; filename: string }> {
    const asset = this.get(actor, id);
    return {
      data: await this.storage.get(asset.storageKey),
      mimeType: asset.mimeType,
      filename: asset.filename,
    };
  }

  list(actor: Actor, opts: {
    kind?: AssetKind;
    characterId?: string;
    brandDealId?: string;
    campaignId?: string;
    approvalState?: ApprovalState;
    limit?: number;
    cursor?: string;
  } = {}) {
    requirePermission(actor, 'studio:read');
    const clauses = [];
    if (opts.kind) clauses.push(eq(mediaAssets.kind, opts.kind));
    if (opts.characterId) clauses.push(eq(mediaAssets.characterId, opts.characterId));
    if (opts.brandDealId) clauses.push(eq(mediaAssets.brandDealId, opts.brandDealId));
    if (opts.campaignId) clauses.push(eq(mediaAssets.campaignId, opts.campaignId));
    if (opts.approvalState) clauses.push(eq(mediaAssets.approvalState, opts.approvalState));

    return this.repo.list(workspaceOf(actor), {
      limit: opts.limit,
      cursor: opts.cursor,
      where: clauses.length ? and(...clauses) : undefined,
      orderBy: mediaAssets.createdAt,
    });
  }

  update(actor: Actor, id: string, patch: {
    filename?: string;
    tags?: string[];
    characterId?: string | null;
    brandDealId?: string | null;
    campaignId?: string | null;
    favorite?: boolean;
    archived?: boolean;
  }) {
    requirePermission(actor, 'studio:write');
    return this.repo.update(workspaceOf(actor), id, patch as never);
  }

  /** Spec §133 — approval is what admits an asset to the strict-reference pool. */
  setApproval(actor: Actor, id: string, state: ApprovalState, note?: string) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.update(workspaceId, id, { approvalState: state });

    this.db
      .update(characterAssets)
      .set({ approved: state === 'approved', updatedAt: this.clock.now() })
      .where(eq(characterAssets.assetId, id))
      .run();

    this.audit.record({
      workspaceId, action: `asset.${state}`, entityType: 'asset', entityId: id,
      userId: actor.principal.userId, actor: actor.kind, after: { approvalState: state, note },
    });
    this.events.emit({
      workspaceId,
      type: state === 'approved' ? 'asset.approved' : 'asset.rejected',
      characterId: row.characterId,
      entityType: 'asset',
      entityId: id,
      actor: actor.kind,
      actorId: actor.principal.userId,
      payload: { approvalState: state, note },
    });

    return row;
  }

  delete(actor: Actor, id: string) {
    requirePermission(actor, 'studio:delete');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.softDelete(workspaceId, id);
    this.audit.record({
      workspaceId, action: 'asset.deleted', entityType: 'asset', entityId: id,
      userId: actor.principal.userId, actor: actor.kind, before: { storageKey: row.storageKey },
    });
    this.events.emit({
      workspaceId, type: 'asset.deleted', entityType: 'asset', entityId: id,
      characterId: row.characterId, actor: actor.kind, actorId: actor.principal.userId, payload: {},
    });
    return row;
  }

  /**
   * Hard delete, including the bytes. Only removes the file when no other
   * live row shares the checksum — content addressing means assets can share.
   */
  async purge(actor: Actor, id: string): Promise<void> {
    requirePermission(actor, 'studio:delete');
    const workspaceId = workspaceOf(actor);
    const row = this.repo.find(workspaceId, id, true);
    if (!row) return;

    this.repo.hardDelete(workspaceId, id);

    const stillReferenced = this.db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.workspaceId, workspaceId), eq(mediaAssets.storageKey, row.storageKey)))
      .get();

    if (!stillReferenced) await this.storage.remove(row.storageKey);
  }

  // ── Character asset roles ─────────────────────────────────────────────────

  attachToCharacter(actor: Actor, characterId: string, assetId: string, role: AssetRole, approved = false) {
    requirePermission(actor, 'studio:write');
    const workspaceId = workspaceOf(actor);
    this.repo.get(workspaceId, assetId);

    const existing = this.db
      .select()
      .from(characterAssets)
      .where(and(
        eq(characterAssets.characterId, characterId),
        eq(characterAssets.assetId, assetId),
        eq(characterAssets.role, role),
      ))
      .get();
    if (existing) return existing;

    return this.db
      .insert(characterAssets)
      .values({
        id: newId('characterAsset'),
        workspaceId,
        characterId,
        assetId,
        role,
        approved,
        createdAt: this.clock.now(),
        updatedAt: this.clock.now(),
      })
      .returning()
      .get();
  }

  detachFromCharacter(actor: Actor, characterId: string, assetId: string, role: AssetRole) {
    requirePermission(actor, 'studio:write');
    this.db
      .delete(characterAssets)
      .where(and(
        eq(characterAssets.workspaceId, workspaceOf(actor)),
        eq(characterAssets.characterId, characterId),
        eq(characterAssets.assetId, assetId),
        eq(characterAssets.role, role),
      ))
      .run();
  }

  /** Spec §133 — the approved reference pool for strict-consistency generation. */
  approvedReferences(workspaceId: string, characterId: string, roles: AssetRole[] = ['face_reference', 'character_sheet', 'main']) {
    return this.db
      .select({ asset: mediaAssets, role: characterAssets.role })
      .from(characterAssets)
      .innerJoin(mediaAssets, eq(mediaAssets.id, characterAssets.assetId))
      .where(and(
        eq(characterAssets.workspaceId, workspaceId),
        eq(characterAssets.characterId, characterId),
        eq(characterAssets.approved, true),
        inArray(characterAssets.role, roles),
        isNull(characterAssets.deletedAt),
        isNull(mediaAssets.deletedAt),
      ))
      .orderBy(desc(characterAssets.createdAt))
      .all();
  }

  characterAssets(workspaceId: string, characterId: string) {
    return this.db
      .select({ asset: mediaAssets, role: characterAssets.role, approved: characterAssets.approved })
      .from(characterAssets)
      .innerJoin(mediaAssets, eq(mediaAssets.id, characterAssets.assetId))
      .where(and(
        eq(characterAssets.workspaceId, workspaceId),
        eq(characterAssets.characterId, characterId),
        isNull(characterAssets.deletedAt),
      ))
      .all();
  }

  /** Spec §132 — version chain for an asset. */
  versions(actor: Actor, assetId: string) {
    requirePermission(actor, 'studio:read');
    const workspaceId = workspaceOf(actor);
    const asset = this.repo.get(workspaceId, assetId);
    const rootId = asset.parentAssetId ?? asset.id;
    return this.db
      .select()
      .from(mediaAssets)
      .where(and(
        eq(mediaAssets.workspaceId, workspaceId),
        sql`(${mediaAssets.id} = ${rootId} OR ${mediaAssets.parentAssetId} = ${rootId})`,
        isNull(mediaAssets.deletedAt),
      ))
      .orderBy(mediaAssets.versionNumber)
      .all();
  }

  /** Spec §68 — storage usage, for the system health card. */
  storageUsage(workspaceId: string): { assetCount: number; totalBytes: number } {
    const row = this.db
      .select({
        n: sql<number>`count(*)`,
        bytes: sql<number>`coalesce(sum(${mediaAssets.sizeBytes}), 0)`,
      })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.workspaceId, workspaceId), isNull(mediaAssets.deletedAt)))
      .get();
    return { assetCount: row?.n ?? 0, totalBytes: row?.bytes ?? 0 };
  }

  private nextVersion(workspaceId: string, parentAssetId: string): number {
    const row = this.db
      .select({ n: sql<number>`coalesce(max(${mediaAssets.versionNumber}), 0)` })
      .from(mediaAssets)
      .where(and(eq(mediaAssets.workspaceId, workspaceId), eq(mediaAssets.parentAssetId, parentAssetId)))
      .get();
    return (row?.n ?? 0) + 1;
  }
}
