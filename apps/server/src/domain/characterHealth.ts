/**
 * Spec §16 — character health. Every metric here is computed from counts and
 * metadata the database already holds; the optional embedding-based drift
 * check degrades to "unknown" rather than blocking anything.
 */
export interface HealthInput {
  assetCount: number;
  approvedAssetCount: number;
  faceReferenceCount: number;
  styleReferenceCount: number;
  hasMainImage: boolean;
  hasCharacterSheet: boolean;
  hasCloseUp: boolean;
  hasFeatureSheet: boolean;

  distinctOutfits: number;
  distinctPoses: number;
  distinctLocations: number;
  distinctExpressions: number;

  assetsMissingMetadata: number;
  brandDealAssetsWithoutDeal: number;
  totalContentAssets: number;

  /** Ratio of repeated prompt fingerprints among recent generations, 0–1. */
  promptRepetitionRatio: number;
  daysSinceLastAsset: number | null;
  assetsLast30Days: number;
  targetAssetsPer30Days: number;

  paletteConsistency: number | null;
  demographicConsistency: number | null;
  /** Mean cosine similarity to approved face references. Null disables the metric. */
  identitySimilarity: number | null;

  profileCompletion: number;
}

export type MetricStatus = 'good' | 'fair' | 'poor' | 'unknown';

export interface HealthMetric {
  key: string;
  label: string;
  /** 0–100, or null when the metric cannot be computed. */
  score: number | null;
  status: MetricStatus;
  detail: string;
}

export interface HealthReport {
  overall: number;
  status: MetricStatus;
  metrics: HealthMetric[];
  /** Actionable, deterministic — the same list the todo engine consumes. */
  recommendations: string[];
}

const pct = (n: number) => Math.max(0, Math.min(100, Math.round(n)));

function statusFor(score: number | null): MetricStatus {
  if (score === null) return 'unknown';
  if (score >= 75) return 'good';
  if (score >= 45) return 'fair';
  return 'poor';
}

/** Saturating ratio: `have / want`, capped at 100. */
const coverage = (have: number, want: number) => pct((have / Math.max(1, want)) * 100);

