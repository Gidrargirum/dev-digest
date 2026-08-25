import type { CSSProperties } from "react";

export const s = {
  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  countsRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginBottom: 16,
  } satisfies CSSProperties,
  partialNote: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginBottom: 16,
    padding: "10px 14px",
    borderRadius: 8,
    border: "1px solid var(--warn)",
    background: "var(--warn-bg)",
    fontSize: 13,
    color: "var(--warn)",
  } satisfies CSSProperties,
  // `list-style` markers only exist on `display: list-item` children, so a
  // flex <ul> silently drops them — not a problem here, each entry is its own
  // bordered card and never needed a bullet to begin with.
  list: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
  entry: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    overflow: "hidden",
  } satisfies CSSProperties,
  entryHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "12px 16px",
    cursor: "pointer",
  } satisfies CSSProperties,
  entrySymbol: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  entryMeta: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  chevron: (open: boolean) =>
    ({
      transition: "transform .12s",
      transform: open ? "rotate(180deg)" : "rotate(0deg)",
      color: "var(--text-muted)",
      flexShrink: 0,
    }) satisfies CSSProperties,
  entryBody: {
    padding: "0 16px 16px",
    display: "flex",
    flexDirection: "column",
    gap: 14,
    borderTop: "1px solid var(--border)",
  } satisfies CSSProperties,
  callerList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 6,
    marginTop: 10,
  } satisfies CSSProperties,
  callerRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
  } satisfies CSSProperties,
  callerName: {
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 12,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
    marginTop: 14,
  } satisfies CSSProperties,
  chipRow: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  } satisfies CSSProperties,
  truncatedNote: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: 8,
  } satisfies CSSProperties,
} as const;
