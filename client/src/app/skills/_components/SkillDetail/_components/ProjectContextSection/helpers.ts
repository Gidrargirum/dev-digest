import type { ContextDoc } from "@devdigest/shared";

/** Case-insensitive filter over a document's path + name. */
export function filterDocs(docs: ContextDoc[], search: string): ContextDoc[] {
  const q = search.trim().toLowerCase();
  if (!q) return docs;
  return docs.filter((d) => `${d.path} ${d.name}`.toLowerCase().includes(q));
}

/** Swap `paths[index]` with its neighbour in `direction` (-1 = up, +1 = down). */
export function reorder(paths: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= paths.length) return paths;
  const next = [...paths];
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}

/** Sum of a set of paths' token counts, looked up from the repo's catalog.
    A broken/unknown path contributes 0. */
export function sumTokens(paths: string[], catalog: ContextDoc[]): number {
  const byPath = new Map(catalog.map((d) => [d.path, d.tokens]));
  return paths.reduce((total, p) => total + (byPath.get(p) ?? 0), 0);
}
