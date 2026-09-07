import type { RelationshipStage } from './crm.js';

/**
 * Spec §21 — the relationship engine. Deterministic, auditable, and entirely
 * free of AI: every score change traces to a typed event with a fixed weight.
 */
export const RELATIONSHIP_EVENT_KINDS = [
  'message_inbound',
  'message_outbound',
  'reply',
  'positive_interaction',
  'negative_interaction',
  'purchase',
  'subscription_started',
  'subscription_cancelled',
  'refund',
  'media_request',
  'campaign_response',
  'campaign_ignored',
  'manual_adjustment',
  'inactivity',
] as const;
export type RelationshipEventKind = (typeof RELATIONSHIP_EVENT_KINDS)[number];

export interface Scores {
  trust: number;
  loyalty: number;
  engagement: number;
  purchasePropensity: number;
  churnRisk: number;
  responseLikelihood: number;
  interestScore: number;
}

export const ZERO_SCORES: Scores = {
  trust: 0, loyalty: 0, engagement: 0,
  purchasePropensity: 0, churnRisk: 0, responseLikelihood: 0, interestScore: 0,
};

/** Base deltas per event kind, before weighting. Every score is 0–100. */
const DELTAS: Record<RelationshipEventKind, Partial<Scores>> = {
  message_inbound:        { engagement: 2, interestScore: 1.5, responseLikelihood: 1, churnRisk: -2 },
  message_outbound:       { engagement: 0.5 },
  reply:                  { engagement: 3, trust: 1, responseLikelihood: 3, churnRisk: -3 },
  positive_interaction:   { trust: 3, engagement: 2, loyalty: 1.5, churnRisk: -2 },
  negative_interaction:   { trust: -5, engagement: -2, loyalty: -3, churnRisk: 6 },
  purchase:               { loyalty: 8, trust: 4, purchasePropensity: 10, churnRisk: -8 },
  subscription_started:   { loyalty: 12, trust: 5, purchasePropensity: 8, churnRisk: -12 },
  subscription_cancelled: { loyalty: -10, churnRisk: 15, purchasePropensity: -5 },
  refund:                 { trust: -6, loyalty: -6, purchasePropensity: -8, churnRisk: 10 },
  media_request:          { engagement: 3, interestScore: 4, purchasePropensity: 3 },
  campaign_response:      { engagement: 4, loyalty: 2, responseLikelihood: 4, churnRisk: -3 },
  campaign_ignored:       { responseLikelihood: -2, churnRisk: 2 },
  manual_adjustment:      {},
  inactivity:             { engagement: -3, churnRisk: 4, responseLikelihood: -2 },
};

const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n * 100) / 100));

export interface ApplyEventInput {
  current: Scores;
  kind: RelationshipEventKind;
  /** Multiplier on the base deltas — e.g. purchase value, message length. */
  weight?: number;
  /** For `manual_adjustment`, the operator supplies the deltas directly. */
  explicitDeltas?: Partial<Scores>;
}

export interface ApplyEventResult {
  before: Scores;
  after: Scores;
  deltas: Partial<Scores>;
}

export function applyRelationshipEvent(input: ApplyEventInput): ApplyEventResult {
  const base = input.explicitDeltas ?? DELTAS[input.kind];
  const weight = input.weight ?? 1;

  const deltas: Partial<Scores> = {};
  const after: Scores = { ...input.current };

  for (const [key, value] of Object.entries(base) as Array<[keyof Scores, number]>) {
    const delta = value * weight;
    if (delta === 0) continue;
    deltas[key] = Math.round(delta * 100) / 100;
    after[key] = clamp(input.current[key] + delta);
  }

  return { before: input.current, after, deltas };
}

/**
 * Purchase weight scales with value but sub-linearly, so one large purchase
 * cannot pin every score to 100.
 */
export function purchaseWeight(amountMinor: number): number {
  if (amountMinor <= 0) return 0;
  return Math.min(3, Math.log10(amountMinor / 100 + 1) + 0.5);
}

export interface StageInput {
  scores: Scores;
  purchaseCount: number;
  totalSpendMinor: number;
  messageCount: number;
  daysSinceLastInteraction: number | null;
  vipSpendThresholdMinor?: number;
}

/** Stage is derived, never stored as the source of truth. */
export function deriveStage(input: StageInput): RelationshipStage {
  const { scores, purchaseCount, totalSpendMinor, messageCount, daysSinceLastInteraction } = input;
  const vipThreshold = input.vipSpendThresholdMinor ?? 50_000;

  if (daysSinceLastInteraction !== null && daysSinceLastInteraction > 180) return 'churned';
  if (daysSinceLastInteraction !== null && daysSinceLastInteraction > 60) return 'dormant';

  if (totalSpendMinor >= vipThreshold || (scores.loyalty >= 80 && purchaseCount >= 3)) return 'vip';
  if (scores.loyalty >= 55 || purchaseCount >= 2) return 'loyal';
  if (messageCount >= 20 || scores.engagement >= 50) return 'regular';
  if (messageCount >= 3 || scores.engagement >= 15) return 'engaged';
  return 'new';
}

/** Spec §18 — VIP is a threshold on derived state, not a manual-only flag. */
export function deriveVip(input: StageInput): boolean {
  return deriveStage(input) === 'vip';
}

/**
 * Decay applied by the maintenance queue. Engagement fades and churn risk
 * climbs when a fan goes quiet, which is what makes `dormant` reachable
 * without an incoming event.
 */
export function decayScores(scores: Scores, daysSinceLastInteraction: number): Scores {
  if (daysSinceLastInteraction < 7) return scores;
  const periods = Math.floor(daysSinceLastInteraction / 7);
  const factor = 0.95 ** periods;
  return {
    ...scores,
    engagement: clamp(scores.engagement * factor),
    responseLikelihood: clamp(scores.responseLikelihood * factor),
    interestScore: clamp(scores.interestScore * factor),
    churnRisk: clamp(scores.churnRisk + periods * 1.5),
  };
}
