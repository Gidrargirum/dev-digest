import type { CSSProperties } from "react";
import { INDENT_PER_LEVEL } from "./constants";

/** Co-located styles for ContextTree. */
export const s = {
  tree: {
    border: "1px solid var(--border)",
    borderRadius: 8,
    overflow: "auto",
    maxHeight: 520,
    padding: 4,
  } satisfies CSSProperties,
  row: (selected: boolean, depth: number) =>
    ({
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "5px 8px",
      paddingLeft: 8 + depth * INDENT_PER_LEVEL,
      borderRadius: 6,
      fontSize: 13,
      cursor: "pointer",
      background: selected ? "var(--bg-hover)" : "transparent",
      color: selected ? "var(--text-primary)" : "var(--text-secondary)",
      outline: "none",
      whiteSpace: "nowrap",
    }) satisfies CSSProperties,
  twisty: { width: 14, flexShrink: 0, display: "inline-grid", placeItems: "center" } satisfies CSSProperties,
  name: { overflow: "hidden", textOverflow: "ellipsis" } satisfies CSSProperties,
  empty: { fontSize: 12, color: "var(--text-muted)", padding: "8px 10px" } satisfies CSSProperties,
} as const;
