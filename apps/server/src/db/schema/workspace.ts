import { index, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { baseColumns, bool, globalColumns, json, ts } from './_common.js';
import type { Role } from '../../domain/permissions.js';

export const workspaces = sqliteTable(
  'workspaces',
  {
    ...globalColumns('workspace'),
    organizationId: text('organization_id'),
    name: text('name').notNull(),
    slug: text('slug').notNull(),
    /** Spec §140 — a workspace is pinned to one runtime mode. */
    mode: text('mode').notNull().default('production'),
    timezone: text('timezone').notNull().default('UTC'),
    locale: text('locale').notNull().default('en'),
    settings: json<Record<string, unknown>>('settings'),
  },
  (t) => [uniqueIndex('workspaces_slug_uq').on(t.slug)],
);

export const users = sqliteTable(
  'users',
  {
    ...globalColumns('user'),
    email: text('email').notNull(),
    name: text('name').notNull(),
    /** Argon2id/scrypt hash. Never a plaintext or reversible value. */
    passwordHash: text('password_hash'),
    avatarUrl: text('avatar_url'),
    lastSeenAt: ts('last_seen_at'),
    disabled: bool('disabled').notNull().default(false),
  },
  (t) => [uniqueIndex('users_email_uq').on(t.email)],
);

/** Spec §103 — a user's role is per workspace, not global. */
export const workspaceMembers = sqliteTable(
  'workspace_members',
  {
    ...baseColumns('user'),
    userId: text('user_id').notNull(),
    role: text('role').$type<Role>().notNull(),
    /** Optional per-member overrides on top of the role's default grants. */
    permissionOverrides: json<string[]>('permission_overrides'),
  },
  (t) => [
    uniqueIndex('workspace_members_uq').on(t.workspaceId, t.userId),
    index('workspace_members_user_ix').on(t.userId),
  ],
);

export const sessions = sqliteTable(
  'sessions',
  {
    ...globalColumns('user'),
    userId: text('user_id').notNull(),
    workspaceId: text('workspace_id'),
    /** SHA-256 of the bearer token. The raw token is returned once and never stored. */
    tokenHash: text('token_hash').notNull(),
    /** Spec §102 — desktop sessions are bound to a device identity. */
    deviceId: text('device_id'),
    deviceName: text('device_name'),
    kind: text('kind').$type<'web' | 'desktop' | 'bridge' | 'api'>().notNull().default('web'),
    expiresAt: ts('expires_at').notNull(),
    revokedAt: ts('revoked_at'),
  },
  (t) => [
    uniqueIndex('sessions_token_uq').on(t.tokenHash),
    index('sessions_user_ix').on(t.userId),
  ],
);

/** Spec §92 — workspace settings as addressable key/value, so the UI can be data-driven. */
export const settings = sqliteTable(
  'settings',
  {
    ...baseColumns('setting'),
    scope: text('scope').$type<'workspace' | 'user' | 'device'>().notNull().default('workspace'),
    scopeId: text('scope_id'),
    key: text('key').notNull(),
    value: json<unknown>('value'),
  },
  (t) => [uniqueIndex('settings_uq').on(t.workspaceId, t.scope, t.scopeId, t.key)],
);

/**
 * Spec §58 — credentials never live in a plain column. This holds an
 * AES-256-GCM envelope; on desktop the key comes from the Keychain.
 */
export const secrets = sqliteTable(
  'secrets',
  {
    ...baseColumns('setting'),
    /** e.g. `provider:prv_01H...:api_key` */
    ref: text('ref').notNull(),
    ciphertext: text('ciphertext').notNull(),
    iv: text('iv').notNull(),
    authTag: text('auth_tag').notNull(),
    keyId: text('key_id').notNull(),
    /** Safe-to-display fingerprint, e.g. `sk-…4f2a`. */
    hint: text('hint'),
  },
  (t) => [uniqueIndex('secrets_ref_uq').on(t.workspaceId, t.ref)],
);
