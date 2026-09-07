import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { baseColumns, bool, json, minorUnits, ts } from './_common.js';
import type {
  ConversationStatus,
  Emotion,
  Intent,
  MemoryKind,
  MessageDirection,
  MessageStatus,
  RelationshipStage,
  SegmentDefinition,
  SubscriberState,
  TaskStatus,
} from '../../domain/crm.js';

// ── Fans ────────────────────────────────────────────────────────────────────

export const fans = sqliteTable(
  'fans',
  {
    ...baseColumns('fan'),
    name: text('name'),
    username: text('username'),
    platform: text('platform').notNull().default('direct'),
    /** Platform-native id; the pair (platform, externalId) is the identity. */
    externalId: text('external_id'),
    avatarUrl: text('avatar_url'),
    locale: text('locale'),
    timezone: text('timezone'),
    language: text('language'),

    firstInteractionAt: ts('first_interaction_at'),
    lastInteractionAt: ts('last_interaction_at'),
    interactionCount: integer('interaction_count').notNull().default(0),
    messageCount: integer('message_count').notNull().default(0),

    purchaseCount: integer('purchase_count').notNull().default(0),
    totalSpendMinor: minorUnits('total_spend_minor').notNull().default(0),
    lastPurchaseAt: ts('last_purchase_at'),
    currency: text('currency').notNull().default('USD'),
    subscriberState: text('subscriber_state')
      .$type<SubscriberState>()
      .notNull()
      .default('none'),

    preferences: json<Record<string, unknown>>('preferences'),
    interests: json<string[]>('interests'),
    favoriteTopics: json<string[]>('favorite_topics'),
    notes: text('notes'),
    blocked: bool('blocked').notNull().default(false),
  },
  (t) => [
    uniqueIndex('fans_external_uq').on(t.workspaceId, t.platform, t.externalId),
    index('fans_workspace_ix').on(t.workspaceId, t.lastInteractionAt, t.deletedAt),
    index('fans_spend_ix').on(t.workspaceId, t.totalSpendMinor),
  ],
);

export const fanTags = sqliteTable(
  'fan_tags',
  {
    ...baseColumns('fanTag'),
    fanId: text('fan_id').notNull(),
    tag: text('tag').notNull(),
    /** Which automation applied it, so an automation can also remove it. */
    source: text('source').$type<'manual' | 'automation' | 'import' | 'ai'>().notNull().default('manual'),
    sourceId: text('source_id'),
  },
  (t) => [uniqueIndex('fan_tags_uq').on(t.fanId, t.tag)],
);

export const fanNotes = sqliteTable(
  'fan_notes',
  {
    ...baseColumns('fanNote'),
    fanId: text('fan_id').notNull(),
    authorUserId: text('author_user_id'),
    body: text('body').notNull(),
    pinned: bool('pinned').notNull().default(false),
  },
  (t) => [index('fan_notes_fan_ix').on(t.fanId, t.createdAt)],
);

/**
 * Spec §81 — a fan has one global relationship plus one per character. The row
 * with a null characterId is the global aggregate.
 */
export const relationships = sqliteTable(
  'relationships',
  {
    ...baseColumns('relationship'),
    fanId: text('fan_id').notNull(),
    characterId: text('character_id'),
    stage: text('stage').$type<RelationshipStage>().notNull().default('new'),
    trust: real('trust').notNull().default(0),
    loyalty: real('loyalty').notNull().default(0),
    engagement: real('engagement').notNull().default(0),
    vip: bool('vip').notNull().default(false),
    purchasePropensity: real('purchase_propensity').notNull().default(0),
    churnRisk: real('churn_risk').notNull().default(0),
    responseLikelihood: real('response_likelihood').notNull().default(0),
    interestScore: real('interest_score').notNull().default(0),
    lastComputedAt: ts('last_computed_at'),
  },
  (t) => [
    uniqueIndex('relationships_uq').on(t.fanId, t.characterId),
    index('relationships_vip_ix').on(t.workspaceId, t.vip),
  ],
);

/** Spec §21 — every score change is auditable back to the event that caused it. */
export const relationshipEvents = sqliteTable(
  'relationship_events',
  {
    ...baseColumns('relationshipEvent'),
    fanId: text('fan_id').notNull(),
    characterId: text('character_id'),
    kind: text('kind').notNull(),
    weight: real('weight').notNull().default(1),
    /** Score deltas actually applied, keyed by score name. */
    deltas: json<Record<string, number>>('deltas').notNull(),
    before: json<Record<string, number>>('before'),
    after: json<Record<string, number>>('after'),
    reason: text('reason'),
    sourceEventId: text('source_event_id'),
    actor: text('actor').$type<'system' | 'user' | 'automation' | 'ai'>().notNull().default('system'),
  },
  (t) => [index('relationship_events_fan_ix').on(t.fanId, t.createdAt)],
);

// ── Conversations & messages ────────────────────────────────────────────────

