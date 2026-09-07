import { z } from 'zod';

export const CharacterStatus = z.enum(['draft', 'active', 'paused', 'archived']);
export type CharacterStatus = z.infer<typeof CharacterStatus>;

export const ContentRating = z.enum(['sfw', 'nsfw']);
export type ContentRating = z.infer<typeof ContentRating>;

/** Spec §7 — personality as scored dimensions plus free-text colour. */
export const PersonalityProfile = z.object({
  communicationStyle: z.string().optional(),
  humor: z.number().min(0).max(100).optional(),
  energy: z.number().min(0).max(100).optional(),
  formality: z.number().min(0).max(100).optional(),
  confidence: z.number().min(0).max(100).optional(),
  warmth: z.number().min(0).max(100).optional(),
  assertiveness: z.number().min(0).max(100).optional(),
  quirks: z.array(z.string()).optional(),
  interests: z.array(z.string()).optional(),
  hobbies: z.array(z.string()).optional(),
  favoriteTopics: z.array(z.string()).optional(),
});
export type PersonalityProfile = z.infer<typeof PersonalityProfile>;

export const VisualIdentity = z.object({
  aesthetic: z.string().optional(),
  colorPalette: z.array(z.string()).optional(),
  hair: z.string().optional(),
  eyes: z.string().optional(),
  build: z.string().optional(),
  skinTone: z.string().optional(),
  distinguishingFeatures: z.array(z.string()).optional(),
  makeupPreferences: z.string().optional(),
  fashionProfile: z.string().optional(),
});
export type VisualIdentity = z.infer<typeof VisualIdentity>;

export const BrandIdentity = z.object({
  colors: z.array(z.string()).optional(),
  typography: z.string().optional(),
  positioning: z.string().optional(),
  tone: z.string().optional(),
  dreamBrands: z.array(z.string()).optional(),
  existingPartnerships: z.array(z.string()).optional(),
  sponsorshipRestrictions: z.array(z.string()).optional(),
  productCategories: z.array(z.string()).optional(),
  visualDos: z.array(z.string()).optional(),
  visualDonts: z.array(z.string()).optional(),
});
export type BrandIdentity = z.infer<typeof BrandIdentity>;

export const OperationalIdentity = z.object({
  contentFrequency: z.string().optional(),
  publishingChannels: z.array(z.string()).optional(),
  defaultProviderId: z.string().optional(),
  defaultModel: z.string().optional(),
  defaultWardrobeId: z.string().optional(),
  defaultVisualStyle: z.string().optional(),
  defaultVoice: z.string().optional(),
  defaultCaptionStyle: z.string().optional(),
  defaultPostingWorkflow: z.string().optional(),
});
export type OperationalIdentity = z.infer<typeof OperationalIdentity>;

/** Spec §134 — automation must not change a locked field without permission. */
export const LOCKABLE_FIELDS = [
  'face', 'hair', 'body', 'style', 'brandColors', 'personality', 'wardrobe', 'voice',
] as const;
export type LockableField = (typeof LOCKABLE_FIELDS)[number];

export const CharacterLocks = z.partialRecord(z.enum(LOCKABLE_FIELDS), z.boolean());
export type CharacterLocks = Partial<Record<LockableField, boolean>>;

export function isLocked(locks: CharacterLocks | null | undefined, field: LockableField): boolean {
  return Boolean(locks?.[field]);
}

/**
 * Spec §82 — the canonical persona input. Assembled once, in one place, rather
 * than reconstructed from scattered prompt fragments in the UI.
 */
export interface CharacterContextPack {
  characterId: string;
  identity: Record<string, unknown>;
  story: string | null;
  personality: PersonalityProfile | null;
  voice: string | null;
  audience: Record<string, unknown> | null;
  contentPillars: string[];
  brandRules: BrandIdentity | null;
  visualRules: VisualIdentity | null;
  relationshipRules: Record<string, unknown> | null;
  /** Spec §84 — never optional, never overridable by campaign context. */
  disclosureRules: DisclosureRules;
  memory: Array<{ kind: string; content: string; confidence: number }>;
  examples: Array<{ input: string; output: string }>;
  currentCampaign: Record<string, unknown> | null;
}

export const DisclosureRules = z.object({
  /** Whether the character must admit to being AI when directly asked. */
  mustDiscloseAiOnDirectQuestion: z.boolean().default(true),
  /** Whether an admission may then be walked back or undercut. */
  allowUnderminingAdmission: z.boolean().default(false),
  /** Claims the character must never make. */
  forbiddenClaims: z.array(z.string()).default([
    'claiming to be a human being',
    'claiming to have a physical body that can meet in person',
    'denying being an AI when directly asked',
  ]),
  /** Text appended when a disclosure repair is required. */
  disclosureStatement: z.string().default(
    "I'm an AI character, not a real person.",
  ),
});
export type DisclosureRules = z.infer<typeof DisclosureRules>;

export const DEFAULT_DISCLOSURE_RULES: DisclosureRules = DisclosureRules.parse({});
