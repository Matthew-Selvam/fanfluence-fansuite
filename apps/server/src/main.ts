import Fastify from 'fastify';
import cors from '@fastify/cors';
import fastifyStatic from '@fastify/static';
import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadConfig } from './core/config.js';
import { createLogger, memorySink } from './core/logger.js';
import { systemClock } from './core/clock.js';
import { openDatabase, runMigrations } from './db/index.js';
import { EventBus } from './events/bus.js';
import { AuditLog } from './services/audit.js';
import { CharacterService } from './services/characters.js';
import { FanService } from './services/fans.js';
import { WardrobeService, HomeService, BrandDealService, ScriptService, ContentProjectService } from './services/studio.js';
import { SecretStore, generateMasterKey, deriveKey } from './services/secrets.js';
import { AssetStorage } from './services/storage.js';
import { RateLimiter } from './services/rateLimit.js';

import { createDefaultRegistry } from './providers/registry.js';
import { ProviderRouter } from './providers/router.js';

import multipart from '@fastify/multipart';
import { createAuthHook, errorHandler } from './api/middleware.js';
import { registerCharacterRoutes } from './api/characters.js';
import { registerFanRoutes } from './api/fans.js';
import { registerWardrobeRoutes, registerScriptRoutes, registerBrandDealRoutes, registerContentProjectRoutes } from './api/studio.js';
import { registerHealthRoutes } from './api/health.js';
import { registerMediaRoutes } from './api/media.js';

const __dirname = dirname(fileURLToPath(import.meta.url));

async function main() {
  const config = loadConfig();
  const log = createLogger({ service: 'fanfluence', level: config.logLevel });

  log.info('booting', { mode: config.mode, dataDir: config.dataDir });

  // ── Database ──────────────────────────────────────────────────────────────
  const handle = openDatabase(config);
  const { db, sqlite } = handle;

  if (config.mode !== 'test') {
    runMigrations(handle);
    log.info('migrations applied');
  }

  // ── Event bus ─────────────────────────────────────────────────────────────
  const clock = systemClock;
  const events = new EventBus(db, clock, log.child({ service: 'events' }));

  // ── Services ──────────────────────────────────────────────────────────────
  const audit = new AuditLog(db, clock);
  const characters = new CharacterService(db, events, audit, clock);
  const fans = new FanService(db, events, audit, clock);
  const wardrobe = new WardrobeService(db, clock);
  const homes = new HomeService(db, clock);
  const brandDeals = new BrandDealService(db, events, audit, clock);
  const scripts = new ScriptService(db, events, clock);
  const studio = new ContentProjectService(db, clock);

  const secretKey = loadPersistentSecretKey(config);
  const key = deriveKey(secretKey);
  const secrets = new SecretStore(db, { keyId: 'master-v1', key });
  const storage = new AssetStorage(config.paths.assets);
  await storage.init();
  const rateLimiter = new RateLimiter(db, clock);

  // ── Providers ─────────────────────────────────────────────────────────────
  const registry = createDefaultRegistry();
  const router = new ProviderRouter(db, registry, secrets, log.child({ service: 'router' }));

  // ── Fastify ───────────────────────────────────────────────────────────────
  const app = Fastify({
    logger: false,
    bodyLimit: 50 * 1024 * 1024, // 50 MB for media uploads
  });

  await app.register(cors, {
    // Reflecting arbitrary origins while allowing credentials is unsafe. Keep
    // the permissive behavior only for the local development UI.
    origin: config.mode === 'dev' ? true : false,
    credentials: config.mode === 'dev',
  });
  await app.register(multipart, { limits: { fileSize: 50 * 1024 * 1024 } });

  if (config.mode === 'dev') {
    const devDir = join(__dirname, '..', '..', '..');
    if (false) {
      app.register(fastifyStatic, {
        root: devDir,
        prefix: '/',
        decorateReply: false,
      });
    }
  }

  // Hooks
  app.addHook('onRequest', createAuthHook(config));
  app.setErrorHandler(errorHandler);

  // ── API Routes ────────────────────────────────────────────────────────────
  registerHealthRoutes(app, { db, events, log, clock: () => clock.now() });
  registerCharacterRoutes(app, characters);
  registerFanRoutes(app, fans);
  registerWardrobeRoutes(app, wardrobe);
  registerScriptRoutes(app, scripts);
  registerBrandDealRoutes(app, brandDeals);
  registerContentProjectRoutes(app, studio, db);
  registerMediaRoutes(app, { db, storage, events, audit, clock });

  // SSE event stream
  app.get('/api/events/stream', async (req, reply) => {
    reply.raw.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    });

    const workspaceId = req.actor!.principal.workspaceId;
    const unlisten = events.listen((event) => {
      if (event.workspaceId === workspaceId) {
        reply.raw.write(`data: ${JSON.stringify(event)}\n\n`);
      }
    });

    const interval = setInterval(() => {
      reply.raw.write(':ping\n\n');
    }, 15000);

    req.raw.on('close', () => {
      unlisten();
      clearInterval(interval);
    });
  });

  // Post-boot event drain
  if (config.runWorkers) {
    setImmediate(() => {
      void events.drain(500).then((n) => {
        if (n > 0) log.info('boot drain', { eventsDispatched: n });
      });
    });
  }

  // ── Start ─────────────────────────────────────────────────────────────────
  const host = config.allowLanBinding ? '0.0.0.0' : '127.0.0.1';
  await app.listen({ port: config.port, host });
  log.info('listening', { host, port: config.port, mode: config.mode });
}

function loadPersistentSecretKey(config: ReturnType<typeof loadConfig>): string {
  if (config.secretKey) return config.secretKey;
  if (config.mode === 'test') return generateMasterKey();

  const keyPath = join(config.dataDir, '.master-key');
  mkdirSync(config.dataDir, { recursive: true });
  if (existsSync(keyPath)) {
    const key = readFileSync(keyPath, 'utf8').trim();
    if (key) return key;
    throw new Error(`Persistent secret key at ${keyPath} is empty.`);
  }

  const key = generateMasterKey();
  writeFileSync(keyPath, `${key}\n`, { mode: 0o600, flag: 'wx' });
  chmodSync(keyPath, 0o600);
  return key;
}

main().catch((err) => {
  console.error('fatal boot error:', err);
  process.exit(1);
});