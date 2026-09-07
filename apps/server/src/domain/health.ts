import { z } from 'zod';

/** Spec §31/§91 — one vocabulary for every integration's connectivity state. */
export const HealthState = z.enum([
  'connected',
  'connecting',
  'degraded',
  'disconnected',
  'needs_attention',
  'auth_expired',
  'auth_error',
  'model_missing',
  'rate_limited',
  'quota_exceeded',
  'unsupported',
  'unavailable',
  'unknown',
]);
export type HealthState = z.infer<typeof HealthState>;

/** States in which the router may still send work to a provider. */
export const USABLE_HEALTH: HealthState[] = ['connected', 'degraded', 'unknown'];

export function isUsable(state: HealthState): boolean {
  return USABLE_HEALTH.includes(state);
}
