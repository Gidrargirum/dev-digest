import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextSection. Mirrors ContextTab/styles.ts. */
export const s = {
  wrap: { maxWidth: 760, marginTop: 28, paddingTop: 20, borderTop: "1px solid var(--border)" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12, marginBottom: 6 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  count: { marginLeft: "auto", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginBottom: 10 } satisfies CSSProperties,
  tokenEstimate: { fontSize: 12, color: "var(--text-secondary)", marginBottom: 14 } satisfies CSSProperties,
  repoRow: { marginBottom: 14, maxWidth: 320 } satisfies CSSProperties,
  filterRow: { marginBottom: 14 } satisfies CSSProperties,
  list: { display: "flex", flexDirection: "column", gap: 8, marginBottom: 16 } satisfies CSSProperties,
  row: { display: "flex", alignItems: "center", gap: 12, padding: "10px 12px", borderRadius: 8, border: "1px solid var(--border)", background: "var(--bg-elevated)" } satisfies CSSProperties,
  rowBroken: { borderColor: "var(--crit)" } satisfies CSSProperties,
  rowMain: { display: "flex", alignItems: "center", gap: 10, flex: 1, minWidth: 0 } satisfies CSSProperties,
  name: { fontSize: 13, fontWeight: 600 } satisfies CSSProperties,
  order: { fontSize: 12, color: "var(--text-muted)", width: 20, textAlign: "right" } satisfies CSSProperties,
  reorderBtns: { display: "flex", flexDirection: "column" } satisfies CSSProperties,
  reorderDisabled: { opacity: 0.35, pointerEvents: "none" } satisfies CSSProperties,
  rowActions: { display: "flex", alignItems: "center", gap: 6, flexShrink: 0 } satisfies CSSProperties,
  actions: { display: "flex", gap: 10, marginTop: 10 } satisfies CSSProperties,
  savedNote: { alignSelf: "center", fontSize: 13, color: "var(--ok)" } satisfies CSSProperties,
  empty: { fontSize: 13, color: "var(--text-muted)", padding: "12px 0" } satisfies CSSProperties,
} as const;
