import { readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as drizzleMigrate } from 'drizzle-orm/better-sqlite3/migrator';
import { sql } from 'drizzle-orm';
import { openDatabase, type DbHandle } from './client.js';
import { loadConfig } from '../core/config.js';
import { createLogger } from '../core/logger.js';

const here = dirname(fileURLToPath(import.meta.url));
const migrationsFolder = join(here, 'migrations');

/**
 * Applies the generated Drizzle migrations, then the hand-written FTS5 objects.
 * The FTS file is idempotent (`IF NOT EXISTS` throughout) so it is safe to run
 * on every boot, which is what keeps the desktop app self-healing.
 */
export function runMigrations(handle: DbHandle): void {
  drizzleMigrate(handle.db, { migrationsFolder });
  const ftsSql = readFileSync(join(here, 'fts.sql'), 'utf8');
  handle.sqlite.exec(ftsSql);
}

/** Spec §93 — rebuild the search index without touching business data. */
export function rebuildSearchIndex(handle: DbHandle): void {
  const { sqlite } = handle;
  sqlite.exec(`
    DELETE FROM fts_characters; DELETE FROM fts_fans; DELETE FROM fts_messages;
    DELETE FROM fts_assets; DELETE FROM fts_scripts; DELETE FROM fts_brand_deals;
    DELETE FROM fts_campaigns; DELETE FROM fts_tasks;

    INSERT INTO fts_characters(id, workspace_id, name, username, niche, category, backstory, location)
      SELECT id, workspace_id, name, username, niche, category, backstory, location FROM characters;
    INSERT INTO fts_fans(id, workspace_id, name, username, platform, notes)
      SELECT id, workspace_id, name, username, platform, notes FROM fans;
    INSERT INTO fts_messages(id, workspace_id, conversation_id, fan_id, body)
      SELECT id, workspace_id, conversation_id, fan_id, body FROM messages;
    INSERT INTO fts_assets(id, workspace_id, filename, prompt, tags)
      SELECT id, workspace_id, filename, prompt, tags FROM media_assets;
    INSERT INTO fts_scripts(id, workspace_id, title, hook, body, cta, caption, notes)
      SELECT id, workspace_id, title, hook, body, cta, caption, notes FROM scripts;
    INSERT INTO fts_brand_deals(id, workspace_id, brand, category, guidelines, usage_notes)
      SELECT id, workspace_id, brand, category, guidelines, usage_notes FROM brand_deals;
    INSERT INTO fts_campaigns(id, workspace_id, name, objective, message_template)
      SELECT id, workspace_id, name, objective, message_template FROM campaigns;
    INSERT INTO fts_tasks(id, workspace_id, title, body)
      SELECT id, workspace_id, title, body FROM tasks;
  `);
}

export async function integrityCheck(handle: DbHandle): Promise<{ ok: boolean; detail: string }> {
  const rows = handle.sqlite.pragma('integrity_check') as Array<{ integrity_check: string }>;
  const detail = rows.map((r) => r.integrity_check).join('; ');
  return { ok: detail === 'ok', detail };
}

/** `npm run migrate` entrypoint. Compared as paths, not URLs: the data root may
 * contain characters that URL-encoding would render unequal. */
if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  const config = loadConfig();
  const log = createLogger({ service: 'migrate', level: config.logLevel });
  const handle = openDatabase(config);
  try {
    runMigrations(handle);
    const counts = handle.db.get<{ n: number }>(
      sql`SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'`,
    );
    log.info('migrations applied', { path: handle.path, tables: counts?.n });
  } finally {
    handle.close();
  }
}
