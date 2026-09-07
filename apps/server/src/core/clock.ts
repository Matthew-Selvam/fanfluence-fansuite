/** Injectable clock so time-dependent domain rules stay testable. */
export interface Clock {
  now(): Date;
  nowMs(): number;
  nowIso(): string;
}

export const systemClock: Clock = {
  now: () => new Date(),
  nowMs: () => Date.now(),
  nowIso: () => new Date().toISOString(),
};

export function fixedClock(at: Date | string): Clock {
  const d = typeof at === 'string' ? new Date(at) : at;
  return { now: () => new Date(d), nowMs: () => d.getTime(), nowIso: () => d.toISOString() };
}
