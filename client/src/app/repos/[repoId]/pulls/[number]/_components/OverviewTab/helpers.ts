/** Parse a model-authored file reference like `a/b.ts:12-18`, `a/b.ts:42`, or
 *  bare `a/b.ts` into a `{ path, line }` pair. A range keeps only its first
 *  line; no line marker yields `line: null`.
 *
 *  The parsed value is only ever used as a LOOKUP KEY against the PR's own
 *  changed-file list (see DiffTab, AC-27) — never to construct a filesystem
 *  path, a fetch URL, or an `href` (specs/2026-08-28-pr-brief.md, "Untrusted
 *  inputs"). */
export function parseFileRef(ref: string): { path: string; line: number | null } {
  const m = ref.match(/^(.*?):(\d+)(?:-\d+)?$/);
  if (!m) return { path: ref, line: null };
  return { path: m[1]!, line: Number(m[2]) };
}
