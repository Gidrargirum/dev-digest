import type { CSSProperties } from "react";

export const s = {
  /**
   * Overview's content column.
   *
   * The design puts INTENT in a two-card grid beside BLAST RADIUS, so each card
   * gets roughly half the page. BLAST RADIUS does not exist in this template
   * yet (a later lesson), and stretching a lone card across the full page turns
   * the two scope columns into very long lines. Capping the column reproduces
   * the design's measure without inventing the missing card — when BLAST RADIUS
   * lands, this becomes the grid it was drawn as.
   */
  column: {
    display: "flex",
    flexDirection: "column",
    gap: 28,
    maxWidth: 720,
  } satisfies CSSProperties,
  descriptionBox: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    fontSize: 14,
    color: "var(--text-secondary)",
    whiteSpace: "pre-wrap",
    lineHeight: 1.55,
  } satisfies CSSProperties,
} as const;
