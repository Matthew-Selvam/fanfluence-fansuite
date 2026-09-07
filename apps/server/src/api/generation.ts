import { FastifyInstance } from 'fastify';
import { GenerationService } from '../services/generation.js';

export function registerGenerationRoutes(app: FastifyInstance, generation: GenerationService) {
  app.get('/api/studio/briefs', async (req, reply) => {
    return generation.listBriefs(req.actor!, req.query as any);
  });

  app.get('/api/studio/briefs/:id', async (req, reply) => {
    return generation.getBrief(req.actor!, (req.params as { id: string }).id);
  });

  app.post('/api/studio/briefs', async (req, reply) => {
    return reply.status(201).send(generation.createBrief(req.actor!, req.body as any));
  });

  app.patch('/api/studio/briefs/:id', async (req, reply) => {
    return generation.updateBrief(req.actor!, (req.params as { id: string }).id, req.body as any);
  });

  app.delete('/api/studio/briefs/:id', async (req, reply) => {
    return generation.deleteBrief(req.actor!, (req.params as { id: string }).id);
  });

  app.get('/api/studio/briefs/:id/compile', async (req, reply) => {
    return generation.compile(req.actor!, (req.params as { id: string }).id);
  });

  app.post('/api/studio/briefs/:id/submit', async (req, reply) => {
    return generation.submit(req.actor!, (req.params as { id: string }).id, req.body as any);
  });
}