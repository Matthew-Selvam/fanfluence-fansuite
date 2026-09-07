import { z } from 'zod';

/**
 * Spec §32 — the system never assumes a provider can do everything. A capability
 * is only usable once an adapter has actually advertised it.
 */
export const Capability = z.enum([
  // LLM
  'chat',
  'streaming',
  'tool_calling',
  'structured_output',
  'vision',
  'embeddings',
  // Media
  'image_generation',
  'image_edit',
  'video_generation',
  'audio_generation',
  'speech_to_text',
  'character_reference',
  'upload',
  'webhooks',
  'job_polling',
  'cancel',
  // Publishing
  'publish',
  'caption_adapt',
  'transcode',
  'queue_inspect',
  'retry',
]);
export type Capability = z.infer<typeof Capability>;

export const LLM_CAPABILITIES: Capability[] = [
  'chat', 'streaming', 'tool_calling', 'structured_output', 'vision', 'embeddings',
];

export const MEDIA_CAPABILITIES: Capability[] = [
  'image_generation', 'image_edit', 'video_generation', 'audio_generation',
  'character_reference', 'upload', 'webhooks', 'job_polling', 'cancel',
];

export const PUBLISHING_CAPABILITIES: Capability[] = [
  'publish', 'caption_adapt', 'transcode', 'queue_inspect', 'retry',
];

export function supports(advertised: Capability[] | null | undefined, needed: Capability): boolean {
  return Array.isArray(advertised) && advertised.includes(needed);
}
