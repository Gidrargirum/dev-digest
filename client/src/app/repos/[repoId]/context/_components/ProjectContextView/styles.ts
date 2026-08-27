import type { CSSProperties } from "react";

/** Co-located styles for ProjectContextView. */
export const s = {
  header: { marginBottom: 18 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, color: "var(--text-primary)" } satisfies CSSProperties,
  subtitle: {
    fontSize: 13,
    color: "var(--text-secondary)",
    marginTop: 6,
    lineHeight: 1.5,
  } satisfies CSSProperties,
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: 4,
    marginBottom: 12,
  } satisfies CSSProperties,
  filterRow: { marginBottom: 12, maxWidth: 360 } satisfies CSSProperties,
  uploadError: { fontSize: 12, color: "var(--crit)", marginBottom: 10 } satisfies CSSProperties,
  layout: { display: "flex", gap: 16, alignItems: "flex-start" } satisfies CSSProperties,
  treeCol: { flex: "1 1 360px", minWidth: 0 } satisfies CSSProperties,
  previewWrap: {
    flex: "1 1 420px",
    minWidth: 0,
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 16,
  } satisfies CSSProperties,
  loadingStack: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
} as const;
