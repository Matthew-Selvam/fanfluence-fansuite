import { z } from 'zod';
import { FastifyInstance } from 'fastify';
import { FanService } from '../services/fans.js';
import { PageQuery } from '../core/paging.js';

const FanListQuery = PageQuery.extend({
  platform: z.string().optional(),
});

export function registerFanRoutes(app: FastifyInstance, fans: FanService) {
  app.get('/api/fans', async (req, reply) => {
    const q = FanListQuery.parse(req.query);
    return fans.list(req.actor!, { limit: q.limit, cursor: q.cursor, platform: q.platform });
  });

  app.get('/api/fans/:id', async (req, reply) => {
    return fans.get(req.actor!, (req.params as { id: string }).id);
  });

  app.post('/api/fans', async (req, reply) => {
    return reply.status(201).send(fans.create(req.actor!, req.body as any));
  });

  app.patch('/api/fans/:id', async (req, reply) => {
    return fans.update(req.actor!, (req.params as { id: string }).id, req.body as any);
  });

  app.delete('/api/fans/:id', async (req, reply) => {
    return fans.delete(req.actor!, (req.params as { id: string }).id);
  });

  app.post('/api/fans/:id/tags', async (req, reply) => {
    return fans.addTag(req.actor!, (req.params as { id: string }).id, req.body as any);
  });

  app.delete('/api/fans/:id/tags/:tag', async (req, reply) => {
    const { id, tag } = req.params as { id: string; tag: string };
    return fans.removeTag(req.actor!, id, tag);
  });

  app.post('/api/fans/:id/notes', async (req, reply) => {
    return fans.addNote(req.actor!, (req.params as { id: string }).id, req.body as any);
  });
}