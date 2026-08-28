import type { CSSProperties } from "react";

export const s = {
  list: {
    listStyle: "none",
    margin: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 16,
  } satisfies CSSProperties,
  // `display: flex` on the <ul> drops native markers, so the bullet is a real
  // element (client/insights/INSIGHTS.md, 2026-08-19).
  item: {
    display: "flex",
    gap: 10,
    fontSize: 13,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  bullet: {
    color: "var(--accent)",
    flexShrink: 0,
    fontWeight: 700,
  } satisfies CSSProperties,
  itemBody: {
    minWidth: 0,
  } satisfies CSSProperties,
  ref: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    color: "var(--accent-text)",
    background: "transparent",
    border: "none",
    padding: 0,
    marginRight: 6,
    cursor: "pointer",
    textDecoration: "underline",
  } satisfies CSSProperties,
  dash: {
    color: "var(--text-muted)",
  } satisfies CSSProperties,
} as const;
