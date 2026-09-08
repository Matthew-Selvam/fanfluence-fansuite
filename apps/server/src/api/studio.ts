import { FastifyInstance } from 'fastify';
import { eq } from 'drizzle-orm';
import { contentProjects, fans } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';

import { WardrobeService, ScriptService, BrandDealService, ContentProjectService } from '../services/studio.js';

export function registerWardrobeRoutes(app: FastifyInstance, wardrobe: WardrobeService) {
  app.get('/api/wardrobes', async (req, reply) => {
    const q = req.query as { characterId?: string };
    return wardrobe.listWardrobes(req.actor!, q.characterId);
  });

  app.post('/api/wardrobes', async (req, reply) => {
    return reply.status(201).send(wardrobe.createWardrobe(req.actor!, req.body as any));
  });

  app.get('/api/wardrobes/:id/items', async (req, reply) => {
    const { id } = req.params as { id: string };
    const q = req.query as { category?: string };
    return wardrobe.listItems(req.actor!, id, q.category as any);
  });

  app.post('/api/wardrobes/:id/items', async (req, reply) => {
    return reply.status(201).send(wardrobe.createItem(req.actor!, req.body as any));
  });
}

export function registerScriptRoutes(app: FastifyInstance, scripts: ScriptService) {
  app.get('/api/scripts', async (req, reply) => {
    return scripts.list(req.actor!, req.query as any);
  });

  app.get('/api/scripts/:id', async (req, reply) => {
    return scripts.get(req.actor!, (req.params as { id: string }).id);
  });

  app.post('/api/scripts', async (req, reply) => {
    return reply.status(201).send(scripts.create(req.actor!, req.body as any));
  });

  app.patch('/api/scripts/:id', async (req, reply) => {
    return scripts.update(req.actor!, (req.params as { id: string }).id, req.body as any);
  });

  app.delete('/api/scripts/:id', async (req, reply) => {
    return scripts.delete(req.actor!, (req.params as { id: string }).id);
  });
}

export function registerBrandDealRoutes(app: FastifyInstance, deals: BrandDealService) {
  app.get('/api/brand-deals', async (req, reply) => {
    return deals.list(req.actor!, req.query as any);
  });

  app.get('/api/brand-deals/:id', async (req, reply) => {
    return deals.get(req.actor!, (req.params as { id: string }).id);
  });

  app.post('/api/brand-deals', async (req, reply) => {
    return reply.status(201).send(deals.create(req.actor!, req.body as any));
  });

  app.patch('/api/brand-deals/:id', async (req, reply) => {
    return deals.update(req.actor!, (req.params as { id: string }).id, req.body as any);
  });

  app.post('/api/brand-deals/:id/stage', async (req, reply) => {
    return deals.setStage(req.actor!, (req.params as { id: string }).id, (req.body as { stage: any }).stage);
  });
}

export function registerContentProjectRoutes(
  app: FastifyInstance,
  studio: ContentProjectService,
  db: Db,
) {
  app.get('/api/content-projects', async (req, reply) => {
    return studio.list(req.actor!, (req.query as { characterId?: string }).characterId);
  });

  app.post('/api/content-projects', async (req, reply) => {
    return reply.status(201).send(studio.create(req.actor!, req.body as any));
  });

  app.get('/api/content-projects/:id', async (req, reply) => {
    return studio.get(req.actor!, (req.params as { id: string }).id);
  });

  app.patch('/api/content-projects/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const repo = new Repository(db, contentProjects, 'content project');
    return repo.update(req.actor!.principal.workspaceId, id, req.body as any);
  });

  app.get('/api/content-projects/:id/shots', async (req, reply) => {
    const { id } = req.params as { id: string };
    return studio.get(req.actor!, id);
  });

  app.post('/api/content-projects/:id/shots', async (req, reply) => {
    return reply.status(201).send(studio.addShot(req.actor!, (req.params as { id: string }).id, req.body as any));
  });

  app.patch('/api/content-projects/shots/:shotId', async (req, reply) => {
    return studio.updateShot(req.actor!, (req.params as { shotId: string }).shotId, req.body as any);
  });

  app.delete('/api/content-projects/shots/:shotId', async (req, reply) => {
    return studio.deleteShot(req.actor!, (req.params as { shotId: string }).shotId);
  });

  app.post('/api/content-projects/shots/:shotId/duplicate', async (req, reply) => {
    return studio.duplicateShot(req.actor!, (req.params as { shotId: string }).shotId);
  });

  app.post('/api/content-projects/:id/shots/reorder', async (req, reply) => {
    return studio.reorderShots(req.actor!, (req.params as { id: string }).id, req.body as string[]);
  });
}