import type { CSSProperties } from "react";

export const s = {
  group: {
    marginBottom: 20,
  } satisfies CSSProperties,
  groupHeader: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    width: "100%",
    padding: "8px 0",
    background: "transparent",
    border: "none",
    cursor: "pointer",
    textAlign: "left",
  } satisfies CSSProperties,
  groupTitle: {
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.07em",
    textTransform: "uppercase",
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  groupSummary: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  groupFindingsCount: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12,
    fontWeight: 600,
    color: "var(--warn)",
    marginLeft: "auto",
  } satisfies CSSProperties,
  groupBody: {
    marginTop: 8,
  } satisfies CSSProperties,
} as const;
