/* Smart Diff annotations — the anti-corruption layer between the diff
   viewer (this shared component) and the app-level Smart Diff feature
   (`_components/DiffTab/_components/SmartDiffView/`).

   The diff viewer lives in `src/components/` and must not import from
   `src/app/**` (frontend-architecture direction rule), so it does NOT import
   `FindingMark` from SmartDiffView/helpers.ts. It declares its own minimal
   `DiffFindingMark` shape here instead; the caller (SmartDiffView, wired up
   in DiffTab) is responsible for adapting its `findingsByPath()` output into
   this shape before passing it down as `DiffAnnotationApi`.

   `DiffAnnotationApi` mirrors the existing optional `commenting?:
   DiffCommentApi` pattern exactly: when `annotations` is `undefined`,
   DiffViewer / FileCard / CodeLine behave exactly as they did before this
   layer existed — asserted by a regression test in DiffViewer.test.tsx. */
import type { CSSProperties } from "react";
import type { Severity } from "../../lib/types";
import type { Line } from "./helpers";

/** One finding, reduced to what the diff viewer needs to render a chip. */
export interface DiffFindingMark {
  id: string;
  startLine: number;
  endLine: number;
  severity: Severity;
  title: string;
}

/** What the viewer needs to render Smart Diff's finding marks + large-file
 *  badge on top of the plain diff. */
export interface DiffAnnotationApi {
  /** Every finding for this PR, keyed by file path. */
  marksByPath: Map<string, DiffFindingMark[]>;
  /** Click handler for a finding chip. Navigates to the finding's card —
   *  nothing else: no popup, no `window.open`, no GitHub link. */
  onOpenFinding: (id: string) => void;
  /** additions+deletions threshold above which FileCard shows the LARGE
   *  badge (the canonical default lives in `./constants` as
   *  `LARGE_FILE_LINES`; passed explicitly so FileCard never has to import
   *  a Smart-Diff-specific constant on its own). */
  largeFileLines: number;
}

/**
 * Splits a file's finding marks into ones that land on a rendered line
 * (keyed by that line's number) and "unanchored" ones that don't — either
 * because `patch` is empty/null (as in the seeded PR #482, where all 4 files
 * have `patch = NULL`) or because the finding's line range falls outside
 * every rendered hunk. Mirrors `partitionThreads` in ../comments.ts.
 */
export function partitionMarks(
  marks: DiffFindingMark[],
  lines: Line[],
): { anchored: Map<number, DiffFindingMark[]>; unanchored: DiffFindingMark[] } {
  const renderedLines = new Set<number>();
  for (const ln of lines) {
    if (ln.newNo != null) renderedLines.add(ln.newNo);
    if (ln.oldNo != null) renderedLines.add(ln.oldNo);
  }
  const anchored = new Map<number, DiffFindingMark[]>();
  const unanchored: DiffFindingMark[] = [];
  for (const mark of marks) {
    let anchorLine: number | null = null;
    for (let n = mark.startLine; n <= mark.endLine; n++) {
      if (renderedLines.has(n)) {
        anchorLine = n;
        break;
      }
    }
    if (anchorLine == null) {
      unanchored.push(mark);
    } else {
      const list = anchored.get(anchorLine);
      if (list) list.push(mark);
      else anchored.set(anchorLine, [mark]);
    }
  }
  return { anchored, unanchored };
}

/** Marks anchored to a given parsed line (matched by its new/old number). */
export function marksForLine(
  ln: Line,
  anchored: Map<number, DiffFindingMark[]>,
): DiffFindingMark[] {
  const n = ln.newNo ?? ln.oldNo;
  if (n == null) return [];
  return anchored.get(n) ?? [];
}

// ---- styles (layout only; chips reuse @devdigest/ui's SeverityBadge) ----
export const as = {
  marksRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 6,
    margin: "2px 14px 6px 58px",
  } satisfies CSSProperties,
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "2px 8px 2px 2px",
    border: "1px solid var(--border)",
    borderRadius: 6,
    background: "var(--bg-elevated)",
    cursor: "pointer",
    font: "inherit",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  chipTitle: {
    fontSize: 12,
    maxWidth: 280,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  unanchoredWrap: {
    borderTop: "1px solid var(--border)",
    margin: "4px 14px 4px 58px",
    paddingTop: 10,
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
  unanchoredTitle: {
    fontSize: 11,
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.06em",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  largeBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    color: "var(--warn)",
  } satisfies CSSProperties,
} as const;
