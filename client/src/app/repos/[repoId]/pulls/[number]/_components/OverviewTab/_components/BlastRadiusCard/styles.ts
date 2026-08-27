import type { CSSProperties } from "react";

export const s = {
  /** Card shell, matching IntentCard's card (`OverviewTab/_components/IntentCard/styles.ts`)
   *  so the two Overview cards read as one system. */
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
  } satisfies CSSProperties,
  // Left side is the counts group, right side is the Tree/Graph toggle —
  // `justify-content: space-between` keeps them pinned to opposite edges. Do
  // not center this row.
  countsRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  counts: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
  } satisfies CSSProperties,
  partialNote: {
    display: "flex",
    alignItems: "center",
    gap: 8,
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
    background: "var(--bg-base)",
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
  // The Tree/Graph switch — right side of `countsRow`, see that comment.
  viewToggle: {
    display: "flex",
    gap: 6,
  } satisfies CSSProperties,
  graphNote: {
    fontSize: 12,
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  // Same approach as IntentCard's `riskSection` (`OverviewTab/_components/IntentCard/styles.ts`):
  // a bordered, padded block separating this card's second section from the first.
  priorPrsSection: {
    borderTop: "1px solid var(--border)",
    paddingTop: 14,
  } satisfies CSSProperties,
  priorPrsToggle: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    cursor: "pointer",
  } satisfies CSSProperties,
  priorPrsToggleLabel: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  priorPrsToggleMeta: {
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  priorPrsList: {
    listStyle: "none",
    margin: 0,
    padding: 0,
    display: "flex",
    flexDirection: "column",
    gap: 8,
    marginTop: 10,
  } satisfies CSSProperties,
  priorPrRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    fontSize: 13,
  } satisfies CSSProperties,
  priorPrLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    minWidth: 0,
    overflow: "hidden",
  } satisfies CSSProperties,
  priorPrTitle: {
    color: "var(--text-secondary)",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  } satisfies CSSProperties,
  priorPrMeta: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    color: "var(--text-muted)",
    fontSize: 12,
  } satisfies CSSProperties,
} as const;
