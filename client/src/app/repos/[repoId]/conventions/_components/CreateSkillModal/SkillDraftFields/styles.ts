import type { CSSProperties } from "react";

/** Co-located styles for SkillDraftFields — one draft's editable section. */
export const s = {
  section: {
    border: "1px solid var(--border)",
    borderRadius: 10,
    padding: "16px 16px 4px",
    marginBottom: 20,
  } satisfies CSSProperties,
  heading: {
    fontSize: 13,
    fontWeight: 700,
    color: "var(--text-secondary)",
    textTransform: "uppercase",
    letterSpacing: 0.4,
    marginBottom: 14,
  } satisfies CSSProperties,
  enabledLabel: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  enabledSwitch: { display: "inline-flex" } satisfies CSSProperties,
  tokenEstimate: {
    fontSize: 12,
    color: "var(--text-muted)",
    marginTop: -12,
    marginBottom: 20,
  } satisfies CSSProperties,
} as const;
