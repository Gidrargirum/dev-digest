import type { CSSProperties } from "react";

/** Co-located styles for CoverageRing. */
export const s = {
  wrap: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  meta: { display: "flex", flexDirection: "column", gap: 2 } satisfies CSSProperties,
  label: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: "var(--text-muted)",
  } satisfies CSSProperties,
  caption: { fontSize: 12, color: "var(--text-secondary)" } satisfies CSSProperties,
  noAgents: { fontSize: 12, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
