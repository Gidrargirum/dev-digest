import type { CSSProperties } from "react";

/** Co-located styles for CreateSkillModal (mirrors CreateAgentModal/styles.ts). */
export const s = {
  body: { padding: "20px 24px", overflowY: "auto" } satisfies CSSProperties,
  footer: { display: "flex", justifyContent: "flex-end", gap: 10 } satisfies CSSProperties,
  banner: {
    display: "flex",
    gap: 10,
    alignItems: "flex-start",
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--border)",
    background: "var(--bg-hover)",
    color: "var(--text-secondary)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  bannerIcon: { color: "var(--accent)", flexShrink: 0, marginTop: 2 } satisfies CSSProperties,
  loading: { padding: "28px 4px", fontSize: 13, color: "var(--text-secondary)" } satisfies CSSProperties,
  loadingGap: { height: 12 } satisfies CSSProperties,
  error: {
    padding: "10px 12px",
    borderRadius: 8,
    border: "1px solid var(--crit)",
    background: "var(--crit-bg)",
    color: "var(--crit)",
    fontSize: 13,
    lineHeight: 1.5,
    marginBottom: 20,
  } satisfies CSSProperties,
  agentsList: {
    display: "flex",
    flexDirection: "column",
    gap: 8,
    maxHeight: 160,
    overflowY: "auto",
  } satisfies CSSProperties,
  agentsEmpty: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
