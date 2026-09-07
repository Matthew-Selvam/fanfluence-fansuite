import { z } from 'zod';

/** Spec §36 */
export const AutonomyMode = z.enum(['manual', 'copilot', 'assisted', 'autonomous', 'mission']);
export type AutonomyMode = z.infer<typeof AutonomyMode>;

export const ApprovalPolicy = z.enum(['always_ask', 'ask_once', 'high_risk_only', 'autonomous']);
export type ApprovalPolicy = z.infer<typeof ApprovalPolicy>;

/** Spec §121 — the trigger nodes the builder exposes. */
export const AutomationTrigger = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('event'), eventType: z.string() }),
  z.object({ kind: z.literal('schedule'), cron: z.string(), timezone: z.string().default('UTC') }),
  z.object({ kind: z.literal('manual') }),
  z.object({ kind: z.literal('webhook'), adapter: z.string() }),
]);
export type AutomationTrigger = z.infer<typeof AutomationTrigger>;

/**
 * Conditions read from a flat, dotted fact bag assembled by the evaluator, so
 * a rule never needs to know how to query the database.
 */
export const ConditionOperator = z.enum([
  'eq', 'neq', 'gt', 'gte', 'lt', 'lte',
  'contains', 'not_contains', 'in', 'not_in',
  'is_null', 'is_not_null', 'matches',
]);
export type ConditionOperator = z.infer<typeof ConditionOperator>;

export const Condition = z.object({
  path: z.string(),
  op: ConditionOperator,
  value: z.unknown().optional(),
});
export type Condition = z.infer<typeof Condition>;

/** Spec §121 — action nodes. Every one of these runs without an LLM except `draft_message`. */
export const AutomationAction = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('tag_fan'), tag: z.string(), fanIdPath: z.string().default('fan.id') }),
  z.object({ kind: z.literal('untag_fan'), tag: z.string(), fanIdPath: z.string().default('fan.id') }),
  z.object({
    kind: z.literal('create_task'),
    title: z.string(),
    body: z.string().optional(),
    dueInHours: z.number().optional(),
    priority: z.number().int().min(0).max(3).default(1),
    assigneeUserId: z.string().optional(),
  }),
  z.object({
    kind: z.literal('notify'),
    title: z.string(),
    body: z.string().optional(),
    severity: z.enum(['info', 'success', 'warning', 'error']).default('info'),
    channels: z.array(z.enum(['in_app', 'desktop', 'email', 'webhook'])).default(['in_app']),
  }),
  z.object({
    kind: z.literal('adjust_relationship'),
    deltas: z.record(z.string(), z.number()),
    reason: z.string().optional(),
  }),
  z.object({ kind: z.literal('set_vip'), value: z.boolean() }),
  z.object({
    kind: z.literal('draft_message'),
    template: z.string().optional(),
    /** Requires an LLM capability; skipped with a logged note if none exists. */
    useAi: z.boolean().default(false),
    requiresApproval: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('send_message'),
    template: z.string(),
    requiresApproval: z.boolean().default(true),
  }),
  z.object({
    kind: z.literal('generate_content'),
    briefId: z.string().optional(),
    characterIdPath: z.string().default('character.id'),
    requiresApproval: z.boolean().default(true),
  }),
  z.object({ kind: z.literal('create_campaign'), name: z.string(), segmentId: z.string().optional() }),
  z.object({ kind: z.literal('dispatch'), publishingJobIdPath: z.string(), requiresApproval: z.boolean().default(true) }),
  z.object({ kind: z.literal('wait'), seconds: z.number().int().positive() }),
  z.object({ kind: z.literal('emit_event'), eventType: z.string(), payload: z.record(z.string(), z.unknown()).optional() }),
]);
export type AutomationAction = z.infer<typeof AutomationAction>;

/** Spec §76 — WHEN / IF / THEN / UNLESS, as plain data. */
export const AutomationRule = z.object({
  when: AutomationTrigger,
  if: z.array(Condition).default([]),
  then: z.array(AutomationAction).min(1),
  unless: z.array(Condition).default([]),
});
export type AutomationRule = z.infer<typeof AutomationRule>;

/** Spec §34 — the tools an agent may be granted. */
export const AGENT_TOOLS = [
  // Studio
  'studio.read_character', 'studio.read_wardrobe', 'studio.read_brand',
  'studio.create_image_job', 'studio.create_video_job', 'studio.create_script',
  'studio.read_inspiration', 'studio.search_assets', 'studio.create_campaign',
  // CRM
  'crm.read_fan', 'crm.search_fans', 'crm.read_conversation', 'crm.create_task',
  'crm.add_tag', 'crm.draft_message', 'crm.send_message', 'crm.update_relationship',
  'crm.create_campaign',
  // Distribution
  'dispatch.create_publication', 'dispatch.adapt_caption', 'dispatch.transcode_media',
  'dispatch.queue_post', 'dispatch.check_status', 'dispatch.retry',
  // System
  'system.read_job', 'system.retry_job', 'system.inspect_health',
  'system.notify_user', 'system.schedule_task', 'system.read_integration_state',
] as const;
export type AgentTool = (typeof AGENT_TOOLS)[number];

