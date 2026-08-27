/* Diff line-addressing — the anti-corruption layer between the diff viewer
   (this shared component) and the app-level features that address a file/line
   (the PR Brief's Review Focus block, and any future deep-link).

   Built exactly like the neighbouring `annotations.ts`: `src/components/` may
   not import from `src/app/**`, so this layer declares its own minimal types
   and the caller adapts. When `targeting` is `undefined`, DiffViewer /
   FileCard / CodeLine render exactly as before — the same compatibility
   guarantee `annotations.ts` documents. */
import type { CSSProperties } from "react";
import type { Line } from "./helpers";

/** One addressed line, reduced to what the diff viewer needs. */
export interface DiffTargetApi {
  path: string;
  /** `null` when only the file is addressed (no specific line). */
  line: number | null;
  /** Optional: lets the caller learn whether the line resolved. */
  onResolved?: (state: "anchored" | "unanchored") => void;
}

export type TargetState = "none" | "anchored" | "unanchored";

/**
 * Whether `target` addresses this file, and if so whether its line lands on a
 * rendered diff line. Uses the SAME line-membership criterion as
 * `partitionMarks` in `annotations.ts`: the set of `ln.newNo` / `ln.oldNo`
 * from the `parsePatch` result. `patch === null` (seed data — PR #482) or a
 * line outside every rendered hunk → `"unanchored"` (AC-29).
 */
export function resolveTarget(
  filePath: string,
  lines: Line[],
  target: DiffTargetApi | undefined,
): TargetState {
  if (!target || target.path !== filePath) return "none";
  if (target.line == null) return "unanchored";
  for (const ln of lines) {
    if (ln.newNo === target.line || ln.oldNo === target.line) return "anchored";
  }
  return "unanchored";
}

/** DOM id carried by the single anchored target line, so FileCard can scroll
 *  to it. Only one target exists at a time, so a fixed id is collision-free. */
export const TARGET_LINE_ID = "diff-target-line";

// ---- styles (layout only) ----
export const ts = {
  targetLine: {
    background: "var(--accent-bg, rgba(88,166,255,0.18))",
    boxShadow: "inset 3px 0 0 var(--accent, #58a6ff)",
  } satisfies CSSProperties,
  unanchoredNote: {
    margin: "4px 14px 8px 58px",
    fontSize: 12,
    color: "var(--text-muted)",
    fontStyle: "italic",
  } satisfies CSSProperties,
};
