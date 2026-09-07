import { z } from 'zod';

export const AssetKind = z.enum([
  'image', 'video', 'audio', 'document', 'reference',
  'wardrobe', 'character_sheet', 'product', 'brand_asset', 'export',
]);
export type AssetKind = z.infer<typeof AssetKind>;

export const ApprovalState = z.enum(['pending', 'approved', 'rejected', 'needs_changes']);
export type ApprovalState = z.infer<typeof ApprovalState>;

export const PublishingState = z.enum([
  'draft', 'ready', 'queued', 'publishing', 'published', 'failed', 'dead',
]);
export type PublishingState = z.infer<typeof PublishingState>;

/** Spec §12 */
export const BrandDealStage = z.enum([
  'new', 'briefed', 'assets_ready', 'production', 'review',
  'approved', 'scheduled', 'published', 'completed', 'cancelled',
]);
export type BrandDealStage = z.infer<typeof BrandDealStage>;

/** Legal forward transitions. A stage may always move to `cancelled`. */
const DEAL_TRANSITIONS: Record<BrandDealStage, BrandDealStage[]> = {
  new: ['briefed', 'cancelled'],
  briefed: ['assets_ready', 'new', 'cancelled'],
  assets_ready: ['production', 'briefed', 'cancelled'],
  production: ['review', 'assets_ready', 'cancelled'],
  review: ['approved', 'production', 'cancelled'],
  approved: ['scheduled', 'review', 'cancelled'],
  scheduled: ['published', 'approved', 'cancelled'],
  published: ['completed', 'cancelled'],
  completed: [],
  cancelled: [],
};

export function canTransitionDeal(from: BrandDealStage, to: BrandDealStage): boolean {
  return from === to || (DEAL_TRANSITIONS[from]?.includes(to) ?? false);
}

export const DeliverableKind = z.enum([
  'static_image', 'carousel', 'reel', 'short_video', 'story',
  'caption', 'script', 'product_shot', 'product_video', 'cross_platform_package',
]);
export type DeliverableKind = z.infer<typeof DeliverableKind>;

/** Spec §14 */
export const ScriptStatus = z.enum([
  'idea', 'draft', 'ready', 'in_production', 'review',
  'approved', 'scheduled', 'published', 'archived',
]);
export type ScriptStatus = z.infer<typeof ScriptStatus>;

/** Spec §11 */
export const WardrobeCategory = z.enum([
  'tops', 'bottoms', 'dresses', 'outerwear', 'shoes',
  'accessories', 'jewelry', 'bags', 'hair', 'makeup', 'complete_looks',
]);
export type WardrobeCategory = z.infer<typeof WardrobeCategory>;

export const STYLE_LIBRARY = [
  'old_money', 'streetwear', 'y2k', 'cottagecore', 'tech', 'business',
  'athleisure', 'luxury', 'minimal', 'editorial', 'coastal', 'festival',
  'night_out', 'casual', 'custom',
] as const;

// ── Photo Studio vocabulary (spec §9) ───────────────────────────────────────

export const SceneLocation = z.enum([
  'home', 'bedroom', 'bathroom', 'kitchen', 'living_room', 'office', 'studio',
  'restaurant', 'cafe', 'street', 'beach', 'gym', 'custom',
]);
export const SceneTime = z.enum([
  'sunrise', 'morning', 'afternoon', 'golden_hour', 'sunset', 'blue_hour', 'night',
]);
export const ScenePose = z.enum([
  'standing', 'sitting', 'walking', 'leaning', 'lying',
  'casual', 'editorial', 'lifestyle', 'athletic', 'product_focused',
]);
export const SceneExpression = z.enum([
  'natural', 'smiling', 'mid_laugh', 'serious', 'playful',
  'confident', 'thoughtful', 'seductive', 'excited', 'neutral',
]);
export const SceneGaze = z.enum(['at_camera', 'away', 'down', 'side_glance', 'closed_eyes']);
export const VisualDirection = z.enum([
  'candid', 'editorial', 'luxury', 'street', 'cozy',
  'cinematic', 'lifestyle', 'commercial', 'ugc', 'fashion', 'product',
]);
export const AspectRatio = z.enum(['9:16', '16:9', '1:1', '4:5', '3:2', 'custom']);

/**
 * Spec §113 — a brief is a complete, provider-independent description of what
 * to make. Choosing a provider and model happens later, at dispatch.
 */
