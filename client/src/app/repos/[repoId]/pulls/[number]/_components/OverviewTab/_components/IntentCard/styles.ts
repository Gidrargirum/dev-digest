import type { CSSProperties } from "react";

/** Confidence badge palette. Lives here rather than in the component: it is a
 *  style token table, and `styles.ts` is where this repo keeps those. */
export const confidenceColors: Record<string, { color: string; bg: string }> = {
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  high: { color: "var(--sugg)", bg: "var(--sugg-bg)" },
};

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  quote: {
    fontStyle: "italic",
    fontSize: 14,
    color: "var(--text-primary)",
    lineHeight: 1.55,
    margin: 0,
  } satisfies CSSProperties,
  columns: {
    display: "grid",
    // `minmax(0, 1fr)` and not `1fr`: a grid track's default `min-width: auto`
    // refuses to shrink below its longest word, so a long unbroken scope item
    // would blow the column past its share and push the card wider.
    gridTemplateColumns: "minmax(0, 1fr) minmax(0, 1fr)",
    gap: 24,
  } satisfies CSSProperties,
  columnTitle: (color: string) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 6,
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color,
      marginBottom: 10,
    }) satisfies CSSProperties,
  // `list-style` markers only exist on `display: list-item` children, so a flex
  // <ul> silently drops them — the bullet is drawn as its own element instead.
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
  } satisfies CSSProperties,
  listItem: (muted: boolean) =>
    ({
      display: "flex",
      gap: 8,
      fontSize: 13,
      lineHeight: 1.5,
      color: muted ? "var(--text-muted)" : "var(--text-secondary)",
    }) satisfies CSSProperties,
  bullet: {
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  riskSection: {
    borderTop: "1px solid var(--border)",
    paddingTop: 14,
  } satisfies CSSProperties,
  riskChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  /** Badge ships `white-space: nowrap`, which is right for a short label and
   *  wrong here: a risk area is a model-written sentence, and an unwrappable
   *  chip overflows the card instead of growing taller. Overridden through the
   *  `style` prop because `vendor/ui` is not ours to edit. */
  riskChip: {
    whiteSpace: "normal",
    textAlign: "left",
    lineHeight: 1.45,
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
} as const;
