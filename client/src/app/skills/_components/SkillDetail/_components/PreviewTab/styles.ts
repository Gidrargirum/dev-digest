import type { CSSProperties } from "react";

/** Co-located styles for PreviewTab. */
export const s = {
  wrap: { maxWidth: 760 } satisfies CSSProperties,
  notice: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 13,
    color: "var(--warn)",
    background: "var(--warn-bg)",
    border: "1px solid var(--warn)",
    borderRadius: 7,
    padding: "10px 12px",
    marginBottom: 16,
  } satisfies CSSProperties,
  card: {
    background: "var(--bg-elevated)",
    padding: 24,
    borderRadius: 8,
    border: "1px solid var(--border)",
  } satisfies CSSProperties,
} as const;
