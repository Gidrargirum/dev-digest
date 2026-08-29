import type { CSSProperties } from "react";

/** Co-located styles for ContextTab. Mirrors SkillsTab/styles.ts token usage. */
export const s = {
  wrap: { maxWidth: 1100 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 10 } satisfies CSSProperties,
  tokenEstimate: {
    fontSize: 12,
    color: "var(--text-secondary)",
    marginBottom: 14,
  } satisfies CSSProperties,
  repoRow: { marginBottom: 14, maxWidth: 320 } satisfies CSSProperties,
  filterRow: { marginBottom: 14 } satisfies CSSProperties,

  /** Two columns: the document list and (when a doc is being previewed) the
      preview panel. Collapses to one column under 900px. */
  split: {
    display: "grid",
    gridTemplateColumns: "minmax(0, 1fr)",
    gap: 20,
    marginBottom: 20,
  } satisfies CSSProperties,
  splitWithPanel: {
    gridTemplateColumns: "minmax(0, 1.4fr) minmax(0, 1fr)",
  } satisfies CSSProperties,

  list: { display: "flex", flexDirection: "column", gap: 8 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
  } satisfies CSSProperties,
  rowBroken: { borderColor: "var(--crit)" } satisfies CSSProperties,
  rowDragOver: { borderColor: "var(--accent)", borderStyle: "dashed" } satisfies CSSProperties,
  rowDragging: { opacity: 0.4 } satisfies CSSProperties,
  rowMain: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  pathPrefix: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,

  handle: {
    display: "inline-grid",
    placeItems: "center",
    width: 22,
    height: 26,
    flexShrink: 0,
    cursor: "grab",
    borderRadius: 5,
    border: "1px solid transparent",
    background: "transparent",
    color: "var(--text-muted)",
  } satisfies CSSProperties,

  meta: { display: "flex", alignItems: "center", gap: 10, flexShrink: 0 } satisfies CSSProperties,
  tokens: { fontSize: 12, color: "var(--text-muted)", fontVariantNumeric: "tabular-nums" } satisfies CSSProperties,
  order: { fontSize: 12, color: "var(--text-muted)", width: 20, textAlign: "right" } satisfies CSSProperties,

  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,

  panel: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 16,
    minWidth: 0,
    maxHeight: 640,
    overflow: "auto",
    position: "sticky",
    top: 12,
  } satisfies CSSProperties,
  panelHead: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 12,
  } satisfies CSSProperties,
  panelPath: { fontSize: 12, color: "var(--text-muted)", flex: 1, minWidth: 0, overflowWrap: "anywhere" } satisfies CSSProperties,
  panelBody: { fontSize: 13, lineHeight: 1.6 } satisfies CSSProperties,
  panelState: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,

  inheritedSection: { marginTop: 4, marginBottom: 20 } satisfies CSSProperties,
  inheritedTitle: {
    fontSize: 12,
    fontWeight: 700,
    color: "var(--text-muted)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 8,
  } satisfies CSSProperties,
  inheritedRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 12px",
    borderRadius: 8,
    border: "1px dashed var(--border)",
    background: "var(--bg-hover)",
    fontSize: 13,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
} as const;
