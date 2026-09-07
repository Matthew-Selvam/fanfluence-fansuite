import { index, sqliteTable, text, integer, uniqueIndex, real } from 'drizzle-orm/sqlite-core';
import { baseColumns, bool, json, minorUnits, ts } from './_common.js';
import type {
  BrandIdentity,
  CharacterLocks,
  CharacterStatus,
  ContentRating,
  OperationalIdentity,
  PersonalityProfile,
  VisualIdentity,
} from '../../domain/character.js';
import type {
  ApprovalState,
  AssetKind,
  BrandDealStage,
  CreativeBriefSpec,
  DeliverableKind,
  PublishingState,
  ScriptStatus,
  WardrobeCategory,
} from '../../domain/studio.js';

// ── Characters ──────────────────────────────────────────────────────────────

export const characters = sqliteTable(
  'characters',
  {
    ...baseColumns('character'),
    name: text('name').notNull(),
    displayName: text('display_name'),
    username: text('username'),
    gender: text('gender'),
    age: integer('age'),
    birthdate: text('birthdate'),
    niche: text('niche'),
    category: text('category'),
    location: text('location'),
    timezone: text('timezone'),
    language: text('language').notNull().default('en'),
    status: text('status').$type<CharacterStatus>().notNull().default('draft'),
    /** Spec §7 — NSFW/SFW is a first-class classification, not a tag. */
    contentRating: text('content_rating').$type<ContentRating>().notNull().default('sfw'),
    archived: bool('archived').notNull().default(false),

    backstory: text('backstory'),
    personality: json<PersonalityProfile>('personality'),
    visual: json<VisualIdentity>('visual'),
    brand: json<BrandIdentity>('brand'),
    operational: json<OperationalIdentity>('operational'),
    /** Spec §134 — locked fields automation may not touch without permission. */
    locks: json<CharacterLocks>('locks'),

    audience: json<Record<string, unknown>>('audience'),
    contentPillars: json<string[]>('content_pillars'),
    goals: json<string[]>('goals'),

    mainAssetId: text('main_asset_id'),
    characterSheetAssetId: text('character_sheet_asset_id'),

    lastGeneratedAt: ts('last_generated_at'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('characters_workspace_ix').on(t.workspaceId, t.deletedAt),
    uniqueIndex('characters_username_uq').on(t.workspaceId, t.username),
  ],
);

/** Spec §88 — full snapshots so a profile can be viewed, compared and restored. */
export const characterVersions = sqliteTable(
  'character_versions',
  {
    ...baseColumns('characterVersion'),
    characterId: text('character_id').notNull(),
    versionNumber: integer('version_number').notNull(),
    snapshot: json<Record<string, unknown>>('snapshot').notNull(),
    label: text('label'),
    authorUserId: text('author_user_id'),
    /** Which automation or agent run produced this version, if any. */
    sourceRunId: text('source_run_id'),
  },
  (t) => [uniqueIndex('character_versions_uq').on(t.characterId, t.versionNumber)],
);

/** Join between a character and an asset, carrying the role the asset plays. */
export const characterAssets = sqliteTable(
  'character_assets',
  {
    ...baseColumns('characterAsset'),
    characterId: text('character_id').notNull(),
    assetId: text('asset_id').notNull(),
    role: text('role')
      .$type<
        | 'main'
        | 'character_sheet'
        | 'close_up'
        | 'feature_sheet'
        | 'face_reference'
        | 'style_reference'
        | 'full_body'
        | 'wardrobe'
        | 'home'
        | 'content'
      >()
      .notNull(),
    /** Spec §133 — only approved references feed strict-consistency generation. */
    approved: bool('approved').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    uniqueIndex('character_assets_uq').on(t.characterId, t.assetId, t.role),
    index('character_assets_role_ix').on(t.characterId, t.role, t.approved),
  ],
);

/**
 * Spec §16 — optional embeddings for approved references. Absent embeddings
 * simply disable the drift heuristic; they never block generation.
 */
export const characterReferences = sqliteTable(
  'character_references',
  {
    ...baseColumns('characterReference'),
    characterId: text('character_id').notNull(),
    assetId: text('asset_id').notNull(),
    embeddingModel: text('embedding_model'),
    embedding: json<number[]>('embedding'),
    quality: real('quality'),
  },
  (t) => [index('character_references_char_ix').on(t.characterId)],
);

// ── Wardrobe & home ─────────────────────────────────────────────────────────

export const wardrobes = sqliteTable(
  'wardrobes',
  {
    ...baseColumns('wardrobe'),
    characterId: text('character_id'),
    name: text('name').notNull(),
    description: text('description'),
    isDefault: bool('is_default').notNull().default(false),
  },
  (t) => [index('wardrobes_character_ix').on(t.characterId)],
);

export const wardrobeItems = sqliteTable(
  'wardrobe_items',
  {
    ...baseColumns('wardrobeItem'),
    wardrobeId: text('wardrobe_id').notNull(),
    name: text('name').notNull(),
    category: text('category').$type<WardrobeCategory>().notNull(),
    style: text('style'),
    description: text('description'),
    assetId: text('asset_id'),
    brandDealId: text('brand_deal_id'),
    campaignId: text('campaign_id'),
    tags: json<string[]>('tags'),
    favorite: bool('favorite').notNull().default(false),
    locked: bool('locked').notNull().default(false),
    archived: bool('archived').notNull().default(false),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [
    index('wardrobe_items_wardrobe_ix').on(t.wardrobeId, t.category),
    index('wardrobe_items_deal_ix').on(t.brandDealId),
  ],
);

export const homes = sqliteTable(
  'homes',
  {
    ...baseColumns('home'),
    characterId: text('character_id'),
    name: text('name').notNull(),
    description: text('description'),
    rooms: json<Array<{ name: string; description?: string; assetId?: string }>>('rooms'),
    assetId: text('asset_id'),
  },
  (t) => [index('homes_character_ix').on(t.characterId)],
);

// ── Brand deals ─────────────────────────────────────────────────────────────

export const brandDeals = sqliteTable(
  'brand_deals',
  {
    ...baseColumns('brandDeal'),
    characterId: text('character_id'),
    brand: text('brand').notNull(),
    category: text('category'),
    stage: text('stage').$type<BrandDealStage>().notNull().default('new'),
    contractStatus: text('contract_status'),
    startDate: ts('start_date'),
    endDate: ts('end_date'),
    /** Spec §135 — the compliance rules automations check before approval. */
    compliance: json<{
      required?: string[];
      forbidden?: string[];
      preferred?: string[];
      mandatoryAssetIds?: string[];
      requiredWording?: string[];
      hashtagRules?: string[];
      productPlacement?: string;
      visualRestrictions?: string[];
      publishingRestrictions?: string[];
    }>('compliance'),
    guidelines: text('guidelines'),
    usageNotes: text('usage_notes'),
    publishingChannels: json<string[]>('publishing_channels'),
    valueMinor: minorUnits('value_minor'),
    currency: text('currency').notNull().default('USD'),
    approvalState: text('approval_state').$type<ApprovalState>().notNull().default('pending'),
  },
  (t) => [index('brand_deals_workspace_ix').on(t.workspaceId, t.stage, t.deletedAt)],
);

export const brandDealDeliverables = sqliteTable(
  'brand_deal_deliverables',
  {
    ...baseColumns('brandDeal'),
    brandDealId: text('brand_deal_id').notNull(),
    kind: text('kind').$type<DeliverableKind>().notNull(),
    title: text('title').notNull(),
    quantity: integer('quantity').notNull().default(1),
    dueDate: ts('due_date'),
    status: text('status').$type<BrandDealStage>().notNull().default('new'),
    assetIds: json<string[]>('asset_ids'),
    scriptId: text('script_id'),
    notes: text('notes'),
  },
  (t) => [index('brand_deal_deliverables_deal_ix').on(t.brandDealId)],
);

export const brandAssets = sqliteTable(
  'brand_assets',
  {
    ...baseColumns('brandAsset'),
    brandDealId: text('brand_deal_id'),
    assetId: text('asset_id').notNull(),
    role: text('role').$type<'logo' | 'product' | 'guideline' | 'reference' | 'other'>().notNull(),
    label: text('label'),
  },
  (t) => [index('brand_assets_deal_ix').on(t.brandDealId)],
);

// ── Inspiration ─────────────────────────────────────────────────────────────

export const inspirationBoards = sqliteTable(
  'inspiration_boards',
  {
    ...baseColumns('inspirationBoard'),
    name: text('name').notNull(),
    description: text('description'),
    characterId: text('character_id'),
    campaignId: text('campaign_id'),
    brandDealId: text('brand_deal_id'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('inspiration_boards_workspace_ix').on(t.workspaceId, t.deletedAt)],
);

export const inspirationAssets = sqliteTable(
  'inspiration_assets',
  {
    ...baseColumns('inspirationAsset'),
    boardId: text('board_id').notNull(),
    assetId: text('asset_id').notNull(),
    note: text('note'),
    tags: json<string[]>('tags'),
    /** Dominant colours pulled deterministically at upload time. */
    palette: json<string[]>('palette'),
    sortOrder: integer('sort_order').notNull().default(0),
  },
  (t) => [index('inspiration_assets_board_ix').on(t.boardId)],
);

// ── Scripts ─────────────────────────────────────────────────────────────────

export const scripts = sqliteTable(
  'scripts',
  {
    ...baseColumns('script'),
    title: text('title').notNull(),
    characterId: text('character_id'),
    campaignId: text('campaign_id'),
    brandDealId: text('brand_deal_id'),
    channel: text('channel'),
    status: text('status').$type<ScriptStatus>().notNull().default('idea'),
    hook: text('hook'),
    body: text('body'),
    cta: text('cta'),
    dialogue: json<Array<{ speaker: string; line: string }>>('dialogue'),
    caption: text('caption'),
    notes: text('notes'),
    referenceAssetIds: json<string[]>('reference_asset_ids'),
    outputAssetIds: json<string[]>('output_asset_ids'),
    publishingState: text('publishing_state').$type<PublishingState>().notNull().default('draft'),
  },
  (t) => [index('scripts_workspace_ix').on(t.workspaceId, t.status, t.deletedAt)],
);

// ── Media library ───────────────────────────────────────────────────────────

/**
 * Spec §15/§49 — metadata lives here, bytes live on the filesystem. `storageKey`
 * is a path relative to the assets root; no base64 blobs in the database.
 */
export const mediaAssets = sqliteTable(
  'media_assets',
  {
    ...baseColumns('mediaAsset'),
    kind: text('kind').$type<AssetKind>().notNull(),
    mimeType: text('mime_type').notNull(),
    filename: text('filename').notNull(),
    storageKey: text('storage_key').notNull(),
    /** SHA-256 of the bytes — dedupe key and integrity check. */
    checksum: text('checksum'),
    sizeBytes: integer('size_bytes'),
    width: integer('width'),
    height: integer('height'),
    durationMs: integer('duration_ms'),

    characterId: text('character_id'),
    brandDealId: text('brand_deal_id'),
    campaignId: text('campaign_id'),
    scriptId: text('script_id'),

    providerId: text('provider_id'),
    model: text('model'),
    prompt: text('prompt'),
    generationParams: json<Record<string, unknown>>('generation_params'),
    generationJobId: text('generation_job_id'),

    source: text('source')
      .$type<'upload' | 'generation' | 'import' | 'derived' | 'external'>()
      .notNull()
      .default('upload'),
    /** Spec §132 — versions chain rather than overwrite. */
    parentAssetId: text('parent_asset_id'),
    versionNumber: integer('version_number').notNull().default(1),

    tags: json<string[]>('tags'),
    approvalState: text('approval_state').$type<ApprovalState>().notNull().default('pending'),
    publishingState: text('publishing_state').$type<PublishingState>().notNull().default('draft'),
    favorite: bool('favorite').notNull().default(false),
    archived: bool('archived').notNull().default(false),
  },
  (t) => [
    index('media_assets_workspace_ix').on(t.workspaceId, t.kind, t.deletedAt),
    index('media_assets_character_ix').on(t.characterId, t.createdAt),
    index('media_assets_checksum_ix').on(t.workspaceId, t.checksum),
    index('media_assets_parent_ix').on(t.parentAssetId),
  ],
);

/**
 * Spec §113/§114 — a brief is provider-independent and can exist before any
 * provider is connected. Choosing a provider is a separate, later step.
 */
export const creativeBriefs = sqliteTable(
  'creative_briefs',
  {
    ...baseColumns('creativeBrief'),
    title: text('title').notNull(),
    kind: text('kind').$type<'image' | 'video' | 'audio'>().notNull(),
    characterId: text('character_id'),
    brandDealId: text('brand_deal_id'),
    campaignId: text('campaign_id'),
    scriptId: text('script_id'),
    spec: json<CreativeBriefSpec>('spec').notNull(),
    /** Preferred provider/model; null means "decide at dispatch time". */
    preferredProviderId: text('preferred_provider_id'),
    preferredModel: text('preferred_model'),
    status: text('status')
      .$type<'draft' | 'ready' | 'queued' | 'generated' | 'archived'>()
      .notNull()
      .default('draft'),
  },
  (t) => [index('creative_briefs_workspace_ix').on(t.workspaceId, t.status, t.deletedAt)],
);

/** Spec §10 — a Content Studio project is an ordered list of shots. */
export const contentProjects = sqliteTable(
  'content_projects',
  {
    ...baseColumns('creativeBrief'),
    title: text('title').notNull(),
    characterId: text('character_id'),
    scriptId: text('script_id'),
    brandDealId: text('brand_deal_id'),
    aspect: text('aspect').notNull().default('9:16'),
    resolution: text('resolution'),
    status: text('status')
      .$type<'draft' | 'in_production' | 'review' | 'approved' | 'archived'>()
      .notNull()
      .default('draft'),
  },
  (t) => [index('content_projects_workspace_ix').on(t.workspaceId, t.deletedAt)],
);

export const contentShots = sqliteTable(
  'content_shots',
  {
    ...baseColumns('creativeBrief'),
    projectId: text('project_id').notNull(),
    position: integer('position').notNull(),
    title: text('title'),
    startFrameAssetId: text('start_frame_asset_id'),
    camera: text('camera'),
    action: text('action'),
    dialogue: text('dialogue'),
    audio: text('audio'),
    durationMs: integer('duration_ms'),
    briefId: text('brief_id'),
    /** Spec §10 — a locked shot is excluded from bulk regeneration. */
    locked: bool('locked').notNull().default(false),
    approvalState: text('approval_state').$type<ApprovalState>().notNull().default('pending'),
    selectedOutputAssetId: text('selected_output_asset_id'),
  },
  (t) => [uniqueIndex('content_shots_position_uq').on(t.projectId, t.position)],
);
