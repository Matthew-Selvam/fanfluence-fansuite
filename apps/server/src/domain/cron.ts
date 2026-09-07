/**
 * Spec §77 — a five-field cron evaluator, timezone-aware. Kept in-house because
 * the scheduler only ever needs "when is the next fire time after T", and a
 * dependency-free implementation is easier to reason about across a restart.
 *
 * Format: `minute hour dayOfMonth month dayOfWeek`
 * Supports `*`, `a-b`, `a,b,c`, `*​/n`, and `a-b/n`. Day-of-week is 0–6 (Sun=0).
 */

interface CronFields {
  minute: Set<number>;
  hour: Set<number>;
  dayOfMonth: Set<number>;
  month: Set<number>;
  dayOfWeek: Set<number>;
  /** Cron's historical OR between DOM and DOW when both are restricted. */
  domRestricted: boolean;
  dowRestricted: boolean;
}

const RANGES: Record<keyof Omit<CronFields, 'domRestricted' | 'dowRestricted'>, [number, number]> = {
  minute: [0, 59],
  hour: [0, 23],
  dayOfMonth: [1, 31],
  month: [1, 12],
  dayOfWeek: [0, 6],
};

const ALIASES: Record<string, string> = {
  '@hourly': '0 * * * *',
  '@daily': '0 0 * * *',
  '@midnight': '0 0 * * *',
  '@weekly': '0 0 * * 0',
  '@monthly': '0 0 1 * *',
  '@yearly': '0 0 1 1 *',
  '@annually': '0 0 1 1 *',
};

export function parseCron(expression: string): CronFields {
  const expr = (ALIASES[expression.trim().toLowerCase()] ?? expression).trim();
  const parts = expr.split(/\s+/);
  if (parts.length !== 5) {
    throw new Error(`Invalid cron expression "${expression}": expected 5 fields, got ${parts.length}`);
  }

  const [min, hr, dom, mon, dow] = parts as [string, string, string, string, string];
  return {
    minute: parseField(min, ...RANGES.minute),
    hour: parseField(hr, ...RANGES.hour),
    dayOfMonth: parseField(dom, ...RANGES.dayOfMonth),
    month: parseField(mon, ...RANGES.month),
    dayOfWeek: parseField(dow, ...RANGES.dayOfWeek),
    domRestricted: dom !== '*',
    dowRestricted: dow !== '*',
  };
}

function parseField(field: string, min: number, max: number): Set<number> {
  const out = new Set<number>();
  for (const part of field.split(',')) {
    const [rangePart, stepPart] = part.split('/');
    const step = stepPart ? Number(stepPart) : 1;
    if (!Number.isInteger(step) || step < 1) throw new Error(`Invalid cron step "${part}"`);

    let lo = min;
    let hi = max;
    if (rangePart && rangePart !== '*') {
      const bounds = rangePart.split('-');
      lo = Number(bounds[0]);
      hi = bounds.length > 1 ? Number(bounds[1]) : lo;
      if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
        throw new Error(`Invalid cron range "${part}" for bounds ${min}-${max}`);
      }
    }
    for (let v = lo; v <= hi; v += step) out.add(v);
  }
  return out;
}

/** The wall-clock parts of `date` in `timeZone`. */
function zonedParts(date: Date, timeZone: string) {
  const fmt = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', weekday: 'short',
  });
  const parts = Object.fromEntries(fmt.formatToParts(date).map((p) => [p.type, p.value]));
  const DAYS: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour === '24' ? '0' : parts.hour),
    minute: Number(parts.minute),
    dow: DAYS[parts.weekday ?? 'Sun'] ?? 0,
  };
}

function matches(fields: CronFields, p: ReturnType<typeof zonedParts>): boolean {
  if (!fields.minute.has(p.minute)) return false;
  if (!fields.hour.has(p.hour)) return false;
  if (!fields.month.has(p.month)) return false;

  // Standard cron semantics: when both day fields are restricted, either may match.
  const domOk = fields.dayOfMonth.has(p.day);
  const dowOk = fields.dayOfWeek.has(p.dow);
  if (fields.domRestricted && fields.dowRestricted) return domOk || dowOk;
  if (fields.domRestricted) return domOk;
  if (fields.dowRestricted) return dowOk;
  return true;
}

/**
 * Next fire time strictly after `from`. Scans minute by minute for up to four
 * years, which bounds the search for expressions like `0 0 29 2 *`.
 */
export function nextRunAt(expression: string, from: Date, timeZone = 'UTC'): Date | null {
  const fields = parseCron(expression);
  const start = new Date(Math.floor(from.getTime() / 60_000) * 60_000 + 60_000);
  const limit = 4 * 366 * 24 * 60;

  for (let i = 0; i < limit; i++) {
    const candidate = new Date(start.getTime() + i * 60_000);
    if (matches(fields, zonedParts(candidate, timeZone))) return candidate;
  }
  return null;
}

export function isValidCron(expression: string): boolean {
  try {
    parseCron(expression);
    return true;
  } catch {
    return false;
  }
}

/** Spec §35 — quiet hours, evaluated in the workspace's timezone. */
export function inQuietHours(
  at: Date,
  quiet: { startHour: number; endHour: number; timezone: string },
): boolean {
  const { hour } = zonedParts(at, quiet.timezone);
  if (quiet.startHour === quiet.endHour) return false;
  return quiet.startHour < quiet.endHour
    ? hour >= quiet.startHour && hour < quiet.endHour
    : hour >= quiet.startHour || hour < quiet.endHour; // window crosses midnight
}
