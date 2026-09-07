import { index, integer, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { baseColumns, bool, globalColumns, json, minorUnits, ts } from './_common.js';
import type {
  AutomationRule,
  AutonomyMode,
  Guardrails,
} from '../../domain/automation.js';
import type { HealthState } from '../../domain/health.js';
import type { Capability } from '../../domain/capabilities.js';
import type { JobStatus, JobType, QueueName } from '../../domain/jobs.js';

// ── Providers & integrations ────────────────────────────────────────────────

/**
 * Spec §26/§118 — one row per connected provider, of any kind. Secrets are not
 * here: `credentialRef` points into the `secrets` table.
 */
export const providers = sqliteTable(
  'providers',
  {
    ...baseColumns('provider'),
    name: text('name').notNull(),
    /** Adapter key in the integration registry, e.g. `ollama`, `higgsfield`. */
    adapter: text('adapter').notNull(),
    kind: text('kind').$type<'llm' | 'media' | 'publishing' | 'embedding' | 'storage'>().notNull(),
    endpoint: text('endpoint'),
    authKind: text('auth_kind')
      .$type<'none' | 'bearer' | 'api_key_header' | 'basic' | 'oauth2'>()
      .notNull()
      .default('none'),
    credentialRef: text('credential_ref'),
    config: json<Record<string, unknown>>('config'),
    /** Capabilities the adapter actually advertised at last probe (§32). */
    capabilities: json<Capability[]>('capabilities'),
    defaultModel: text('default_model'),
    embeddingModel: text('embedding_model'),
    contextWindow: integer('context_window'),
    health: text('health').$type<HealthState>().notNull().default('unknown'),
    healthDetail: text('health_detail'),
    healthCheckedAt: ts('health_checked_at'),
    enabled: bool('enabled').notNull().default(true),
    /** Spec §71 — lower number wins when routing. */
    priority: integer('priority').notNull().default(100),
    /** Spec §125 */
    rateLimitPerMinute: integer('rate_limit_per_minute'),
    monthlyBudgetMinor: minorUnits('monthly_budget_minor'),
  },
  (t) => [
    index('providers_kind_ix').on(t.workspaceId, t.kind, t.enabled, t.priority),
    uniqueIndex('providers_name_uq').on(t.workspaceId, t.name),
  ],
);

/** Spec §115/§116 — the catalog that drives dynamically generated request forms. */
export const providerModels = sqliteTable(
  'provider_models',
  {
    ...baseColumns('providerModel'),
    providerId: text('provider_id').notNull(),
    modelId: text('model_id').notNull(),
    name: text('name').notNull(),
    capabilities: json<Capability[]>('capabilities').notNull(),
    inputTypes: json<string[]>('input_types'),
    outputTypes: json<string[]>('output_types'),
    /** JSON Schema for this model's parameters; the UI renders a form from it. */
    paramSchema: json<Record<string, unknown>>('param_schema'),
    maxResolution: text('max_resolution'),
    maxDurationMs: integer('max_duration_ms'),
    contextWindow: integer('context_window'),
    costPerUnitMinor: real('cost_per_unit_minor'),
    costUnit: text('cost_unit'),
    available: bool('available').notNull().default(true),
  },
  (t) => [uniqueIndex('provider_models_uq').on(t.providerId, t.modelId)],
);

export const integrations = sqliteTable(
  'integrations',
  {
    ...baseColumns('integration'),
    adapter: text('adapter').notNull(),
    name: text('name').notNull(),
    connectionKind: text('connection_kind')
      .$type<'localhost' | 'docker' | 'remote' | 'desktop_local' | 'cloud'>()
      .notNull()
      .default('remote'),
    endpoint: text('endpoint'),
    credentialRef: text('credential_ref'),
    config: json<Record<string, unknown>>('config'),
    health: text('health').$type<HealthState>().notNull().default('unknown'),
    healthDetail: text('health_detail'),
    healthCheckedAt: ts('health_checked_at'),
    enabled: bool('enabled').notNull().default(true),
    /** Shared secret used to verify inbound webhook signatures (§117). */
    webhookSecretRef: text('webhook_secret_ref'),
  },
  (t) => [uniqueIndex('integrations_uq').on(t.workspaceId, t.adapter, t.name)],
);

// ── Jobs ────────────────────────────────────────────────────────────────────

/**
 * Spec §43/§100 — one durable job table backs every queue. Rows survive restart,
 * which is what makes "jobs survive reload" true rather than aspirational.
 */
export const jobs = sqliteTable(
  'jobs',
  {
    ...baseColumns('job'),
    queue: text('queue').$type<QueueName>().notNull(),
    type: text('type').$type<JobType>().notNull(),
    status: text('status').$type<JobStatus>().notNull().default('queued'),
    priority: integer('priority').notNull().default(0),
    payload: json<Record<string, unknown>>('payload').notNull(),
    result: json<Record<string, unknown>>('result'),

    /** Spec §73 — a duplicate key is a no-op, not a second billable submission. */
    idempotencyKey: text('idempotency_key'),
    /** Lease-based claiming: a worker holds the row until `lockedUntil` passes. */
    lockedBy: text('locked_by'),
    lockedUntil: ts('locked_until'),

    runAt: ts('run_at').notNull(),
    startedAt: ts('started_at'),
    completedAt: ts('completed_at'),
    attempts: integer('attempts').notNull().default(0),
    maxAttempts: integer('max_attempts').notNull().default(3),
    timeoutMs: integer('timeout_ms').notNull().default(300_000),
    progress: real('progress').notNull().default(0),
    progressLabel: text('progress_label'),

    error: text('error'),
    errorCode: text('error_code'),
    /** Spec §100 — exhausted jobs land here rather than vanishing. */
    deadLetteredAt: ts('dead_lettered_at'),

    characterId: text('character_id'),
    campaignId: text('campaign_id'),
    providerId: text('provider_id'),
    parentJobId: text('parent_job_id'),
    createdByUserId: text('created_by_user_id'),
    automationRunId: text('automation_run_id'),
  },
  (t) => [
    index('jobs_claim_ix').on(t.queue, t.status, t.runAt, t.priority),
    index('jobs_workspace_ix').on(t.workspaceId, t.status, t.createdAt),
    uniqueIndex('jobs_idempotency_uq').on(t.workspaceId, t.idempotencyKey),
  ],
);

/** Provider-facing detail for generation jobs, kept off the hot `jobs` row. */
export const generationJobs = sqliteTable(
  'generation_jobs',
  {
    ...baseColumns('generationJob'),
    jobId: text('job_id').notNull(),
    briefId: text('brief_id'),
    shotId: text('shot_id'),
    providerId: text('provider_id'),
    model: text('model'),
    kind: text('kind').$type<'image' | 'video' | 'audio' | 'text' | 'embedding'>().notNull(),
    /** The provider's own id for the task — the handle used to poll, never resubmit (§41). */
    externalId: text('external_id'),
    request: json<Record<string, unknown>>('request').notNull(),
    rawResponse: json<Record<string, unknown>>('raw_response'),
    estimatedCostMinor: real('estimated_cost_minor'),
    actualCostMinor: real('actual_cost_minor'),
    creditsUsed: real('credits_used'),
    currency: text('currency').notNull().default('USD'),
    durationMs: integer('duration_ms'),
  },
  (t) => [
    uniqueIndex('generation_jobs_job_uq').on(t.jobId),
    index('generation_jobs_external_ix').on(t.providerId, t.externalId),
  ],
);

export const generationOutputs = sqliteTable(
  'generation_outputs',
  {
    ...baseColumns('generationOutput'),
    generationJobId: text('generation_job_id').notNull(),
    assetId: text('asset_id'),
    /** Provider URL before the bytes are downloaded into local storage. */
    remoteUrl: text('remote_url'),
    index: integer('output_index').notNull().default(0),
    metadata: json<Record<string, unknown>>('metadata'),
  },
  (t) => [index('generation_outputs_job_ix').on(t.generationJobId)],
);

// ── Publishing ──────────────────────────────────────────────────────────────

export const publishingAccounts = sqliteTable(
  'publishing_accounts',
  {
    ...baseColumns('publishingAccount'),
    integrationId: text('integration_id'),
    platform: text('platform').notNull(),
    handle: text('handle').notNull(),
    displayName: text('display_name'),
    characterId: text('character_id'),
    credentialRef: text('credential_ref'),
    health: text('health').$type<HealthState>().notNull().default('unknown'),
    enabled: bool('enabled').notNull().default(true),
    /** Spec §94 — a sandbox account must never reach a production channel. */
    sandbox: bool('sandbox').notNull().default(false),
  },
  (t) => [uniqueIndex('publishing_accounts_uq').on(t.workspaceId, t.platform, t.handle)],
);

/** Spec §39 — a local mirror of Open-Dispatch queue state, not a rival abstraction. */
export const publishingJobs = sqliteTable(
  'publishing_jobs',
  {
    ...baseColumns('publishingJob'),
    jobId: text('job_id'),
    accountId: text('publishing_account_id'),
    characterId: text('character_id'),
    campaignId: text('campaign_id'),
    scriptId: text('script_id'),
    brandDealId: text('brand_deal_id'),
    platform: text('platform').notNull(),
    caption: text('caption'),
    assetIds: json<string[]>('asset_ids'),
    /** Mirrors Open-Dispatch: draft|ready|queued|publishing|published|failed|dead. */
    state: text('state')
      .$type<'draft' | 'ready' | 'queued' | 'publishing' | 'published' | 'failed' | 'dead'>()
      .notNull()
      .default('draft'),
    dispatchId: text('dispatch_id'),
    permalink: text('permalink'),
    scheduledAt: ts('scheduled_at'),
    publishedAt: ts('published_at'),
    attempts: integer('attempts').notNull().default(0),
    error: text('error'),
    idempotencyKey: text('idempotency_key'),
    sandbox: bool('sandbox').notNull().default(false),
  },
  (t) => [
    index('publishing_jobs_state_ix').on(t.workspaceId, t.state, t.scheduledAt),
    uniqueIndex('publishing_jobs_idempotency_uq').on(t.workspaceId, t.idempotencyKey),
  ],
);

// ── Automation & autonomy ───────────────────────────────────────────────────

export const automations = sqliteTable(
  'automations',
  {
    ...baseColumns('automation'),
    name: text('name').notNull(),
    description: text('description'),
    enabled: bool('enabled').notNull().default(false),
    /** WHEN / IF / THEN / UNLESS (spec §76). Pure data — no AI required to run. */
    rule: json<AutomationRule>('rule').notNull(),
    /** Cron expression for schedule-triggered rules (spec §77). */
    schedule: text('schedule'),
    timezone: text('timezone'),
    characterId: text('character_id'),
    autonomyMode: text('autonomy_mode').$type<AutonomyMode>().notNull().default('manual'),
    guardrails: json<Guardrails>('guardrails'),
    lastRunAt: ts('last_run_at'),
    nextRunAt: ts('next_run_at'),
    runCount: integer('run_count').notNull().default(0),
    failureCount: integer('failure_count').notNull().default(0),
    /** Consecutive failures trip this; a tripped rule stops firing until reset. */
    circuitOpen: bool('circuit_open').notNull().default(false),
  },
  (t) => [
    index('automations_enabled_ix').on(t.workspaceId, t.enabled, t.deletedAt),
    index('automations_schedule_ix').on(t.enabled, t.nextRunAt),
  ],
);

/** Spec §123 — a full record of what an autonomous run decided and did. */
export const automationRuns = sqliteTable(
  'automation_runs',
  {
    ...baseColumns('automationRun'),
    automationId: text('automation_id'),
    goalId: text('goal_id'),
    trigger: text('trigger').notNull(),
    triggerEventId: text('trigger_event_id'),
    status: text('status')
      .$type<'running' | 'completed' | 'failed' | 'skipped' | 'awaiting_approval' | 'cancelled'>()
      .notNull()
      .default('running'),
    /** Ordered log of condition evaluations, tool calls and their results. */
    steps: json<
      Array<{
        at: string;
        kind: 'condition' | 'action' | 'tool' | 'approval' | 'error' | 'note';
        name: string;
        input?: unknown;
        output?: unknown;
        ok: boolean;
        detail?: string;
      }>
    >('steps'),
    actionsTaken: integer('actions_taken').notNull().default(0),
    costMinor: real('cost_minor'),
    error: text('error'),
    startedAt: ts('started_at').notNull(),
    completedAt: ts('completed_at'),
  },
  (t) => [index('automation_runs_automation_ix').on(t.automationId, t.startedAt)],
);

/** Spec §33/§122 — a goal is the unit of autonomous work: plan, budget, audit. */
export const goals = sqliteTable(
  'goals',
  {
    ...baseColumns('goal'),
    objective: text('objective').notNull(),
    characterId: text('character_id'),
    segmentId: text('segment_id'),
    mode: text('mode').$type<AutonomyMode>().notNull().default('assisted'),
    guardrails: json<Guardrails>('guardrails').notNull(),
    successCriteria: json<string[]>('success_criteria'),
    failurePolicy: text('failure_policy').$type<'stop' | 'continue' | 'escalate'>().notNull().default('stop'),
    schedule: text('schedule'),
    status: text('status')
      .$type<'draft' | 'planned' | 'awaiting_approval' | 'running' | 'paused' | 'completed' | 'failed' | 'cancelled'>()
      .notNull()
      .default('draft'),
    budgetMinor: minorUnits('budget_minor'),
    spentMinor: real('spent_minor').notNull().default(0),
  },
  (t) => [index('goals_workspace_ix').on(t.workspaceId, t.status)],
);

/** The plan (spec §122) — every step visible and editable before execution. */
export const goalSteps = sqliteTable(
  'goal_steps',
  {
    ...baseColumns('goalStep'),
    goalId: text('goal_id').notNull(),
    position: integer('position').notNull(),
    title: text('title').notNull(),
    tool: text('tool'),
    input: json<Record<string, unknown>>('input'),
    output: json<Record<string, unknown>>('output'),
    status: text('status')
      .$type<'pending' | 'approved' | 'running' | 'completed' | 'failed' | 'skipped' | 'rejected'>()
      .notNull()
      .default('pending'),
    requiresApproval: bool('requires_approval').notNull().default(true),
    error: text('error'),
  },
  (t) => [uniqueIndex('goal_steps_position_uq').on(t.goalId, t.position)],
);

/** Spec §78 — one inbox for everything waiting on a human. */
export const approvals = sqliteTable(
  'approvals',
  {
    ...baseColumns('approval'),
    kind: text('kind')
      .$type<'message' | 'content' | 'campaign' | 'publication' | 'automation_action' | 'ai_decision' | 'spend'>()
      .notNull(),
    title: text('title').notNull(),
    summary: text('summary'),
    /** Enough to execute the action verbatim once approved. */
    payload: json<Record<string, unknown>>('payload').notNull(),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    characterId: text('character_id'),
    fanId: text('fan_id'),
    automationRunId: text('automation_run_id'),
    goalStepId: text('goal_step_id'),
    status: text('status')
      .$type<'pending' | 'approved' | 'rejected' | 'expired' | 'auto_approved'>()
      .notNull()
      .default('pending'),
    riskLevel: text('risk_level').$type<'low' | 'medium' | 'high'>().notNull().default('medium'),
    decidedByUserId: text('decided_by_user_id'),
    decidedAt: ts('decided_at'),
    decisionNote: text('decision_note'),
    /** Edited payload when the reviewer chose "Edit" rather than plain approve. */
    revisedPayload: json<Record<string, unknown>>('revised_payload'),
    expiresAt: ts('expires_at'),
  },
  (t) => [index('approvals_pending_ix').on(t.workspaceId, t.status, t.createdAt)],
);

// ── Events, audit, notifications ────────────────────────────────────────────

/** Spec §25 — append-only domain event log. Never updated, never soft-deleted. */
export const events = sqliteTable(
  'events',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    type: text('type').notNull(),
    timestamp: ts('timestamp').notNull(),
    characterId: text('character_id'),
    fanId: text('fan_id'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    source: text('source').notNull().default('system'),
    actor: text('actor').$type<'system' | 'user' | 'automation' | 'ai' | 'provider' | 'webhook'>().notNull(),
    actorId: text('actor_id'),
    payload: json<Record<string, unknown>>('payload'),
    /** Set once every subscriber has been dispatched, so replay can resume. */
    dispatchedAt: ts('dispatched_at'),
  },
  (t) => [
    index('events_workspace_ix').on(t.workspaceId, t.timestamp),
    index('events_type_ix').on(t.workspaceId, t.type, t.timestamp),
    index('events_entity_ix').on(t.entityType, t.entityId),
    index('events_undispatched_ix').on(t.dispatchedAt, t.timestamp),
  ],
);

/** Spec §57 — before/after for every consequential action. */
export const auditLogs = sqliteTable(
  'audit_logs',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    timestamp: ts('timestamp').notNull(),
    action: text('action').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id'),
    userId: text('user_id'),
    actor: text('actor').$type<'user' | 'system' | 'automation' | 'ai'>().notNull(),
    deviceId: text('device_id'),
    source: text('source'),
    automationRunId: text('automation_run_id'),
    before: json<unknown>('before'),
    after: json<unknown>('after'),
    ip: text('ip'),
  },
  (t) => [
    index('audit_logs_workspace_ix').on(t.workspaceId, t.timestamp),
    index('audit_logs_entity_ix').on(t.entityType, t.entityId, t.timestamp),
  ],
);

