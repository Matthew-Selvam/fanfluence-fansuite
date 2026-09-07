import { mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import Database from 'better-sqlite3';
import { drizzle, type BetterSQLite3Database } from 'drizzle-orm/better-sqlite3';
import * as schema from './schema/index.js';
import type { Config } from '../core/config.js';

export type Db = BetterSQLite3Database<typeof schema> & { $client: Database.Database };

export interface DbHandle {
  db: Db;
  sqlite: Database.Database;
  path: string;
  close(): void;
}

/**
 * Spec §48 — SQLite with WAL. The pragmas below are the ones that matter for a
 * local-first desktop app: WAL for concurrent readers during a write, NORMAL
 * synchronous (safe under WAL, much faster than FULL), foreign keys on, and a
 * busy timeout so a background worker never hard-fails on a momentary lock.
 */
export function openDatabase(config: Pick<Config, 'dataDir' | 'databaseUrl' | 'mode'>): DbHandle {
  const path =
    config.databaseUrl ??
    (config.mode === 'test' ? ':memory:' : join(config.dataDir, 'database', 'fanfluence.db'));

  if (path !== ':memory:') mkdirSync(dirname(path), { recursive: true });

  const sqlite = new Database(path);
  sqlite.pragma('journal_mode = WAL');
  sqlite.pragma('synchronous = NORMAL');
  sqlite.pragma('foreign_keys = ON');
  sqlite.pragma('busy_timeout = 5000');
  sqlite.pragma('temp_store = MEMORY');
  // 64 MiB page cache; negative values are KiB in SQLite's pragma.
  sqlite.pragma('cache_size = -65536');

  const db = drizzle(sqlite, { schema, casing: 'snake_case' }) as Db;
  return {
    db,
    sqlite,
    path,
    close: () => sqlite.close(),
  };
}

export { schema };
