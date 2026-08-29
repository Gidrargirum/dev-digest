import type { ContextDoc } from "@devdigest/shared";

/** Case-insensitive filter over a document's path + name. Mirrors
    SkillsTab's filterSkills. */
export function filterDocs(docs: ContextDoc[], search: string): ContextDoc[] {
  const q = search.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => `${d.path} ${d.name}`.toLowerCase().includes(q));
}

/** Move `from` to sit immediately before `to` in `seq` (identity by value).
    Pure — returns a new array; a no-op (same reference contents) if either
    path is absent or they are already adjacent in that direction. */
export function moveBefore(seq: string[], from: string, to: string): string[] {
  if (from === to) return seq;
  const fromIdx = seq.indexOf(from);
  const toIdx = seq.indexOf(to);
  if (fromIdx === -1 || toIdx === -1) return seq;
  const next = seq.filter((p) => p !== from);
  const insertAt = next.indexOf(to);
  next.splice(insertAt, 0, from);
  return next;
}

/** Swap `seq[index]` with its neighbour in `direction` (-1 = up, +1 = down)
    for keyboard reordering. No-op if the move would go out of bounds. Pure. */
export function reorder(seq: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= seq.length) return seq;
  const next = [...seq];
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

/** Order the full catalog so that already-attached docs come first, in the
    persisted attachment order, and the rest follow in catalog order. This is
    the initial drag sequence. */
export function seedSequence(
  catalog: ContextDoc[],
  attachedOrder: string[],
): string[] {
  const known = new Set(catalog.map((d) => d.path));
  const head = attachedOrder.filter((p) => known.has(p));
  const headSet = new Set(head);
  const tail = catalog.map((d) => d.path).filter((p) => !headSet.has(p));
  return [...head, ...tail];
}

/** Sum of a set of paths' token counts, looked up from the repo's catalog.
    A broken/unknown path contributes 0 — its token count isn't knowable
    without reading a file that may no longer exist. */
export function sumTokens(paths: string[], catalog: ContextDoc[]): number {
  const byPath = new Map(catalog.map((d) => [d.path, d.tokens]));
  return paths.reduce((total, p) => total + (byPath.get(p) ?? 0), 0);
}