export const notifications = sqliteTable(
  'notifications',
  {
    ...baseColumns('notification'),
    kind: text('kind').notNull(),
    severity: text('severity').$type<'info' | 'success' | 'warning' | 'error'>().notNull().default('info'),
    title: text('title').notNull(),
    body: text('body'),
    userId: text('user_id'),
    entityType: text('entity_type'),
    entityId: text('entity_id'),
    /** Where the UI should navigate when the notification is opened. */
    actionUrl: text('action_url'),
    readAt: ts('read_at'),
    /** Which channels this was actually delivered on. */
    deliveredChannels: json<string[]>('delivered_channels'),
  },
  (t) => [index('notifications_user_ix').on(t.workspaceId, t.userId, t.readAt, t.createdAt)],
);

/** Spec §117 — raw inbound webhooks, persisted before mapping so replay is possible. */
export const webhookDeliveries = sqliteTable(
  'webhook_deliveries',
  {
    id: text('id').primaryKey(),
    workspaceId: text('workspace_id'),
    adapter: text('adapter').notNull(),
    receivedAt: ts('received_at').notNull(),
    signatureValid: bool('signature_valid').notNull().default(false),
    /** Provider-supplied event id; the dedupe key for at-least-once delivery. */
    externalEventId: text('external_event_id'),
    headers: json<Record<string, string>>('headers'),
    body: json<unknown>('body'),
    processedAt: ts('processed_at'),
    error: text('error'),
  },
  (t) => [
    uniqueIndex('webhook_deliveries_uq').on(t.adapter, t.externalEventId),
    index('webhook_deliveries_unprocessed_ix').on(t.processedAt, t.receivedAt),
  ],
);

