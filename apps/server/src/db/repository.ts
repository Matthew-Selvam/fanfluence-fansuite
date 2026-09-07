import { and, asc, desc, eq, gt, isNull, lt, sql, type SQL } from 'drizzle-orm';
import type { SQLiteColumn, SQLiteTable } from 'drizzle-orm/sqlite-core';
import type { Db } from './client.js';
import { conflict, notFound } from '../core/errors.js';
import { decodeCursor, toPage, type Page, type PageQuery } from '../core/paging.js';

/**
 * Shared CRUD for workspace-scoped entities.
 *
 * Every read filters on `workspace_id` and `deleted_at IS NULL`, so a caller
 * cannot accidentally reach across workspaces or resurrect soft-deleted rows —
 * the two mistakes that would break the §106 privacy model.
 */

interface BaseTable extends SQLiteTable {
  id: SQLiteColumn;
  workspaceId: SQLiteColumn;
  createdAt: SQLiteColumn;
  updatedAt: SQLiteColumn;
  deletedAt: SQLiteColumn;
  version: SQLiteColumn;
}

export interface ListOptions extends Partial<PageQuery> {
  where?: SQL | undefined;
  /** Column to paginate by. Must be monotonic; defaults to `createdAt`. */
  orderBy?: SQLiteColumn;
  includeDeleted?: boolean;
}

export class Repository<T extends BaseTable> {
  constructor(
    protected readonly db: Db,
    protected readonly table: T,
    protected readonly entityName: string,
  ) {}

  /** Base predicate every query starts from. */
  scope(workspaceId: string, includeDeleted = false): SQL {
    const clauses: SQL[] = [eq(this.table.workspaceId, workspaceId)];
    if (!includeDeleted) clauses.push(isNull(this.table.deletedAt) as SQL);
    return and(...clauses)!;
  }

  find(workspaceId: string, id: string, includeDeleted = false): T['$inferSelect'] | undefined {
    return this.db
      .select()
      .from(this.table as SQLiteTable)
      .where(and(this.scope(workspaceId, includeDeleted), eq(this.table.id, id)))
      .get() as T['$inferSelect'] | undefined;
  }

  get(workspaceId: string, id: string): T['$inferSelect'] {
    const row = this.find(workspaceId, id);
    if (!row) throw notFound(this.entityName, id);
    return row;
  }

  list(workspaceId: string, options: ListOptions = {}): Page<T['$inferSelect']> {
    const limit = options.limit ?? 50;
    const order = options.orderBy ?? this.table.createdAt;
    const direction = options.order ?? 'desc';

    const clauses: SQL[] = [this.scope(workspaceId, options.includeDeleted)];
    if (options.where) clauses.push(options.where);

    // Keyset pagination: the cursor is the last row's sort value, so a page is
    // stable even while rows are being inserted ahead of it.
    if (options.cursor) {
      const value = coerce(decodeCursor(options.cursor));
      clauses.push((direction === 'desc' ? lt(order, value) : gt(order, value)) as SQL);
    }

    const rows = this.db
      .select()
      .from(this.table as SQLiteTable)
      .where(and(...clauses))
      .orderBy(direction === 'desc' ? desc(order) : asc(order), desc(this.table.id))
      .limit(limit + 1)
      .all() as Array<T['$inferSelect']>;

    return toPage(rows, limit, (row) =>
      cursorValue((row as Record<string, unknown>)[order.name] ?? ''),
    );
  }

  count(workspaceId: string, where?: SQL): number {
    const clauses: SQL[] = [this.scope(workspaceId)];
    if (where) clauses.push(where);
    const row = this.db
      .select({ n: sql<number>`count(*)` })
      .from(this.table as SQLiteTable)
      .where(and(...clauses))
      .get();
    return row?.n ?? 0;
  }

  insert(values: T['$inferInsert']): T['$inferSelect'] {
    return this.db
      .insert(this.table as SQLiteTable)
      .values(values as never)
      .returning()
      .get() as T['$inferSelect'];
  }

  /**
   * Patch a row, bumping `version`. When `expectedVersion` is supplied the
   * update is conditional, which is how the API surfaces lost-update conflicts
   * instead of silently overwriting a concurrent edit.
   */
  update(
    workspaceId: string,
    id: string,
    patch: Partial<T['$inferInsert']>,
    expectedVersion?: number,
  ): T['$inferSelect'] {
    const current = this.get(workspaceId, id) as { version: number };

    if (expectedVersion !== undefined && current.version !== expectedVersion) {
      throw conflict(`${this.entityName} was modified by someone else`, {
        expectedVersion,
        actualVersion: current.version,
      });
    }

    const row = this.db
      .update(this.table as SQLiteTable)
      .set({
        ...(patch as Record<string, unknown>),
        updatedAt: new Date(),
        version: sql`${this.table.version} + 1`,
      } as never)
      .where(and(this.scope(workspaceId), eq(this.table.id, id)))
      .returning()
      .get() as T['$inferSelect'] | undefined;

    if (!row) throw notFound(this.entityName, id);
    return row;
  }

  /** Spec §47 — soft delete is the default for business data. */
  softDelete(workspaceId: string, id: string): T['$inferSelect'] {
    return this.update(workspaceId, id, { deletedAt: new Date() } as Partial<T['$inferInsert']>);
  }

  restore(workspaceId: string, id: string): T['$inferSelect'] {
    const row = this.find(workspaceId, id, true);
    if (!row) throw notFound(this.entityName, id);
    return this.db
      .update(this.table as SQLiteTable)
      .set({ deletedAt: null, updatedAt: new Date(), version: sql`${this.table.version} + 1` } as never)
      .where(and(eq(this.table.workspaceId, workspaceId), eq(this.table.id, id)))
      .returning()
      .get() as T['$inferSelect'];
  }

  /** Spec §47 — hard deletion is deliberate and separate. */
  hardDelete(workspaceId: string, id: string): void {
    this.db
      .delete(this.table as SQLiteTable)
      .where(and(eq(this.table.workspaceId, workspaceId), eq(this.table.id, id)))
      .run();
  }

  all(workspaceId: string, where?: SQL, limit = 1000): Array<T['$inferSelect']> {
    const clauses: SQL[] = [this.scope(workspaceId)];
    if (where) clauses.push(where);
    return this.db
      .select()
      .from(this.table as SQLiteTable)
      .where(and(...clauses))
      .limit(limit)
      .all() as Array<T['$inferSelect']>;
  }
}

/** Cursors are strings; timestamps become epoch millis so ordering is numeric. */
function cursorValue(value: unknown): string {
  if (value instanceof Date) return String(value.getTime());
  return String(value);
}

function coerce(value: string): Date | string {
  const asNumber = Number(value);
  // Cursor values for timestamp columns are epoch millis and must go back as Dates.
  if (Number.isFinite(asNumber) && value.length >= 12) return new Date(asNumber);
  return value;
}
