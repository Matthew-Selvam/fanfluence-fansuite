import { ulid } from 'ulid';

/**
 * Prefixed ULIDs. Sortable by creation time, greppable in logs, and safe to
 * expose in URLs. The prefix is part of the id so a bare id always says what
 * kind of thing it points at.
 */
export const ID_PREFIXES = {
  workspace: 'ws',
  user: 'usr',
  character: 'chr',
  characterVersion: 'cvr',
  characterAsset: 'cas',
  characterReference: 'cref',
  wardrobe: 'wdr',
  wardrobeItem: 'wit',
  home: 'hom',
  brandDeal: 'dea',
  brandAsset: 'bas',
  inspirationBoard: 'inb',
  inspirationAsset: 'ina',
  script: 'scr',
  mediaAsset: 'ast',
  creativeBrief: 'brf',
  generationJob: 'gjb',
  generationOutput: 'gou',
  fan: 'fan',
  fanTag: 'ftg',
  fanNote: 'fnt',
  conversation: 'cnv',
  message: 'msg',
  memory: 'mem',
  relationship: 'rel',
  relationshipEvent: 'rev',
  purchase: 'pur',
  subscription: 'sub',
  segment: 'seg',
  campaign: 'cmp',
  campaignMessage: 'cms',
  task: 'tsk',
  automation: 'aut',
  automationRun: 'arn',
  provider: 'prv',
  providerModel: 'pmd',
  integration: 'int',
  publishingAccount: 'pac',
  publishingJob: 'pjb',
  job: 'job',
  event: 'evt',
  auditLog: 'aud',
  approval: 'apr',
  notification: 'ntf',
  setting: 'set',
  syncRecord: 'syn',
  goal: 'gol',
  goalStep: 'gst',
} as const;

export type IdKind = keyof typeof ID_PREFIXES;
export type Id<K extends IdKind = IdKind> = string & { readonly __kind?: K };

export function newId<K extends IdKind>(kind: K): Id<K> {
  return `${ID_PREFIXES[kind]}_${ulid()}` as Id<K>;
}

export function isId<K extends IdKind>(kind: K, value: unknown): value is Id<K> {
  return typeof value === 'string' && value.startsWith(`${ID_PREFIXES[kind]}_`);
}

/** Deterministic idempotency key for a remote action (spec §73). */
export function idempotencyKey(scope: string): string {
  return `fanfluence-${scope}-${ulid()}`;
}
