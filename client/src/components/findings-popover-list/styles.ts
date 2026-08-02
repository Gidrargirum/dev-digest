import type { CSSProperties } from "react";

/** Co-located styles for the findings hover popover. */
export const s = {
  header: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginBottom: 10,
  } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  item: { display: "flex", flexDirection: "column", gap: 5, minWidth: 0 } satisfies CSSProperties,
  titleRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexWrap: "wrap",
    minWidth: 0,
  } satisfies CSSProperties,
  title: {
    fontSize: 13,
    fontWeight: 650,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  metaRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  file: { fontSize: 12, color: "var(--accent-text)" } satisfies CSSProperties,
  // Two lines is enough to tell what the finding is about; the PR page has the
  // full markdown rationale.
  rationale: {
    fontSize: 12.5,
    lineHeight: 1.45,
    color: "var(--text-secondary)",
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  } as CSSProperties,
  more: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 10,
    paddingTop: 8,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  state: { fontSize: 12.5, color: "var(--text-muted)" } satisfies CSSProperties,
  skeletonStack: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
  } satisfies CSSProperties,
} as const;