export function computeCharacterHealth(input: HealthInput): HealthReport {
  const metrics: HealthMetric[] = [];
  const recommendations: string[] = [];

  const add = (key: string, label: string, score: number | null, detail: string) => {
    metrics.push({ key, label, score, status: statusFor(score), detail });
  };

  // Reference coverage — the four canonical reference types plus face refs.
  const refSlots = [input.hasMainImage, input.hasCharacterSheet, input.hasCloseUp, input.hasFeatureSheet];
  const refsPresent = refSlots.filter(Boolean).length;
  const faceScore = coverage(input.faceReferenceCount, 3);
  const referenceCoverage = pct((refsPresent / 4) * 60 + faceScore * 0.4);
  add('reference_coverage', 'Reference coverage', referenceCoverage,
    `${refsPresent}/4 canonical references, ${input.faceReferenceCount} face references`);
  if (!input.hasMainImage) recommendations.push('Add a main image');
  if (!input.hasCharacterSheet) recommendations.push('Create character sheet');
  if (!input.hasCloseUp) recommendations.push('Add a close-up reference');
  if (!input.hasFeatureSheet) recommendations.push('Add a feature sheet');
  if (input.faceReferenceCount < 3) recommendations.push('Add more face references');

  add('reference_quality', 'Reference quality',
    input.assetCount === 0 ? null : coverage(input.approvedAssetCount, Math.max(3, input.assetCount * 0.3)),
    `${input.approvedAssetCount} of ${input.assetCount} assets approved`);
  if (input.assetCount > 0 && input.approvedAssetCount === 0) {
    recommendations.push('Approve at least one reference asset');
  }

  add('asset_volume', 'Asset volume', coverage(input.assetCount, 24), `${input.assetCount} assets`);

  add('wardrobe_diversity', 'Wardrobe diversity', coverage(input.distinctOutfits, 8),
    `${input.distinctOutfits} distinct outfits`);
  if (input.distinctOutfits < 4) recommendations.push('Create more wardrobe variety');

  add('pose_variety', 'Pose variety', coverage(input.distinctPoses, 6), `${input.distinctPoses} distinct poses`);
  add('scene_diversity', 'Scene diversity', coverage(input.distinctLocations, 6),
    `${input.distinctLocations} distinct locations`);
  if (input.distinctLocations < 3) recommendations.push('Shoot in more locations');
  add('expression_variety', 'Expression variety', coverage(input.distinctExpressions, 5),
    `${input.distinctExpressions} distinct expressions`);

  const repetition = pct((1 - input.promptRepetitionRatio) * 100);
  add('repetition', 'Repetition score', repetition,
    `${Math.round(input.promptRepetitionRatio * 100)}% of recent prompts are repeats`);
  if (input.promptRepetitionRatio > 0.5) recommendations.push('Vary generation prompts — output is repetitive');

  const freshness = input.daysSinceLastAsset === null
    ? 0
    : pct(100 - Math.max(0, input.daysSinceLastAsset - 3) * 4);
  add('media_freshness', 'Media freshness', freshness,
    input.daysSinceLastAsset === null ? 'No assets yet' : `${input.daysSinceLastAsset} days since last asset`);

  add('content_frequency', 'Content frequency',
    coverage(input.assetsLast30Days, Math.max(1, input.targetAssetsPer30Days)),
    `${input.assetsLast30Days} assets in the last 30 days (target ${input.targetAssetsPer30Days})`);

  add('metadata_completeness', 'Missing metadata',
    input.totalContentAssets === 0 ? null
      : pct(100 - (input.assetsMissingMetadata / input.totalContentAssets) * 100),
    `${input.assetsMissingMetadata} assets missing generation metadata`);

  add('brand_compliance', 'Brand compliance',
    input.totalContentAssets === 0 ? null
      : pct(100 - (input.brandDealAssetsWithoutDeal / input.totalContentAssets) * 100),
    `${input.brandDealAssetsWithoutDeal} branded assets are not linked to a deal`);

  add('color_consistency', 'Color consistency',
    input.paletteConsistency === null ? null : pct(input.paletteConsistency * 100),
    input.paletteConsistency === null ? 'Not measured' : 'Palette similarity across recent assets');

  add('demographic_consistency', 'Demographic consistency',
    input.demographicConsistency === null ? null : pct(input.demographicConsistency * 100),
    input.demographicConsistency === null ? 'Not measured' : 'Declared traits match generation params');

  // Spec §16 is explicit that this is a quality-control heuristic, not identity
  // verification, so it is labelled as confidence and may be absent entirely.
  add('identity_confidence', 'Identity confidence',
    input.identitySimilarity === null ? null : pct(input.identitySimilarity * 100),
    input.identitySimilarity === null
      ? 'No embeddings stored — drift check unavailable'
      : 'Heuristic similarity to approved references, not identity verification');
  if (input.identitySimilarity !== null && input.identitySimilarity < 0.6) {
    recommendations.push('Face drift detected — regenerate from approved references');
  }

  add('profile_completion', 'Profile completion', pct(input.profileCompletion),
    `${pct(input.profileCompletion)}% of profile fields filled`);

  const scored = metrics.filter((m) => m.score !== null) as Array<HealthMetric & { score: number }>;
  const overall = scored.length === 0 ? 0 : pct(scored.reduce((s, m) => s + m.score, 0) / scored.length);

  return { overall, status: statusFor(overall), metrics, recommendations };
}

/** Cosine similarity, used by the optional drift heuristic. */
export function cosineSimilarity(a: number[], b: number[]): number | null {
  if (a.length === 0 || a.length !== b.length) return null;
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) {
    const x = a[i] ?? 0, y = b[i] ?? 0;
    dot += x * y; na += x * x; nb += y * y;
  }
  if (na === 0 || nb === 0) return null;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}
