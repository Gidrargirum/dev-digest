import type { CSSProperties } from "react";

/** Co-located styles for the findings severity counters. */
export const s = {
  row: {
    display: "inline-flex",
    alignItems: "center",
    gap: 10,
    minWidth: 0,
  } satisfies CSSProperties,
  counter: (color: string): CSSProperties => ({
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: 12.5,
    fontWeight: 600,
    color,
    // Dotted underline signals "there is more behind a hover" without adding
    // a second colour meaning (WCAG: colour is never the only cue — the
    // severity icon carries the meaning).
    textDecoration: "underline",
    textDecorationStyle: "dotted",
    textDecorationColor: color,
    textUnderlineOffset: 4,
  }),
  empty: { color: "var(--text-muted)" } satisfies CSSProperties,
} as const;
