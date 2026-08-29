import type { CSSProperties } from "react";

/** Co-located styles for DocPreview. */
export const s = {
  topBar: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 12,
    marginBottom: 6,
  } satisfies CSSProperties,
  path: {
    fontSize: 12,
    color: "var(--text-muted)",
    wordBreak: "break-all",
  } satisfies CSSProperties,
  derivedNote: {
    fontSize: 11,
    color: "var(--text-muted)",
    fontStyle: "italic",
    marginBottom: 10,
  } satisfies CSSProperties,
  tabBody: { marginTop: 14 } satisfies CSSProperties,
  placeholder: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
