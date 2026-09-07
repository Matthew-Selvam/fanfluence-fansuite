import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { inspirationAssets, inspirationBoards } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { InspirationService } from '../services/studio.js';
import { requirePermission, workspaceOf } from '../services/context.js';

export function registerInspirationRoutes(app: FastifyInstance, inspirations: InspirationService) {
  app.get('/api/inspiration/boards', async (req, reply) => {
    return inspirations.listBoards(req.actor!);
  });

  app.post('/api/inspiration/boards', async (req, reply) => {
    return reply.status(201).send(inspirations.createBoard(req.actor!, req.body as any));
  });

  app.patch('/api/inspiration/boards/:id', async (req, reply) => {
    return inspirations.updateBoard(req.actor!, (req.params as { id: string }).id, req.body as any);
  });

  app.delete('/api/inspiration/boards/:id', async (req, reply) => {
    return inspirations.deleteBoard(req.actor!, (req.params as { id: string }).id);
  });

  app.get('/api/inspiration/boards/:id/items', async (req, reply) => {
    return inspirations.items(req.actor!, (req.params as { id: string }).id);
  });

  app.post('/api/inspiration/boards/:id/items', async (req, reply) => {
    return reply.status(201).send(inspirations.addItem(req.actor!, (req.params as { id: string }).id, req.body as any));
  });

  app.delete('/api/inspiration/boards/:id/items/:itemId', async (req, reply) => {
    return inspirations.removeItem(req.actor!, (req.params as { itemId: string }).itemId);
  });
}