export const CreativeBriefSpec = z.object({
  scene: z
    .object({
      location: SceneLocation.optional(),
      customLocation: z.string().optional(),
      time: SceneTime.optional(),
      environment: z.string().optional(),
      homeId: z.string().optional(),
    })
    .optional(),
  subject: z
    .object({
      pose: ScenePose.optional(),
      customPose: z.string().optional(),
      expression: SceneExpression.optional(),
      gaze: SceneGaze.optional(),
      hair: z.string().optional(),
      hairLocked: z.boolean().optional(),
    })
    .optional(),
  outfit: z
    .object({
      mode: z
        .enum(['preset', 'wardrobe_item', 'custom', 'brand_deal', 'current', 'previous', 'random_approved'])
        .optional(),
      wardrobeItemId: z.string().optional(),
      preset: z.string().optional(),
      custom: z.string().optional(),
    })
    .optional(),
  props: z
    .object({
      description: z.string().optional(),
      referenceAssetIds: z.array(z.string()).optional(),
      productAssetIds: z.array(z.string()).optional(),
    })
    .optional(),
  direction: z
    .object({
      style: VisualDirection.optional(),
      camera: z.string().optional(),
      lighting: z.string().optional(),
      notes: z.string().optional(),
      negativePrompt: z.string().optional(),
    })
    .optional(),
  dialogue: z.string().optional(),
  audio: z.object({ voice: z.string().optional(), track: z.string().optional() }).optional(),
  output: z
    .object({
      aspect: AspectRatio.default('9:16'),
      customAspect: z.string().optional(),
      resolution: z.string().optional(),
      variants: z.number().int().min(1).max(16).default(1),
      durationMs: z.number().int().positive().optional(),
      seed: z.number().int().optional(),
    })
    .default({ aspect: '9:16', variants: 1 }),
  /** Approved-only reference pool when strict identity consistency is wanted (§133). */
  references: z
    .object({
      characterReferenceAssetIds: z.array(z.string()).optional(),
      strictIdentity: z.boolean().default(false),
    })
    .optional(),
});
export type CreativeBriefSpec = z.infer<typeof CreativeBriefSpec>;

/**
 * Spec §136 — deterministic content QA. These checks run with no AI at all and
 * are what gates a publication.
 */
export interface QaCheck {
  key: string;
  label: string;
  passed: boolean;
  detail?: string;
}

export interface QaInput {
  aspect?: string | null;
  requiredAspect?: string | null;
  width?: number | null;
  height?: number | null;
  minWidth?: number | null;
  assetIds: string[];
  brandDealId?: string | null;
  requiresBrandDeal: boolean;
  caption?: string | null;
  requiresCaption: boolean;
  requiredWording?: string[];
  forbiddenWording?: string[];
  url?: string | null;
  requiresUrl: boolean;
  publishingAccountId?: string | null;
}

export function runContentQa(input: QaInput): { checks: QaCheck[]; passed: boolean } {
  const checks: QaCheck[] = [];
  const add = (key: string, label: string, passed: boolean, detail?: string) =>
    checks.push({ key, label, passed, detail });

  if (input.requiredAspect) {
    add('aspect', 'Correct aspect ratio', input.aspect === input.requiredAspect,
      `expected ${input.requiredAspect}, got ${input.aspect ?? 'none'}`);
  }
  if (input.minWidth) {
    add('resolution', 'Correct resolution', (input.width ?? 0) >= input.minWidth,
      `expected width ≥ ${input.minWidth}, got ${input.width ?? 0}`);
  }
  add('assets', 'Required asset present', input.assetIds.length > 0);
  if (input.requiresBrandDeal) add('brand_deal', 'Brand deal assigned', Boolean(input.brandDealId));
  if (input.requiresCaption) add('caption', 'Required caption present', Boolean(input.caption?.trim()));
  if (input.requiresUrl) add('url', 'Required URL present', Boolean(input.url?.trim()));
  add('destination', 'Publishing destination present', Boolean(input.publishingAccountId));

  const caption = (input.caption ?? '').toLowerCase();
  for (const phrase of input.requiredWording ?? []) {
    add(`required_wording:${phrase}`, `Contains "${phrase}"`, caption.includes(phrase.toLowerCase()));
  }
  for (const phrase of input.forbiddenWording ?? []) {
    add(`forbidden_wording:${phrase}`, `Omits "${phrase}"`, !caption.includes(phrase.toLowerCase()));
  }

  return { checks, passed: checks.every((c) => c.passed) };
}