export const conversations = sqliteTable(
  'conversations',
  {
    ...baseColumns('conversation'),
    fanId: text('fan_id').notNull(),
    characterId: text('character_id'),
    channel: text('channel').notNull().default('direct'),
    externalId: text('external_id'),
    subject: text('subject'),
    status: text('status').$type<ConversationStatus>().notNull().default('open'),
    priority: integer('priority').notNull().default(0),
    unreadCount: integer('unread_count').notNull().default(0),
    important: bool('important').notNull().default(false),
    assignedUserId: text('assigned_user_id'),
    snoozedUntil: ts('snoozed_until'),
    lastMessageAt: ts('last_message_at'),
    lastMessagePreview: text('last_message_preview'),
    /** Saved but unsent operator draft. */
    draft: text('draft'),
  },
  (t) => [
    index('conversations_inbox_ix').on(t.workspaceId, t.status, t.lastMessageAt),
    index('conversations_fan_ix').on(t.fanId, t.characterId),
    uniqueIndex('conversations_external_uq').on(t.workspaceId, t.channel, t.externalId),
  ],
);

export const messages = sqliteTable(
  'messages',
  {
    ...baseColumns('message'),
    conversationId: text('conversation_id').notNull(),
    fanId: text('fan_id').notNull(),
    characterId: text('character_id'),
    direction: text('direction').$type<MessageDirection>().notNull(),
    /** Who actually produced the text — a human operator, an AI draft, or the fan. */
    author: text('author').$type<'fan' | 'operator' | 'ai' | 'automation' | 'system'>().notNull(),
    authorUserId: text('author_user_id'),
    body: text('body').notNull(),
    attachmentAssetIds: json<string[]>('attachment_asset_ids'),
    status: text('status').$type<MessageStatus>().notNull().default('sent'),
    externalId: text('external_id'),
    /** Spec §73 — set before dispatch so a retry cannot double-send. */
    idempotencyKey: text('idempotency_key'),
    intent: text('intent').$type<Intent>(),
    emotion: text('emotion').$type<Emotion>(),
    /** Provenance for AI drafts: provider, model, policy verdicts, retries. */
    aiMetadata: json<Record<string, unknown>>('ai_metadata'),
    approvalId: text('approval_id'),
    campaignId: text('campaign_id'),
    error: text('error'),
    sentAt: ts('sent_at'),
    readAt: ts('read_at'),
  },
  (t) => [
    index('messages_conversation_ix').on(t.conversationId, t.createdAt),
    index('messages_fan_ix').on(t.fanId, t.createdAt),
    uniqueIndex('messages_idempotency_uq').on(t.workspaceId, t.idempotencyKey),
  ],
);

/** Spec §20 — memory is structured, scoped, and individually controllable. */
export const memories = sqliteTable(
  'memories',
  {
    ...baseColumns('memory'),
    fanId: text('fan_id').notNull(),
    /** Null = applies across every character; otherwise scoped to one. */
    characterId: text('character_id'),
    kind: text('kind').$type<MemoryKind>().notNull(),
    key: text('key'),
    content: text('content').notNull(),
    confidence: real('confidence').notNull().default(0.5),
    source: text('source').$type<'manual' | 'ai' | 'automation' | 'import' | 'derived'>().notNull(),
    sourceMessageId: text('source_message_id'),
    pinned: bool('pinned').notNull().default(false),
    /** Suppressed memories stay visible to the operator but never enter a prompt. */
    suppressed: bool('suppressed').notNull().default(false),
    mergedIntoId: text('merged_into_id'),
    embedding: json<number[]>('embedding'),
    embeddingModel: text('embedding_model'),
    expiresAt: ts('expires_at'),
    lastUsedAt: ts('last_used_at'),
  },
  (t) => [
    index('memories_fan_ix').on(t.fanId, t.characterId, t.kind),
    index('memories_pinned_ix').on(t.fanId, t.pinned, t.suppressed),
  ],
);

// ── Commerce ────────────────────────────────────────────────────────────────

export const purchases = sqliteTable(
  'purchases',
  {
    ...baseColumns('purchase'),
    fanId: text('fan_id').notNull(),
    characterId: text('character_id'),
    campaignId: text('campaign_id'),
    externalId: text('external_id'),
    description: text('description'),
    productId: text('product_id'),
    amountMinor: minorUnits('amount_minor').notNull(),
    currency: text('currency').notNull().default('USD'),
    status: text('status')
      .$type<'pending' | 'completed' | 'refunded' | 'failed' | 'chargeback'>()
      .notNull()
      .default('pending'),
    occurredAt: ts('occurred_at').notNull(),
    idempotencyKey: text('idempotency_key'),
  },
  (t) => [
    index('purchases_fan_ix').on(t.fanId, t.occurredAt),
    uniqueIndex('purchases_idempotency_uq').on(t.workspaceId, t.idempotencyKey),
  ],
);

