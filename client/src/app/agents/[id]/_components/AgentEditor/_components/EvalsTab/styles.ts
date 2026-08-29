import type { CSSProperties } from "react";

/** Co-located styles for EvalsTab. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  header: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700, flex: 1 } satisfies CSSProperties,
  metricsRow: { display: "flex", gap: 12 } satisfies CSSProperties,
  metricCard: { flex: 1, textAlign: "center" } satisfies CSSProperties,
  metricValue: { fontSize: 24, fontWeight: 700 } satisfies CSSProperties,
  metricLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginTop: 4,
  } satisfies CSSProperties,
  caseRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 14px",
    borderBottom: "1px solid var(--border)",
  } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  caseName: { fontSize: 14, fontWeight: 600, flex: 1 } satisfies CSSProperties,
  caseMeta: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
  caseActions: { display: "flex", gap: 6 } satisfies CSSProperties,
} as const;
