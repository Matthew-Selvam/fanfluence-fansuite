/**
 * Spec §6 — the todo engine. Deterministic tasks derived purely from profile
 * state. Explicitly no AI, and every item names the field it is about so the
 * dashboard can render a "→ Fix" action.
 */
export interface ProfileState {
  characterId: string;
  characterName: string;
  hasBio: boolean;
  hasNiche: boolean;
  hasAudience: boolean;
  hasStory: boolean;
  hasContentPillars: boolean;
  hasVoice: boolean;
  hasBrandColors: boolean;
  hasMainImage: boolean;
  hasCharacterSheet: boolean;
  faceReferenceCount: number;
  wardrobeItemCount: number;
  homeCount: number;
  brandDealCount: number;
  scriptCount: number;
  contentAssetCount: number;
  publishingAccountCount: number;
}

export interface TodoItem {
  key: string;
  characterId: string;
  title: string;
  /** The profile field or sub-resource the fix action should open. */
  field: string;
  severity: 'blocker' | 'important' | 'suggested';
  order: number;
}

interface Rule {
  key: string;
  title: string;
  field: string;
  severity: TodoItem['severity'];
  missing: (s: ProfileState) => boolean;
}

/** Ordered by the sequence a creator would naturally work through. */
const RULES: Rule[] = [
  { key: 'bio', title: 'Complete bio', field: 'backstory', severity: 'blocker', missing: (s) => !s.hasBio },
  { key: 'niche', title: 'Set niche', field: 'niche', severity: 'blocker', missing: (s) => !s.hasNiche },
  { key: 'face_reference', title: 'Add face reference', field: 'references.face', severity: 'blocker', missing: (s) => s.faceReferenceCount === 0 },
  { key: 'main_image', title: 'Add main image', field: 'visual.mainImage', severity: 'blocker', missing: (s) => !s.hasMainImage },
  { key: 'character_sheet', title: 'Create character sheet', field: 'visual.characterSheet', severity: 'important', missing: (s) => !s.hasCharacterSheet },
  { key: 'story', title: 'Write story', field: 'story', severity: 'important', missing: (s) => !s.hasStory },
  { key: 'audience', title: 'Define audience', field: 'audience', severity: 'important', missing: (s) => !s.hasAudience },
  { key: 'content_pillars', title: 'Add content pillars', field: 'contentPillars', severity: 'important', missing: (s) => !s.hasContentPillars },
  { key: 'wardrobe', title: 'Create wardrobe', field: 'wardrobe', severity: 'important', missing: (s) => s.wardrobeItemCount === 0 },
  { key: 'home', title: 'Add home', field: 'home', severity: 'suggested', missing: (s) => s.homeCount === 0 },
  { key: 'brand_colors', title: 'Add brand colors', field: 'brand.colors', severity: 'suggested', missing: (s) => !s.hasBrandColors },
  { key: 'voice', title: 'Set voice', field: 'operational.defaultVoice', severity: 'suggested', missing: (s) => !s.hasVoice },
  { key: 'first_content', title: 'Create first content batch', field: 'studio.content', severity: 'important', missing: (s) => s.contentAssetCount === 0 },
  { key: 'first_script', title: 'Create first script', field: 'scripts', severity: 'suggested', missing: (s) => s.scriptCount === 0 },
  { key: 'brand_deal', title: 'Add brand deal', field: 'brandDeals', severity: 'suggested', missing: (s) => s.brandDealCount === 0 },
  { key: 'publishing', title: 'Connect publishing account', field: 'settings.publishing', severity: 'suggested', missing: (s) => s.publishingAccountCount === 0 },
];

export function generateTodos(state: ProfileState): TodoItem[] {
  return RULES.filter((r) => r.missing(state)).map((r, i) => ({
    key: `${state.characterId}:${r.key}`,
    characterId: state.characterId,
    title: r.title,
    field: r.field,
    severity: r.severity,
    order: i,
  }));
}

/** Weighted so a profile with only "suggested" gaps still reads as near-complete. */
const WEIGHTS: Record<TodoItem['severity'], number> = { blocker: 3, important: 2, suggested: 1 };

export function profileCompletion(state: ProfileState): number {
  const total = RULES.reduce((sum, r) => sum + WEIGHTS[r.severity], 0);
  const missing = RULES.filter((r) => r.missing(state)).reduce((sum, r) => sum + WEIGHTS[r.severity], 0);
  return Math.round(((total - missing) / total) * 100);
}

/** The §6 "incomplete profile panel" — blockers only, in fix order. */
export function blockers(state: ProfileState): TodoItem[] {
  return generateTodos(state).filter((t) => t.severity === 'blocker');
}