/** Spec §70 — cost ledger, queryable per character / campaign / provider / model. */
export const costRecords = sqliteTable(
  'cost_records',
  {
    ...baseColumns('job'),
    providerId: text('provider_id'),
    model: text('model'),
    jobId: text('job_id'),
    characterId: text('character_id'),
    campaignId: text('campaign_id'),
    automationRunId: text('automation_run_id'),
    kind: text('kind').notNull(),
    quantity: real('quantity'),
    unit: text('unit'),
    estimatedMinor: real('estimated_minor'),
    actualMinor: real('actual_minor'),
    currency: text('currency').notNull().default('USD'),
    occurredAt: ts('occurred_at').notNull(),
  },
  (t) => [index('cost_records_ix').on(t.workspaceId, t.occurredAt, t.providerId)],
);

/** Spec §125 — fixed-window counters, keyed by whatever dimension is limited. */
export const rateCounters = sqliteTable(
  'rate_counters',
  {
    key: text('key').primaryKey(),
    workspaceId: text('workspace_id').notNull(),
    windowStart: ts('window_start').notNull(),
    windowMs: integer('window_ms').notNull(),
    count: integer('count').notNull().default(0),
    limit: integer('limit_value').notNull(),
  },
  (t) => [index('rate_counters_window_ix').on(t.windowStart)],
);

/** Spec §50 — per-entity sync bookkeeping for the local↔cloud engine. */
export const syncRecords = sqliteTable(
  'sync_records',
  {
    ...globalColumns('syncRecord'),
    workspaceId: text('workspace_id').notNull(),
    entityType: text('entity_type').notNull(),
    entityId: text('entity_id').notNull(),
    entityVersion: integer('entity_version').notNull(),
    operation: text('operation').$type<'insert' | 'update' | 'delete'>().notNull(),
    deviceId: text('device_id').notNull(),
    checksum: text('checksum').notNull(),
    syncedAt: ts('synced_at'),
    conflict: bool('conflict').notNull().default(false),
    conflictDetail: json<Record<string, unknown>>('conflict_detail'),
  },
  (t) => [
    index('sync_records_pending_ix').on(t.workspaceId, t.syncedAt),
    uniqueIndex('sync_records_uq').on(t.entityType, t.entityId, t.entityVersion, t.deviceId),
  ],
);
