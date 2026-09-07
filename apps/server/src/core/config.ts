import { homedir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import type { LogLevel } from './logger.js';

/** Spec §140 — separate database, providers, credentials per mode. */
export const RuntimeMode = z.enum(['dev', 'test', 'staging', 'production', 'sandbox']);
export type RuntimeMode = z.infer<typeof RuntimeMode>;

/**
 * Spec §49 — the desktop data root. Everything the app owns on disk lives
 * under one directory so backup/restore/export can operate on a single tree.
 */
export const DATA_SUBDIRS = [
  'database',
  'assets',
  'cache',
  'exports',
  'imports',
  'logs',
  'jobs',
  'backups',
  'temp',
] as const;

const defaultDataDir = () =>
  process.platform === 'darwin'
    ? join(homedir(), 'Library', 'Application Support', 'Fanfluence')
    : join(homedir(), '.fanfluence');

const ConfigSchema = z.object({
  mode: RuntimeMode.default('dev'),
  host: z.string().default('127.0.0.1'),
  port: z.coerce.number().int().min(0).max(65535).default(4317),
  dataDir: z.string().default(defaultDataDir()),
  databaseUrl: z.string().optional(),
  logLevel: z.enum(['debug', 'info', 'warn', 'error', 'fatal']).default('info'),
  /** Spec §58 — LAN exposure is opt-in only. */
  allowLanBinding: z.coerce.boolean().default(false),
  /** Spec §102 — per-install token for the local bridge. */
  bridgeToken: z.string().optional(),
  /** Spec §124 — global kill switch, readable at boot. */
  automationEnabled: z.coerce.boolean().default(true),
  /** Number of concurrent workers per queue. */
  workerConcurrency: z.coerce.number().int().min(1).max(64).default(4),
  /** Disable the background worker loop (tests drive it manually). */
  runWorkers: z.coerce.boolean().default(true),
  /** Master key for the local secret store. Generated on first boot if absent. */
  secretKey: z.string().optional(),
});

export type Config = z.infer<typeof ConfigSchema> & {
  paths: Record<(typeof DATA_SUBDIRS)[number], string>;
  logLevel: LogLevel;
};

export function loadConfig(env: NodeJS.ProcessEnv = process.env): Config {
  const parsed = ConfigSchema.parse({
    mode: env.FANFLUENCE_MODE,
    host: env.FANFLUENCE_HOST,
    port: env.FANFLUENCE_PORT ?? env.PORT,
    dataDir: env.FANFLUENCE_DATA_DIR,
    databaseUrl: env.FANFLUENCE_DATABASE_URL,
    logLevel: env.FANFLUENCE_LOG_LEVEL,
    allowLanBinding: env.FANFLUENCE_ALLOW_LAN,
    bridgeToken: env.FANFLUENCE_BRIDGE_TOKEN,
    automationEnabled: env.FANFLUENCE_AUTOMATION_ENABLED,
    workerConcurrency: env.FANFLUENCE_WORKER_CONCURRENCY,
    runWorkers: env.FANFLUENCE_RUN_WORKERS,
    secretKey: env.FANFLUENCE_SECRET_KEY,
  });

  if (!parsed.allowLanBinding && parsed.host !== '127.0.0.1' && parsed.host !== 'localhost') {
    throw new Error(
      `Refusing to bind to ${parsed.host}: set FANFLUENCE_ALLOW_LAN=true to expose beyond loopback.`,
    );
  }

  const paths = Object.fromEntries(
    DATA_SUBDIRS.map((d) => [d, join(parsed.dataDir, d)]),
  ) as Config['paths'];

  return { ...parsed, paths };
}
