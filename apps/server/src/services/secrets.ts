import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';
import { and, eq } from 'drizzle-orm';
import { secrets as secretsTable } from '../db/schema/index.js';
import type { Db } from '../db/client.js';
import { AppError } from '../core/errors.js';
import { newId } from '../core/ids.js';

/**
 * Spec §58 — credential storage.
 *
 * Secrets are sealed with AES-256-GCM and only the envelope is persisted. On
 * the desktop the master key comes from the Apple Keychain; on the server it
 * comes from the secret store. Nothing here ever returns a value to a browser:
 * callers hold a `ref`, and only the provider layer resolves it.
 */

const ALGORITHM = 'aes-256-gcm';

export interface KeyProvider {
  /** Stable identifier so a rotated key can still decrypt old envelopes. */
  keyId: string;
  key: Buffer;
}

export class SecretStore {
  private readonly keys = new Map<string, Buffer>();

  constructor(
    private readonly db: Db,
    private readonly active: KeyProvider,
    previousKeys: KeyProvider[] = [],
  ) {
    this.keys.set(active.keyId, active.key);
    for (const k of previousKeys) this.keys.set(k.keyId, k.key);
  }

  /** Seal `value` under `ref`, replacing any existing secret at that ref. */
  put(workspaceId: string, ref: string, value: string): { ref: string; hint: string } {
    const iv = randomBytes(12);
    const cipher = createCipheriv(ALGORITHM, this.active.key, iv);
    const ciphertext = Buffer.concat([cipher.update(value, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    const hint = hintFor(value);
    const now = new Date();

    const existing = this.db
      .select({ id: secretsTable.id })
      .from(secretsTable)
      .where(and(eq(secretsTable.workspaceId, workspaceId), eq(secretsTable.ref, ref)))
      .get();

    const payload = {
      ciphertext: ciphertext.toString('base64'),
      iv: iv.toString('base64'),
      authTag: authTag.toString('base64'),
      keyId: this.active.keyId,
      hint,
      updatedAt: now,
    };

    if (existing) {
      this.db.update(secretsTable).set(payload).where(eq(secretsTable.id, existing.id)).run();
    } else {
      this.db
        .insert(secretsTable)
        .values({ id: newId('setting'), workspaceId, ref, createdAt: now, ...payload })
        .run();
    }

    return { ref, hint };
  }

  /** Decrypt. Only ever called inside the provider layer, never at the API edge. */
  reveal(workspaceId: string, ref: string): string {
    const row = this.db
      .select()
      .from(secretsTable)
      .where(and(eq(secretsTable.workspaceId, workspaceId), eq(secretsTable.ref, ref)))
      .get();

    if (!row) {
      throw new AppError('PROVIDER_AUTH', 'Stored credential is missing', {
        reason: `No secret is stored at "${ref}".`,
        affected: 'credentials',
        remediation: ['reconnect', 'open_settings'],
        retryable: false,
      });
    }

    const key = this.keys.get(row.keyId);
    if (!key) {
      throw new AppError('PROVIDER_AUTH', 'Stored credential cannot be decrypted', {
        reason: `The key "${row.keyId}" that sealed this secret is not available. Reconnect the provider to re-enter it.`,
        affected: 'credentials',
        remediation: ['reconnect', 'open_settings'],
        retryable: false,
      });
    }

    try {
      const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(row.iv, 'base64'));
      decipher.setAuthTag(Buffer.from(row.authTag, 'base64'));
      return Buffer.concat([
        decipher.update(Buffer.from(row.ciphertext, 'base64')),
        decipher.final(),
      ]).toString('utf8');
    } catch (error) {
      throw new AppError('PROVIDER_AUTH', 'Stored credential failed integrity check', {
        reason: 'The encrypted value could not be authenticated. It may have been tampered with or the key rotated.',
        affected: 'credentials',
        remediation: ['reconnect'],
        retryable: false,
        cause: error,
      });
    }
  }

  /** Safe-to-display fingerprint. This is the only secret-derived value the API returns. */
  hint(workspaceId: string, ref: string): string | null {
    const row = this.db
      .select({ hint: secretsTable.hint })
      .from(secretsTable)
      .where(and(eq(secretsTable.workspaceId, workspaceId), eq(secretsTable.ref, ref)))
      .get();
    return row?.hint ?? null;
  }

  has(workspaceId: string, ref: string): boolean {
    return Boolean(
      this.db
        .select({ id: secretsTable.id })
        .from(secretsTable)
        .where(and(eq(secretsTable.workspaceId, workspaceId), eq(secretsTable.ref, ref)))
        .get(),
    );
  }

  delete(workspaceId: string, ref: string): void {
    this.db
      .delete(secretsTable)
      .where(and(eq(secretsTable.workspaceId, workspaceId), eq(secretsTable.ref, ref)))
      .run();
  }

  /** Re-seal every secret under the active key. Used after a key rotation. */
  rotate(workspaceId: string): number {
    const rows = this.db.select().from(secretsTable).where(eq(secretsTable.workspaceId, workspaceId)).all();
    let rotated = 0;
    for (const row of rows) {
      if (row.keyId === this.active.keyId) continue;
      try {
        this.put(workspaceId, row.ref, this.reveal(workspaceId, row.ref));
        rotated++;
      } catch {
        // A secret sealed by a key we no longer hold cannot be rotated; it must
        // be re-entered by the user. Skipping keeps rotation non-destructive.
      }
    }
    return rotated;
  }
}

function hintFor(value: string): string {
  if (value.length <= 8) return '••••';
  return `${value.slice(0, 3)}…${value.slice(-4)}`;
}

/** Derive a 32-byte key from a passphrase. The salt is fixed per install. */
export function deriveKey(passphrase: string, salt = 'fanfluence-v1'): Buffer {
  return createHash('sha256').update(`${salt}:${passphrase}`).digest();
}

export function generateMasterKey(): string {
  return randomBytes(32).toString('base64');
}