export const subscriptions = sqliteTable(
  'subscriptions',
  {
    ...baseColumns('subscription'),
    fanId: text('fan_id').notNull(),
    characterId: text('character_id'),
    plan: text('plan').notNull(),
    state: text('state').$type<SubscriberState>().notNull(),
    amountMinor: minorUnits('amount_minor'),
    currency: text('currency').notNull().default('USD'),
    interval: text('interval').$type<'day' | 'week' | 'month' | 'year'>(),
    startedAt: ts('started_at'),
    renewsAt: ts('renews_at'),
    cancelledAt: ts('cancelled_at'),
    externalId: text('external_id'),
  },
  (t) => [index('subscriptions_fan_ix').on(t.fanId, t.state)],
);

// ── Segments, campaigns, tasks ──────────────────────────────────────────────

/** Spec §22 — segments are stored definitions evaluated on read, not frozen lists. */
export const segments = sqliteTable(
  'segments',
  {
    ...baseColumns('segment'),
    name: text('name').notNull(),
    description: text('description'),
    /** Null for the built-in segments the system always provides. */
    definition: json<SegmentDefinition>('definition'),
    builtinKey: text('builtin_key'),
    characterId: text('character_id'),
    /** Cached count + timestamp so lists render without re-evaluating. */
    cachedCount: integer('cached_count'),
    cachedAt: ts('cached_at'),
    color: text('color'),
  },
  (t) => [uniqueIndex('segments_name_uq').on(t.workspaceId, t.name)],
);

export const campaigns = sqliteTable(
  'campaigns',
  {
    ...baseColumns('campaign'),
    name: text('name').notNull(),
    objective: text('objective')
      .$type<
        | 're_engagement'
        | 'announcement'
        | 'launch'
        | 'promotion'
        | 'content_drop'
        | 'vip_outreach'
        | 'follow_up'
        | 'retention'
      >()
      .notNull(),
    characterId: text('character_id'),
    segmentId: text('segment_id'),
    status: text('status')
      .$type<'draft' | 'scheduled' | 'running' | 'paused' | 'completed' | 'cancelled' | 'failed'>()
      .notNull()
      .default('draft'),
    messageTemplate: text('message_template'),
    /** Alternate bodies for simple A/B splits. */
    variants: json<Array<{ key: string; body: string; weight?: number }>>('variants'),
    assetIds: json<string[]>('asset_ids'),
    scheduledAt: ts('scheduled_at'),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    /** Spec §35 — per-campaign approval and rate policy. */
    approvalPolicy: text('approval_policy')
      .$type<'always_ask' | 'ask_once' | 'high_risk_only' | 'autonomous'>()
      .notNull()
      .default('always_ask'),
    maxSendsPerHour: integer('max_sends_per_hour'),
    quietHours: json<{ startHour: number; endHour: number; timezone: string }>('quiet_hours'),
    stats: json<Record<string, number>>('stats'),
  },
  (t) => [index('campaigns_workspace_ix').on(t.workspaceId, t.status, t.deletedAt)],
);

export const campaignMessages = sqliteTable(
  'campaign_messages',
  {
    ...baseColumns('campaignMessage'),
    campaignId: text('campaign_id').notNull(),
    fanId: text('fan_id').notNull(),
    conversationId: text('conversation_id'),
    messageId: text('message_id'),
    variantKey: text('variant_key'),
    status: text('status')
      .$type<'pending' | 'approved' | 'sent' | 'failed' | 'skipped' | 'rejected'>()
      .notNull()
      .default('pending'),
    body: text('body'),
    error: text('error'),
    sentAt: ts('sent_at'),
  },
  (t) => [
    uniqueIndex('campaign_messages_uq').on(t.campaignId, t.fanId),
    index('campaign_messages_status_ix').on(t.campaignId, t.status),
  ],
);

export const tasks = sqliteTable(
  'tasks',
  {
    ...baseColumns('task'),
    title: text('title').notNull(),
    body: text('body'),
    fanId: text('fan_id'),
    characterId: text('character_id'),
    campaignId: text('campaign_id'),
    conversationId: text('conversation_id'),
    dueAt: ts('due_at'),
    priority: integer('priority').notNull().default(0),
    assigneeUserId: text('assignee_user_id'),
    status: text('status').$type<TaskStatus>().notNull().default('open'),
    /** What created it, so automation-generated tasks can be filtered out. */
    trigger: text('trigger'),
    source: text('source').$type<'manual' | 'automation' | 'system' | 'ai'>().notNull().default('manual'),
    sourceId: text('source_id'),
    completedAt: ts('completed_at'),
  },
  (t) => [
    index('tasks_inbox_ix').on(t.workspaceId, t.status, t.dueAt),
    index('tasks_assignee_ix').on(t.assigneeUserId, t.status),
    uniqueIndex('tasks_dedupe_uq').on(t.workspaceId, t.source, t.sourceId, t.title),
  ],
);
