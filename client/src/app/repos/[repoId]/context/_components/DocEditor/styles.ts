import type { CSSProperties } from "react";

/** Co-located styles for DocEditor. */
export const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 10 } satisfies CSSProperties,
  label: {
    fontSize: 12,
    fontWeight: 600,
    color: "var(--text-secondary)",
  } satisfies CSSProperties,
  footer: { display: "flex", alignItems: "center", gap: 12 } satisfies CSSProperties,
  status: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)" } satisfies CSSProperties,
} as const;
