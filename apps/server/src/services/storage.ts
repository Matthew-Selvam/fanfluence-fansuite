import { createHash, randomUUID } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, readFile, rename, rm, stat, writeFile } from 'node:fs/promises';
import { dirname, extname, join, normalize, relative, resolve, sep } from 'node:path';
import { AppError } from '../core/errors.js';

/**
 * Spec §49 — binary data lives on the filesystem, metadata lives in the
 * database. Nothing here writes bytes into SQLite.
 *
 * Keys are content-addressed (`<workspace>/<kind>/ab/cd/<sha256><ext>`) so
 * re-uploading the same file is free and asset versions never collide.
 */
export class AssetStorage {
  constructor(private readonly root: string) {}

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true });
  }

  key(workspaceId: string, kind: string, checksum: string, filename: string): string {
    const ext = extname(filename).toLowerCase().slice(0, 12);
    return join(workspaceId, kind, checksum.slice(0, 2), checksum.slice(2, 4), `${checksum}${ext}`);
  }

  /** Absolute path for a key, rejecting anything that escapes the root. */
  pathFor(storageKey: string): string {
    const full = resolve(this.root, normalize(storageKey));
    const rel = relative(this.root, full);
    if (rel.startsWith('..') || rel.startsWith(`..${sep}`) || resolve(rel) === rel) {
      throw new AppError('BAD_REQUEST', 'Invalid storage key', {
        reason: 'The storage key resolves outside the asset root.',
        affected: 'storage',
      });
    }
    return full;
  }

  /** Write bytes and return the content-addressed key. Idempotent by checksum. */
  async put(input: {
    workspaceId: string;
    kind: string;
    filename: string;
    data: Buffer;
  }): Promise<{ storageKey: string; checksum: string; sizeBytes: number; deduped: boolean }> {
    const checksum = createHash('sha256').update(input.data).digest('hex');
    const storageKey = this.key(input.workspaceId, input.kind, checksum, input.filename);
    const full = this.pathFor(storageKey);

    try {
      const existing = await stat(full);
      return { storageKey, checksum, sizeBytes: existing.size, deduped: true };
    } catch {
      // Not present yet — fall through and write it.
    }

    await mkdir(dirname(full), { recursive: true });
    // Write to a temp file then rename, so a crash mid-write cannot leave a
    // truncated file at a content-addressed key that would then be trusted.
    const temp = `${full}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temp, input.data);
    await rename(temp, full);

    return { storageKey, checksum, sizeBytes: input.data.byteLength, deduped: false };
  }

  /**
   * Stream-optimised write: hashes as it reads, writes to a temp file, then
   * renames atomically. Avoids buffering the entire file in memory.
   * The caller must provide the expected checksum (computed upstream while
   * streaming from the HTTP request).
   */
  async putStream(input: {
    workspaceId: string;
    kind: string;
    filename: string;
    stream: NodeJS.ReadableStream;
    expectedChecksum: string;
  }): Promise<{ storageKey: string; checksum: string; sizeBytes: number; deduped: boolean }> {
    const storageKey = this.key(input.workspaceId, input.kind, input.expectedChecksum, input.filename);
    const full = this.pathFor(storageKey);

    try {
      const existing = await stat(full);
      return { storageKey, checksum: input.expectedChecksum, sizeBytes: existing.size, deduped: true };
    } catch {
      // Not present yet.
    }

    await mkdir(dirname(full), { recursive: true });
    const temp = `${full}.${process.pid}.${randomUUID()}.tmp`;
    const hash = createHash('sha256');

    await new Promise<void>((resolve, reject) => {
      const dest = createWriteStream(temp);
      input.stream
        .on('data', (chunk: Buffer) => hash.update(chunk))
        .on('error', (err) => {
          dest.destroy();
          rm(temp, { force: true }).catch(() => {});
          reject(err);
        })
        .pipe(dest)
        .on('error', (err) => {
          rm(temp, { force: true }).catch(() => {});
          reject(err);
        })
        .on('finish', () => resolve());
    });

    const actualChecksum = hash.digest('hex');
    if (actualChecksum !== input.expectedChecksum) {
      await rm(temp, { force: true });
      throw new AppError('BAD_REQUEST', 'Upload checksum mismatch', {
        reason: 'The computed SHA-256 hash does not match the expected checksum. The file may have been corrupted during upload.',
        affected: 'media',
        remediation: ['retry'],
        retryable: true,
      });
    }

    await rename(temp, full);
    const { size: sizeBytes } = await stat(full);
    return { storageKey, checksum: actualChecksum, sizeBytes, deduped: false };
  }

  async get(storageKey: string): Promise<Buffer> {
    try {
      return await readFile(this.pathFor(storageKey));
    } catch (error) {
      throw new AppError('NOT_FOUND', 'Asset file is missing from storage', {
        reason: `No file at "${storageKey}".`,
        affected: 'storage',
        remediation: ['view_logs'],
        cause: error,
      });
    }
  }

  stream(storageKey: string): NodeJS.ReadableStream {
    return createReadStream(this.pathFor(storageKey));
  }

  async exists(storageKey: string): Promise<boolean> {
    try {
      await stat(this.pathFor(storageKey));
      return true;
    } catch {
      return false;
    }
  }

  async size(storageKey: string): Promise<number | null> {
    try {
      return (await stat(this.pathFor(storageKey))).size;
    } catch {
      return null;
    }
  }

  /**
   * Hard delete. Only called by the retention job and by an explicit destructive
   * action — soft-deleting an asset row never removes bytes (§47).
   */
  async remove(storageKey: string): Promise<void> {
    await rm(this.pathFor(storageKey), { force: true });
  }
}

/** Best-effort dimensions from the file header. No image library required. */
export function probeImageDimensions(data: Buffer): { width: number; height: number } | null {
  // PNG: 8-byte signature, then IHDR with width/height as big-endian uint32.
  if (data.length > 24 && data.readUInt32BE(0) === 0x89504e47) {
    return { width: data.readUInt32BE(16), height: data.readUInt32BE(20) };
  }
  // GIF: 'GIF8', then width/height as little-endian uint16.
  if (data.length > 10 && data.toString('ascii', 0, 4) === 'GIF8') {
    return { width: data.readUInt16LE(6), height: data.readUInt16LE(8) };
  }
  // JPEG: walk the segment chain to the first SOFn marker.
  if (data.length > 4 && data.readUInt16BE(0) === 0xffd8) {
    let offset = 2;
    while (offset + 9 < data.length) {
      if (data[offset] !== 0xff) { offset++; continue; }
      const marker = data[offset + 1]!;
      const length = data.readUInt16BE(offset + 2);
      // SOF0–SOF15, excluding the DHT/DAC/DNL markers in that range.
      if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) {
        return { height: data.readUInt16BE(offset + 5), width: data.readUInt16BE(offset + 7) };
      }
      offset += 2 + length;
    }
  }
  return null;
}

export function mimeToAssetKind(mimeType: string): 'image' | 'video' | 'audio' | 'document' {
  if (mimeType.startsWith('image/')) return 'image';
  if (mimeType.startsWith('video/')) return 'video';
  if (mimeType.startsWith('audio/')) return 'audio';
  return 'document';
}
