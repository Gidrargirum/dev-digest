import type { CSSProperties } from "react";

/** Co-located styles for the skill detail view's EvalsTab. */
export const s = {
  wrap: { maxWidth: 760, display: "flex", flexDirection: "column", gap: 12 } satisfies CSSProperties,
  baselineNote: { fontSize: 12.5, color: "var(--text-secondary)" } satisfies CSSProperties,
} as const;
