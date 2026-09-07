import { z } from 'zod';
import { FastifyInstance } from 'fastify';
import { CharacterService } from '../services/characters.js';
import { PageQuery } from '../core/paging.js';

const CharacterListQuery = PageQuery.extend({
  status: z.string().optional(),
  includeArchived: z.coerce.boolean().optional(),
});

export function registerCharacterRoutes(app: FastifyInstance, characters: CharacterService) {
  app.get('/api/characters', async (req, reply) => {
    const q = CharacterListQuery.parse(req.query);
    return characters.list(req.actor!, {
      limit: q.limit,
      cursor: q.cursor,
      status: q.status as any,
      includeArchived: q.includeArchived,
    });
  });

  app.get('/api/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return characters.get(req.actor!, id);
  });

  app.post('/api/characters', async (req, reply) => {
    return reply.status(201).send(characters.create(req.actor!, req.body as any));
  });

  app.patch('/api/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return characters.update(req.actor!, id, req.body as any);
  });

  app.delete('/api/characters/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    return characters.delete(req.actor!, id);
  });

  app.post('/api/characters/:id/archive', async (req, reply) => {
    const { id } = req.params as { id: string };
    return characters.archive(req.actor!, id);
  });

  app.post('/api/characters/:id/locks', async (req, reply) => {
    const { id } = req.params as { id: string };
    const { field, locked } = req.body as { field: any; locked: boolean };
    return characters.setLock(req.actor!, id, field, locked);
  });

  app.get('/api/characters/:id/versions', async (req, reply) => {
    const { id } = req.params as { id: string };
    return characters.versions(req.actor!, id);
  });

  app.post('/api/characters/:id/versions/:version/restore', async (req, reply) => {
    const { id, version } = req.params as { id: string; version: string };
    return characters.restoreVersion(req.actor!, id, parseInt(version, 10));
  });

  app.get('/api/characters/:id/todos', async (req, reply) => {
    const { id } = req.params as { id: string };
    return characters.todos(req.actor!, id);
  });
}