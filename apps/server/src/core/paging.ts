import { z } from 'zod';

/**
 * Cursor pagination everywhere (spec §131 targets 1M+ messages, 100k+ fans).
 * Cursors are opaque base64 of the sort key so callers cannot page by offset.
 */
export const PageQuery = z.object({
  limit: z.coerce.number().int().min(1).max(200).default(50),
  cursor: z.string().optional(),
  order: z.enum(['asc', 'desc']).default('desc'),
});
export type PageQuery = z.infer<typeof PageQuery>;

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
  hasMore: boolean;
}

export const encodeCursor = (v: string): string => Buffer.from(v, 'utf8').toString('base64url');
export const decodeCursor = (v: string): string => Buffer.from(v, 'base64url').toString('utf8');

/**
 * Build a page from a slice fetched with `limit + 1` rows: the extra row is the
 * existence proof for `hasMore` and never leaks into `items`.
 */
export function toPage<T>(rows: T[], limit: number, cursorOf: (row: T) => string): Page<T> {
  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;
  const last = items.at(-1);
  return {
    items,
    hasMore,
    nextCursor: hasMore && last ? encodeCursor(cursorOf(last)) : null,
  };
}
