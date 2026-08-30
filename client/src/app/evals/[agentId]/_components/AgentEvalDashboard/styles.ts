import type { CSSProperties } from "react";

/** Co-located styles for AgentEvalDashboard. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 24, padding: "24px 32px", maxWidth: 1080, margin: "0 auto" } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h1: { fontSize: 20, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  metricsRow: { display: "flex", gap: 14 } satisfies CSSProperties,
  metricCard: { flex: 1, textAlign: "center" } satisfies CSSProperties,
  metricValue: { fontSize: 26, fontWeight: 700 } satisfies CSSProperties,
  metricLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginTop: 4,
  } satisfies CSSProperties,
  banner: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 7,
    background: "var(--crit-bg)",
    border: "1px solid var(--crit)",
    color: "var(--crit)",
    fontSize: 13,
    fontWeight: 600,
  } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)" } satisfies CSSProperties,
  recentRunsHeader: { display: "flex", alignItems: "center", gap: 12, marginBottom: 8 } satisfies CSSProperties,
  compareButtonWrap: { marginLeft: "auto" } satisfies CSSProperties,
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
