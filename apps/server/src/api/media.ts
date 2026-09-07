import { createHash } from 'node:crypto';
import { and, eq, isNull } from 'drizzle-orm';
import { mediaAssets } from '../db/schema/index.js';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db/client.js';
import { Repository } from '../db/repository.js';
import { requirePermission, workspaceOf } from '../services/context.js';
import type { AssetStorage } from '../services/storage.js';
import { mimeToAssetKind, probeImageDimensions } from '../services/storage.js';
import type { EventBus } from '../events/bus.js';
import type { AuditLog } from '../services/audit.js';
import type { Clock } from '../core/clock.js';
import { newId } from '../core/ids.js';
import { badRequest } from '../core/errors.js';

export function registerMediaRoutes(
  app: FastifyInstance,
  deps: {
    db: Db;
    storage: AssetStorage;
    events: EventBus;
    audit: AuditLog;
    clock: Clock;
  },
) {
  const repo = new Repository(deps.db, mediaAssets, 'media asset');

  app.post('/api/media/upload', async (req, reply) => {
    requirePermission(req.actor!, 'studio:write');

    const data = await req.file();
    if (!data) throw badRequest('No file provided');

    // Buffer in memory — at 50 MB cap this is acceptable.
    // Future: pipe directly via storage.putStream() with an upstream hash.
    const chunks: Buffer[] = [];
    for await (const chunk of data.file) chunks.push(chunk);
    const buffer = Buffer.concat(chunks);

    const checksum = createHash('sha256').update(buffer).digest('hex');
    const workspaceId = workspaceOf(req.actor!);

    // Duplicate check by content hash
    const existing = deps.db
      .select({ id: mediaAssets.id })
      .from(mediaAssets)
      .where(and(
        eq(mediaAssets.workspaceId, workspaceId),
        eq(mediaAssets.checksum, checksum),
        isNull(mediaAssets.deletedAt),
      ))
      .get();

    if (existing) {
      return deps.db.select().from(mediaAssets).where(eq(mediaAssets.id, existing.id)).get();
    }

    const kind = mimeToAssetKind(data.mimetype);
    const stored = await deps.storage.put({
      workspaceId,
      kind,
      filename: data.filename,
      data: buffer,
    });

    const dims = kind === 'image' ? probeImageDimensions(buffer) : null;

    const row = repo.insert({
      id: newId('mediaAsset'),
      workspaceId,
      kind,
      mimeType: data.mimetype,
      filename: data.filename,
      storageKey: stored.storageKey,
      checksum: stored.checksum,
      sizeBytes: buffer.byteLength,
      width: dims?.width ?? null,
      height: dims?.height ?? null,
      createdAt: deps.clock.now(),
      updatedAt: deps.clock.now(),
    });

    deps.events.emit({
      workspaceId, type: 'media.uploaded',
      entityType: 'media_asset', entityId: row.id,
      actor: req.actor!.kind, actorId: req.actor!.principal.userId,
      payload: { filename: data.filename, kind: row.kind },
    });

    return reply.status(201).send(row);
  });

  app.get('/api/media', async (req, reply) => {
    requirePermission(req.actor!, 'studio:read');
    const q = req.query as { kind?: string; characterId?: string; limit?: string; cursor?: string };
    const clauses: any[] = [];
    if (q.kind) clauses.push(eq(mediaAssets.kind, q.kind as never));
    if (q.characterId) clauses.push(eq(mediaAssets.characterId, q.characterId));
    return repo.list(workspaceOf(req.actor!), {
      limit: parseInt(q.limit ?? '50', 10),
      cursor: q.cursor,
      where: clauses.length ? and(...clauses) : undefined,
    });
  });

  app.get('/api/media/:id', async (req, reply) => {
    requirePermission(req.actor!, 'studio:read');
    return repo.get(workspaceOf(req.actor!), (req.params as { id: string }).id);
  });

  app.get('/api/media/:id/file', async (req, reply) => {
    requirePermission(req.actor!, 'studio:read');
    const asset = repo.get(workspaceOf(req.actor!), (req.params as { id: string }).id);
    const stream = deps.storage.stream(asset.storageKey);
    reply.type(asset.mimeType);
    const safeFilename = asset.filename.replace(/[\r\n"\\]/g, '_');
    reply.header('Content-Disposition', `inline; filename="${safeFilename}"`);
    return reply.send(stream);
  });

  app.delete('/api/media/:id', async (req, reply) => {
    requirePermission(req.actor!, 'studio:delete');
    const id = (req.params as { id: string }).id;
    const row = repo.softDelete(workspaceOf(req.actor!), id);
    deps.events.emit({
      workspaceId: workspaceOf(req.actor!), type: 'media.deleted',
      entityType: 'media_asset', entityId: id,
      actor: req.actor!.kind, actorId: req.actor!.principal.userId,
      payload: {},
    });
    return row;
  });
}