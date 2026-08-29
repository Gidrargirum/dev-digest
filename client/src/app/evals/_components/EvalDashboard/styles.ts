import type { CSSProperties } from "react";

/** Co-located styles for EvalDashboard. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, padding: "24px 32px", maxWidth: 1080, margin: "0 auto" } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700 } satisfies CSSProperties,
  agentGrid: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  agentRow: {
    display: "flex",
    alignItems: "center",
    gap: 14,
    padding: "14px 16px",
    cursor: "pointer",
  } satisfies CSSProperties,
  agentName: { fontSize: 14, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  agentIcon: { color: "var(--accent)" } satisfies CSSProperties,
  metricCell: { fontSize: 13, color: "var(--text-secondary)", minWidth: 70 } satisfies CSSProperties,
  metricCellConfigure: { fontSize: 13, color: "var(--accent)", minWidth: 70 } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  noRuns: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  historyRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "10px 14px",
    borderBottom: "1px solid var(--border)",
    fontSize: 13,
  } satisfies CSSProperties,
  historyCell: { minWidth: 80 } satisfies CSSProperties,
} as const;
