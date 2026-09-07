import type { SegmentCondition } from './crm.js';

/**
 * Spec §55 — the deterministic query parser. It handles the documented example
 * queries with no AI at all; semantic search is layered on top later and never
 * replaces this.
 */
export const SEARCHABLE_ENTITIES = [
  'characters', 'fans', 'messages', 'assets', 'scripts',
  'brand_deals', 'campaigns', 'tasks', 'events',
] as const;
export type SearchEntity = (typeof SEARCHABLE_ENTITIES)[number];

export interface ParsedQuery {
  /** Free text, after filter tokens are removed. */
  text: string;
  entities: SearchEntity[];
  filters: SegmentCondition[];
  /** Filter tokens the parser recognised, for showing the user what it did. */
  recognised: string[];
}

const ENTITY_WORDS: Array<[RegExp, SearchEntity]> = [
  [/\b(characters?|influencers?)\b/i, 'characters'],
  [/\b(fans?|subscribers?|customers?)\b/i, 'fans'],
  [/\b(messages?|conversations?|chats?|dms?)\b/i, 'messages'],
  [/\b(assets?|images?|photos?|videos?|media)\b/i, 'assets'],
  [/\b(scripts?)\b/i, 'scripts'],
  [/\b(brand\s+deals?|deals?|sponsorships?)\b/i, 'brand_deals'],
  [/\b(campaigns?)\b/i, 'campaigns'],
  [/\b(tasks?|todos?|follow[-\s]?ups?)\b/i, 'tasks'],
  [/\b(events?|activity|timeline)\b/i, 'events'],
];

const RELATIVE_DAYS: Array<[RegExp, number]> = [
  [/\b(today)\b/i, 1],
  [/\b(yesterday)\b/i, 2],
  [/\b(this\s+week|last\s+week|past\s+week)\b/i, 7],
  [/\b(this\s+month|last\s+month|past\s+month)\b/i, 30],
  [/\b(last|past)\s+(\d+)\s+days?\b/i, -1], // captured numerically below
];

export function parseQuery(raw: string): ParsedQuery {
  let text = raw.trim();
  const filters: SegmentCondition[] = [];
  const entities = new Set<SearchEntity>();
  const recognised: string[] = [];

  const consume = (re: RegExp, label: string) => {
    const m = text.match(re);
    if (!m) return null;
    recognised.push(label);
    text = text.replace(re, ' ').replace(/\s{2,}/g, ' ').trim();
    return m;
  };

  // `field:value` pairs are honoured verbatim and consumed first.
  const explicit = /(\w+):("[^"]+"|\S+)/g;
  for (const m of Array.from(raw.matchAll(explicit))) {
    const field = m[1]!;
    const value = m[2]!.replace(/^"|"$/g, '');
    filters.push({ field: field as SegmentCondition['field'], op: 'eq', value });
    recognised.push(`${field}=${value}`);
    text = text.replace(m[0], ' ').trim();
  }

  for (const [re, entity] of ENTITY_WORDS) {
    if (re.test(text)) entities.add(entity);
  }

  if (consume(/\bvip\b/i, 'vip')) {
    filters.push({ field: 'vip', op: 'eq', value: true });
    entities.add('fans');
  }
  if (consume(/\b(who\s+)?purchased|buyers?|purchasers?\b/i, 'purchased')) {
    filters.push({ field: 'purchaseCount', op: 'gt', value: 0 });
    entities.add('fans');
  }
  if (consume(/\bdormant|inactive\b/i, 'dormant')) {
    filters.push({ field: 'lastInteractionAt', op: 'before_days', value: 60 });
    entities.add('fans');
  }
  if (consume(/\bnew\b/i, 'new')) {
    filters.push({ field: 'createdAt', op: 'within_days', value: 7 });
  }
  if (consume(/\bunfinished|incomplete\b/i, 'incomplete')) {
    entities.add('characters');
    recognised.push('incomplete-profiles');
  }
  if (consume(/\bunread\b/i, 'unread')) {
    entities.add('messages');
  }

  const spend = text.match(/\b(?:over|above|more\s+than)\s+\$?(\d+(?:\.\d+)?)\b/i);
  if (spend) {
    filters.push({ field: 'totalSpendMinor', op: 'gt', value: Math.round(Number(spend[1]) * 100) });
    recognised.push(`spend>${spend[1]}`);
    text = text.replace(spend[0], ' ').trim();
  }

  for (const [re, days] of RELATIVE_DAYS) {
    const m = text.match(re);
    if (!m) continue;
    const n = days === -1 ? Number(m[2]) : days;
    if (!Number.isFinite(n)) continue;
    filters.push({ field: 'lastInteractionAt', op: 'within_days', value: n });
    recognised.push(`within ${n}d`);
    text = text.replace(m[0], ' ').trim();
    break;
  }

  text = text.replace(/\b(who|that|with|from|show|find|search|me|all|the|of|in|and)\b/gi, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();

  return {
    text,
    entities: entities.size > 0 ? [...entities] : [...SEARCHABLE_ENTITIES],
    filters,
    recognised,
  };
}

/** Escape a user string for use inside an SQLite FTS5 MATCH expression. */
export function toFtsQuery(text: string): string | null {
  const terms = text
    .split(/\s+/)
    .map((t) => t.replace(/["*()]/g, '').trim())
    .filter((t) => t.length > 1);
  if (terms.length === 0) return null;
  return terms.map((t) => `"${t}"*`).join(' AND ');
}
