import type { CSSProperties } from "react";

/** Co-located styles for CreateNodeModal. */
export const s = {
  body: { padding: "18px 24px" } satisfies CSSProperties,
  label: {
    display: "block",
    fontSize: 13,
    fontWeight: 600,
    color: "var(--text-secondary)",
    marginBottom: 8,
  } satisfies CSSProperties,
  field: { marginBottom: 18 } satisfies CSSProperties,
  hint: { fontSize: 12, color: "var(--text-muted)", marginTop: 8, lineHeight: 1.45 } satisfies CSSProperties,
  error: { fontSize: 12, color: "var(--crit)", marginTop: 8 } satisfies CSSProperties,
  preview: { fontSize: 12, color: "var(--text-muted)", marginTop: 8, wordBreak: "break-all" } satisfies CSSProperties,
} as const;
