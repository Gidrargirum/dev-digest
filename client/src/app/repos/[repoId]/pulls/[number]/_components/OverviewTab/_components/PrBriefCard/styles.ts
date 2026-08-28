import type { CSSProperties } from "react";

export const s = {
  card: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    background: "var(--bg-elevated)",
    padding: 18,
    display: "flex",
    flexDirection: "column",
    gap: 16,
  } satisfies CSSProperties,
  /** what/why sit to the right of a coloured vertical rail (AC-18). */
  railRow: {
    display: "flex",
    gap: 14,
    alignItems: "stretch",
  } satisfies CSSProperties,
  rail: (color: string) =>
    ({
      width: 4,
      borderRadius: 2,
      background: color,
      flexShrink: 0,
    }) satisfies CSSProperties,
  railBody: {
    display: "flex",
    flexDirection: "column",
    gap: 12,
    minWidth: 0,
    flex: 1,
  } satisfies CSSProperties,
  fieldLabel: (color: string) =>
    ({
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.05em",
      textTransform: "uppercase",
      color,
      marginBottom: 4,
    }) satisfies CSSProperties,
  fieldText: {
    fontSize: 14,
    lineHeight: 1.55,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  riskLevel: (color: string) =>
    ({
      fontSize: 12,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color,
    }) satisfies CSSProperties,
  metricsRow: {
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 22,
    borderTop: "1px solid var(--border)",
    paddingTop: 14,
  } satisfies CSSProperties,
  scoreCell: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  verdictCell: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  verdictIcon: (background: string, color: string) =>
    ({
      width: 40,
      height: 40,
      borderRadius: 9,
      display: "grid",
      placeItems: "center",
      background,
      color,
      flexShrink: 0,
    }) satisfies CSSProperties,
  /** Empty ring stand-in for a null score (AC-20) — same footprint as
   *  CircularScore(44) so the row doesn't jump. */
  emptyRing: {
    width: 44,
    height: 44,
    borderRadius: "50%",
    border: "4px solid var(--bg-hover)",
    display: "grid",
    placeItems: "center",
    fontSize: 11,
    fontWeight: 700,
    color: "var(--text-muted)",
    flexShrink: 0,
  } satisfies CSSProperties,
  metric: {
    display: "flex",
    flexDirection: "column",
    gap: 2,
  } satisfies CSSProperties,
  metricLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.05em",
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  metricValue: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  footer: {
    display: "flex",
    justifyContent: "flex-end",
  } satisfies CSSProperties,
  regenError: {
    display: "flex",
    alignItems: "center",
    gap: 7,
    color: "var(--crit)",
    fontSize: 13,
  } satisfies CSSProperties,
  nudge: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-start",
    gap: 10,
  } satisfies CSSProperties,
  nudgeTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "var(--text-primary)",
  } satisfies CSSProperties,
  nudgeBody: {
    fontSize: 13,
    lineHeight: 1.5,
    color: "var(--text-secondary)",
    margin: 0,
  } satisfies CSSProperties,
  loading: {
    display: "flex",
    flexDirection: "column",
    gap: 10,
  } satisfies CSSProperties,
} as const;
