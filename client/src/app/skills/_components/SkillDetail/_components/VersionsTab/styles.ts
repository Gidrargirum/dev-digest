import type { CSSProperties } from "react";

/** Co-located styles for VersionsTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  heading: { fontSize: 18, fontWeight: 700 } satisfies CSSProperties,
  explainer: { fontSize: 13, color: "var(--text-secondary)", marginTop: 4, marginBottom: 20, lineHeight: 1.5 } satisfies CSSProperties,
  row: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 12px",
    borderRadius: 7,
    border: "1px solid var(--border)",
    background: "var(--bg-elevated)",
    marginBottom: 8,
  } satisfies CSSProperties,
  versionBadge: { flex: 1 } satisfies CSSProperties,
  date: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  actions: { display: "flex", gap: 8 } satisfies CSSProperties,
  diffPre: {
    margin: 0,
    fontSize: 12.5,
    lineHeight: 1.6,
    maxHeight: "60vh",
    overflow: "auto",
    padding: "12px 0",
  } satisfies CSSProperties,
  diffLine: (kind: "same" | "added" | "removed"): CSSProperties => ({
    padding: "0 16px",
    whiteSpace: "pre-wrap",
    background:
      kind === "added" ? "var(--ok-bg)" : kind === "removed" ? "var(--crit-bg)" : "transparent",
  }),
} as const;
