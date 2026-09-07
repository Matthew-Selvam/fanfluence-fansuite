import { FastifyInstance } from 'fastify';
import { HomeService } from '../services/studio.js';
import { requirePermission, workspaceOf } from '../services/context.js';

export function registerHomeRoutes(app: FastifyInstance, homes: HomeService) {
  app.get('/api/homes', async (req, reply) => {
    return homes.list(req.actor!, (req.query as { characterId?: string }).characterId);
  });

  app.post('/api/homes', async (req, reply) => {
    return reply.status(201).send(homes.create(req.actor!, req.body as any));
  });

  app.patch('/api/homes/:id', async (req, reply) => {
    return homes.update(req.actor!, (req.params as { id: string }).id, req.body as any);
  });

  app.delete('/api/homes/:id', async (req, reply) => {
    return homes.delete(req.actor!, (req.params as { id: string }).id);
  });
}