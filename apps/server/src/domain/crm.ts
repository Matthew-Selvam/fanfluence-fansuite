import { z } from 'zod';

export const RelationshipStage = z.enum([
  'new', 'engaged', 'regular', 'loyal', 'vip', 'dormant', 'churned',
]);
export type RelationshipStage = z.infer<typeof RelationshipStage>;

export const SubscriberState = z.enum([
  'none', 'trialing', 'active', 'past_due', 'cancelled', 'expired',
]);
export type SubscriberState = z.infer<typeof SubscriberState>;

export const ConversationStatus = z.enum(['open', 'snoozed', 'closed', 'spam']);
export type ConversationStatus = z.infer<typeof ConversationStatus>;

export const MessageDirection = z.enum(['inbound', 'outbound']);
export type MessageDirection = z.infer<typeof MessageDirection>;

export const MessageStatus = z.enum([
  'draft', 'pending_approval', 'queued', 'sending', 'sent', 'delivered', 'read', 'failed', 'rejected',
]);
export type MessageStatus = z.infer<typeof MessageStatus>;

/** Spec §20 */
export const MemoryKind = z.enum(['semantic', 'episodic', 'operational']);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const TaskStatus = z.enum(['open', 'in_progress', 'blocked', 'done', 'cancelled']);
export type TaskStatus = z.infer<typeof TaskStatus>;

/** Spec §110 — deterministic keyword classifiers, no LLM round-trip. */
export const Intent = z.enum([
  'greeting', 'question', 'compliment', 'complaint', 'purchase_interest',
  'media_request', 'small_talk', 'goodbye', 'unsubscribe',
  'personal_disclosure', 'ai_probe', 'support', 'other',
]);
export type Intent = z.infer<typeof Intent>;

export const Emotion = z.enum([
  'positive', 'negative', 'neutral', 'excited', 'sad', 'angry', 'affectionate', 'anxious',
]);
export type Emotion = z.infer<typeof Emotion>;

// ── Segments (spec §22) ─────────────────────────────────────────────────────

export const SegmentOperator = z.enum([
  'eq', 'neq', 'contains', 'not_contains', 'gt', 'gte', 'lt', 'lte',
  'between', 'in', 'not_in', 'is_null', 'is_not_null',
  'within_days', 'before_days', 'has_tag', 'not_has_tag',
]);
export type SegmentOperator = z.infer<typeof SegmentOperator>;

/** Fields a segment may filter on. Anything not listed here is rejected. */
export const SEGMENT_FIELDS = [
  'name', 'username', 'platform', 'language', 'locale',
  'lastInteractionAt', 'firstInteractionAt', 'createdAt',
  'messageCount', 'interactionCount',
  'purchaseCount', 'totalSpendMinor', 'lastPurchaseAt',
  'subscriberState', 'blocked',
  'trust', 'loyalty', 'engagement', 'vip', 'stage', 'churnRisk', 'purchasePropensity',
  'tag', 'characterId',
] as const;
export type SegmentField = (typeof SEGMENT_FIELDS)[number];

export const SegmentCondition = z.object({
  field: z.enum(SEGMENT_FIELDS),
  op: SegmentOperator,
  value: z.union([z.string(), z.number(), z.boolean(), z.null(), z.array(z.union([z.string(), z.number()]))]).optional(),
});
export type SegmentCondition = z.infer<typeof SegmentCondition>;

export const SegmentDefinition = z.object({
  match: z.enum(['all', 'any']).default('all'),
  conditions: z.array(SegmentCondition).default([]),
  /** One level of nesting is enough for the builder UI and keeps SQL simple. */
  groups: z
    .array(
      z.object({
        match: z.enum(['all', 'any']).default('all'),
        conditions: z.array(SegmentCondition).default([]),
      }),
    )
    .default([]),
});
export type SegmentDefinition = z.infer<typeof SegmentDefinition>;

/** Spec §22 — the segments that always exist, defined as data, not code paths. */
export const BUILTIN_SEGMENTS: Record<string, { name: string; definition: SegmentDefinition }> = {
  all_fans: { name: 'All fans', definition: { match: 'all', conditions: [], groups: [] } },
  active_fans: {
    name: 'Active fans',
    definition: { match: 'all', conditions: [{ field: 'lastInteractionAt', op: 'within_days', value: 30 }], groups: [] },
  },
  vip: { name: 'VIP', definition: { match: 'all', conditions: [{ field: 'vip', op: 'eq', value: true }], groups: [] } },
  purchasers: {
    name: 'Purchasers',
    definition: { match: 'all', conditions: [{ field: 'purchaseCount', op: 'gt', value: 0 }], groups: [] },
  },
  non_purchasers: {
    name: 'Non-purchasers',
    definition: { match: 'all', conditions: [{ field: 'purchaseCount', op: 'eq', value: 0 }], groups: [] },
  },
  high_engagement: {
    name: 'High engagement',
    definition: { match: 'all', conditions: [{ field: 'engagement', op: 'gte', value: 70 }], groups: [] },
  },
  low_engagement: {
    name: 'Low engagement',
    definition: { match: 'all', conditions: [{ field: 'engagement', op: 'lt', value: 30 }], groups: [] },
  },
  dormant: {
    name: 'Dormant',
    definition: { match: 'all', conditions: [{ field: 'lastInteractionAt', op: 'before_days', value: 60 }], groups: [] },
  },
  new_fans: {
    name: 'New',
    definition: { match: 'all', conditions: [{ field: 'createdAt', op: 'within_days', value: 7 }], groups: [] },
  },
  high_spend: {
    name: 'High spend',
    definition: { match: 'all', conditions: [{ field: 'totalSpendMinor', op: 'gte', value: 10_000 }], groups: [] },
  },
  recently_purchased: {
    name: 'Recently purchased',
    definition: { match: 'all', conditions: [{ field: 'lastPurchaseAt', op: 'within_days', value: 30 }], groups: [] },
  },
};