/** Tools that spend money, send outward, or publish. Always high risk. */
export const HIGH_RISK_TOOLS = new Set<AgentTool>([
  'crm.send_message',
  'dispatch.create_publication',
  'dispatch.queue_post',
  'studio.create_image_job',
  'studio.create_video_job',
]);

/** Spec §35 */
export const Guardrails = z.object({
  allowedTools: z.array(z.enum(AGENT_TOOLS)).default([]),
  allowedCharacterIds: z.array(z.string()).nullable().default(null),
  allowedChannels: z.array(z.string()).nullable().default(null),
  allowedSegmentIds: z.array(z.string()).nullable().default(null),
  maxActionsPerHour: z.number().int().positive().default(20),
  maxSpendMinor: z.number().int().nonnegative().nullable().default(null),
  maxRetries: z.number().int().nonnegative().default(2),
  approvalPolicy: ApprovalPolicy.default('always_ask'),
  quietHours: z
    .object({ startHour: z.number().int().min(0).max(23), endHour: z.number().int().min(0).max(23), timezone: z.string() })
    .nullable()
    .default(null),
  contentRestrictions: z.array(z.string()).default([]),
  /** Rate cap on outbound messages to any single fan. */
  maxMessagesPerFanPerDay: z.number().int().positive().default(3),
});
export type Guardrails = z.infer<typeof Guardrails>;

export const DEFAULT_GUARDRAILS: Guardrails = Guardrails.parse({});

// ── Evaluation ──────────────────────────────────────────────────────────────

export type Facts = Record<string, unknown>;

/** Read a dotted path out of the fact bag. Missing segments yield undefined. */
export function readPath(facts: Facts, path: string): unknown {
  return path.split('.').reduce<unknown>((acc, key) => {
    if (acc === null || acc === undefined) return undefined;
    if (typeof acc !== 'object') return undefined;
    return (acc as Record<string, unknown>)[key];
  }, facts);
}

export function evaluateCondition(condition: Condition, facts: Facts): boolean {
  const actual = readPath(facts, condition.path);
  const expected = condition.value;

  switch (condition.op) {
    case 'eq': return actual === expected;
    case 'neq': return actual !== expected;
    case 'gt': return num(actual) > num(expected);
    case 'gte': return num(actual) >= num(expected);
    case 'lt': return num(actual) < num(expected);
    case 'lte': return num(actual) <= num(expected);
    case 'contains': return collectionContains(actual, expected);
    case 'not_contains': return !collectionContains(actual, expected);
    case 'in': return Array.isArray(expected) && expected.includes(actual as never);
    case 'not_in': return !(Array.isArray(expected) && expected.includes(actual as never));
    case 'is_null': return actual === null || actual === undefined;
    case 'is_not_null': return actual !== null && actual !== undefined;
    case 'matches': {
      if (typeof actual !== 'string' || typeof expected !== 'string') return false;
      try {
        return new RegExp(expected, 'i').test(actual);
      } catch {
        return false;
      }
    }
    default: return false;
  }
}

function num(v: unknown): number {
  if (typeof v === 'number') return v;
  if (typeof v === 'string') { const n = Number(v); return Number.isNaN(n) ? Number.NEGATIVE_INFINITY : n; }
  if (v instanceof Date) return v.getTime();
  if (typeof v === 'boolean') return v ? 1 : 0;
  return Number.NEGATIVE_INFINITY;
}

function collectionContains(actual: unknown, expected: unknown): boolean {
  if (Array.isArray(actual)) return actual.includes(expected as never);
  if (typeof actual === 'string') return actual.toLowerCase().includes(String(expected).toLowerCase());
  return false;
}

/** A rule fires when every IF holds and no UNLESS holds. */
export function ruleMatches(rule: AutomationRule, facts: Facts): boolean {
  const ifOk = rule.if.every((c) => evaluateCondition(c, facts));
  if (!ifOk) return false;
  return !rule.unless.some((c) => evaluateCondition(c, facts));
}

/** Substitute `{{path}}` placeholders from the fact bag into a template. */
export function renderTemplate(template: string, facts: Facts): string {
  return template.replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_m, path: string) => {
    const v = readPath(facts, path);
    return v === null || v === undefined ? '' : String(v);
  });
}
