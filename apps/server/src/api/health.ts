import { FastifyInstance } from 'fastify';
import type { EventBus } from '../events/bus.js';
import type { Db } from '../db/client.js';
import type { Logger } from '../core/logger.js';
import { requirePermission, workspaceOf } from '../services/context.js';
export function registerHealthRoutes(app: FastifyInstance, deps: {
  db: Db;
  events: EventBus;
  log: Logger;
  clock: () => Date;
}) {
  app.get('/api/health', async (req, reply) => {
    const start = process.hrtime.bigint();
    let dbOk = false;
    try {
      deps.db.get<{ n: number }>('SELECT 1 AS n');
      dbOk = true;
    } catch { /* */ }
    const elapsed = Number(process.hrtime.bigint() - start) / 1e6;
    return {
      ok: dbOk,
      version: '0.1.0',
      uptime: process.uptime(),
      db: dbOk ? 'connected' : 'error',
      responseMs: Math.round(elapsed),
      timestamp: deps.clock().toISOString(),
    };
  });

  app.get('/api/health/events', async (req, reply) => {
    requirePermission(req.actor!, 'studio:read');
    const q = req.query as { limit?: string };
    return deps.events.timeline({
      workspaceId: workspaceOf(req.actor!),
      limit: Math.min(100, Math.max(1, Number.parseInt(q.limit ?? '50', 10) || 50)),
    });
  });
}