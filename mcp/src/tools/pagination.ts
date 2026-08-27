/**
 * Offset-based pagination cursor, opaque to callers (per schemas.ts —
 * `TOOL_DEFINITIONS` cursor fields only promise "pass back what you got").
 * Base64 encoding is an implementation detail; a malformed/foreign cursor
 * degrades to "start over" rather than throwing, since a tool that fails on
 * a bad cursor gives the model nothing actionable to fix.
 */

export function encodeCursor(offset: number): string {
  return Buffer.from(String(offset), 'utf8').toString('base64');
}

/** Returns 0 for `undefined`, a malformed cursor, or a negative offset. */
export function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const decoded = Buffer.from(cursor, 'base64').toString('utf8');
    const offset = Number(decoded);
    return Number.isInteger(offset) && offset >= 0 ? offset : 0;
  } catch {
    return 0;
  }
}

/** Slices `items` at `[offset, offset + limit)` and returns the next cursor. */
export function paginate<T>(
  items: readonly T[],
  cursor: string | undefined,
  limit: number,
): { page: T[]; next_cursor: string | null } {
  const offset = decodeCursor(cursor);
  const page = items.slice(offset, offset + limit);
  const nextOffset = offset + page.length;
  const next_cursor = nextOffset < items.length ? encodeCursor(nextOffset) : null;
  return { page, next_cursor };
}
