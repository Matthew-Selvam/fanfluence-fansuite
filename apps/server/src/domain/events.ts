import { z } from 'zod';

/** Spec §25 — the central event vocabulary. Adding a type here is deliberate. */
export const EVENT_TYPES = [
  'workspace.created',
  'character.created', 'character.updated', 'character.archived', 'character.locked',
  'fan.created', 'fan.updated', 'fan.tagged', 'fan.untagged', 'fan.merged',
  'message.received', 'message.drafted', 'message.sent', 'message.failed',
  'conversation.created', 'conversation.assigned', 'conversation.closed', 'conversation.reopened',
  'purchase.created', 'purchase.completed', 'purchase.refunded',
  'subscription.changed',
  'memory.created', 'memory.updated', 'memory.suppressed',
  'relationship.changed',
  'task.created', 'task.completed',
  'segment.created', 'segment.updated',
  'campaign.created', 'campaign.started', 'campaign.completed', 'campaign.failed',
  'asset.created', 'asset.approved', 'asset.rejected', 'asset.published', 'asset.deleted',
  'brief.created', 'brief.ready',
  'script.created', 'script.status_changed',
  'brand_deal.created', 'brand_deal.stage_changed',
  'generation.started', 'generation.completed', 'generation.failed', 'generation.cancelled',
  'publication.created', 'publication.queued', 'publication.completed', 'publication.failed',
  'integration.connected', 'integration.disconnected', 'integration.health_changed',
  'provider.health_changed',
  'automation.started', 'automation.completed', 'automation.failed', 'automation.skipped',
  'approval.requested', 'approval.decided',
  'goal.created', 'goal.planned', 'goal.started', 'goal.completed', 'goal.failed',
  'job.created', 'job.completed', 'job.failed', 'job.dead_lettered',
  'notification.created',
  'sync.conflict',
  'health.character_updated',
] as const;

export type EventType = (typeof EVENT_TYPES)[number];

export const DomainEvent = z.object({
  id: z.string(),
  type: z.string(),
  timestamp: z.string(),
  workspaceId: z.string(),
  characterId: z.string().nullable().optional(),
  fanId: z.string().nullable().optional(),
  entityType: z.string().nullable().optional(),
  entityId: z.string().nullable().optional(),
  source: z.string().default('system'),
  actor: z.enum(['system', 'user', 'automation', 'ai', 'provider', 'webhook']).default('system'),
  actorId: z.string().nullable().optional(),
  payload: z.record(z.string(), z.unknown()).default({}),
});
export type DomainEvent = z.infer<typeof DomainEvent>;

/**
 * Input shape for emitting. `id`, `timestamp`, `source` and `actor` are filled
 * in by the bus when omitted, so a caller only states what it actually knows.
 */
export type EmitEvent = Omit<DomainEvent, 'id' | 'timestamp' | 'source' | 'actor'> & {
  id?: string;
  timestamp?: string;
  source?: string;
  actor?: DomainEvent['actor'];
};
