import type { CSSProperties } from "react";

/** Co-located styles for CompareRunsPopup. */
export const s = {
  body: { padding: 24, display: "flex", flexDirection: "column", gap: 20 } satisfies CSSProperties,
  deltaRow: { display: "flex", gap: 16, flexWrap: "wrap" } satisfies CSSProperties,
  deltaCard: { flex: "1 1 140px", textAlign: "center" } satisfies CSSProperties,
  deltaValue: (positive: boolean, neutral: boolean): CSSProperties => ({
    fontSize: 20,
    fontWeight: 700,
    color: neutral ? "var(--text-secondary)" : positive ? "var(--ok)" : "var(--crit)",
  }),
  deltaLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    color: "var(--text-muted)",
    marginTop: 4,
  } satisfies CSSProperties,
  sectionTitle: { fontSize: 13, fontWeight: 700, color: "var(--text-secondary)", marginBottom: 8 } satisfies CSSProperties,
  diffBox: {
    border: "1px solid var(--border)",
    borderRadius: 7,
    padding: 12,
    maxHeight: 260,
    overflow: "auto",
    fontSize: 12.5,
    fontFamily: "var(--font-mono, monospace)",
  } satisfies CSSProperties,
  diffLine: (type: "same" | "add" | "del"): CSSProperties => ({
    whiteSpace: "pre-wrap",
    color: type === "add" ? "var(--ok)" : type === "del" ? "var(--crit)" : "var(--text-secondary)",
    background: type === "add" ? "var(--ok-bg, transparent)" : type === "del" ? "var(--crit-bg, transparent)" : "transparent",
  }),
  promoteRow: { display: "flex", gap: 10, justifyContent: "flex-end" } satisfies CSSProperties,
} as const;
