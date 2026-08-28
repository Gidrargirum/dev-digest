import type { CSSProperties } from "react";

export const s = {
  /** Full-width stack: PR Brief card, then the Intent/Blast grid, then Review
   *  Focus, then the PR description — the block order AC-18 / AC-23 pin down. */
  wrap: {
    display: "flex",
    flexDirection: "column",
    gap: 28,
  } satisfies CSSProperties,
  /** Two-column layout: INTENT on the left, BLAST RADIUS on the
   *  right, matching the reference design. `minmax(0, 1fr)` on both tracks so
   *  neither column's content (a long unbroken scope item, a wide symbol
   *  name) can push the grid past its share. */
  grid: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 28,
  } satisfies CSSProperties,
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 28,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
