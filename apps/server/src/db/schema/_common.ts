import { integer, text } from 'drizzle-orm/sqlite-core';
import { newId, type IdKind } from '../../core/ids.js';

/**
 * Spec §47 — every important business entity carries the same base columns.
 * `version` is bumped on every write and is what the sync engine (§50) and the
 * optimistic-concurrency checks in the repositories compare against.
 */
export const baseColumns = <K extends IdKind>(kind: K) => ({
  id: text('id')
    .primaryKey()
    .$defaultFn(() => newId(kind)),
  workspaceId: text('workspace_id').notNull(),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  /** Soft delete (§47). Hard deletion is a separate, deliberate action. */
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  version: integer('version').notNull().default(1),
});

/** Entities that exist above the workspace (workspaces, users, sync bookkeeping). */
export const globalColumns = <K extends IdKind>(kind: K) => ({
  id: text('id')
    .primaryKey()
    .$defaultFn(() => newId(kind)),
  createdAt: integer('created_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  updatedAt: integer('updated_at', { mode: 'timestamp_ms' })
    .notNull()
    .$defaultFn(() => new Date()),
  deletedAt: integer('deleted_at', { mode: 'timestamp_ms' }),
  version: integer('version').notNull().default(1),
});

/** A JSON column with a compile-time shape. Stored as TEXT in SQLite. */
export const json = <T>(name: string) => text(name, { mode: 'json' }).$type<T>();

/** Boolean stored as 0/1. */
export const bool = (name: string) => integer(name, { mode: 'boolean' });

export const ts = (name: string) => integer(name, { mode: 'timestamp_ms' });

/** Money is stored in minor units (cents) as an integer — never a float. */
export const minorUnits = (name: string) => integer(name);
