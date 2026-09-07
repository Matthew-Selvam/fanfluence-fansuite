import { z } from 'zod';

/** Spec §100 */
export const QueueName = z.enum([
  'generation', 'publishing', 'automation', 'sync',
  'notifications', 'imports', 'exports', 'maintenance', 'ai',
]);
export type QueueName = z.infer<typeof QueueName>;

/** Spec §43 */
export const JobStatus = z.enum([
  'draft', 'queued', 'submitted', 'running', 'completed',
  'failed', 'cancelled', 'expired', 'unknown',
]);
export type JobStatus = z.infer<typeof JobStatus>;

export const TERMINAL_JOB_STATUSES: JobStatus[] = ['completed', 'failed', 'cancelled', 'expired'];

/**
 * Legal job transitions. `unknown` exists for the case the spec calls out in
 * §41: a submission whose response was lost, which must be reconciled by
 * polling rather than resubmitted.
 */
const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  draft: ['queued', 'cancelled'],
  queued: ['running', 'cancelled', 'expired'],
  submitted: ['running', 'completed', 'failed', 'cancelled', 'expired', 'unknown'],
  running: ['submitted', 'completed', 'failed', 'cancelled', 'expired', 'unknown'],
  completed: [],
  failed: ['queued'],
  cancelled: [],
  expired: ['queued'],
  unknown: ['running', 'submitted', 'completed', 'failed', 'cancelled', 'expired'],
};

export function canTransitionJob(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from]?.includes(to) ?? false;
}

export function isTerminal(status: JobStatus): boolean {
  return TERMINAL_JOB_STATUSES.includes(status);
}

export const JobType = z.enum([
  'generation.image',
  'generation.video',
  'generation.audio',
  'generation.poll',
  'generation.download',
  'ai.chat',
  'ai.draft_reply',
  'ai.embed',
  'ai.summarize_conversation',
  'publishing.dispatch',
  'publishing.poll',
  'automation.evaluate',
  'automation.run',
  'automation.schedule_tick',
  'campaign.send',
  'campaign.materialize',
  'notification.deliver',
  'sync.push',
  'sync.pull',
  'import.run',
  'export.run',
  'maintenance.health_check',
  'maintenance.reindex',
  'maintenance.retention',
  'maintenance.backup',
  'maintenance.character_health',
]);
export type JobType = z.infer<typeof JobType>;

/** Which queue a job type belongs on. */
export const QUEUE_FOR_TYPE: Record<JobType, QueueName> = {
  'generation.image': 'generation',
  'generation.video': 'generation',
  'generation.audio': 'generation',
  'generation.poll': 'generation',
  'generation.download': 'generation',
  'ai.chat': 'ai',
  'ai.draft_reply': 'ai',
  'ai.embed': 'ai',
  'ai.summarize_conversation': 'ai',
  'publishing.dispatch': 'publishing',
  'publishing.poll': 'publishing',
  'automation.evaluate': 'automation',
  'automation.run': 'automation',
  'automation.schedule_tick': 'automation',
  'campaign.send': 'automation',
  'campaign.materialize': 'automation',
  'notification.deliver': 'notifications',
  'sync.push': 'sync',
  'sync.pull': 'sync',
  'import.run': 'imports',
  'export.run': 'exports',
  'maintenance.health_check': 'maintenance',
  'maintenance.reindex': 'maintenance',
  'maintenance.retention': 'maintenance',
  'maintenance.backup': 'maintenance',
  'maintenance.character_health': 'maintenance',
};

/** Exponential backoff with full jitter, capped at 15 minutes. */
export function backoffMs(attempt: number, baseMs = 2_000, capMs = 900_000): number {
  const exp = Math.min(capMs, baseMs * 2 ** Math.max(0, attempt - 1));
  return Math.floor(Math.random() * exp);
}
