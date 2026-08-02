import type { CSSProperties } from "react";

/** Co-located styles for the shared HoverCard. */
export const s = {
  trigger: {
    display: "inline-flex",
    alignItems: "center",
    background: "none",
    border: "none",
    padding: 0,
    margin: 0,
    font: "inherit",
    color: "inherit",
    cursor: "default",
    textAlign: "left",
  } satisfies CSSProperties,
  panel: (
    pos: { top: number; left: number; above: boolean },
    width: number,
  ): CSSProperties => ({
    position: "fixed",
    top: pos.top,
    left: pos.left,
    width,
    maxWidth: "calc(100vw - 24px)",
    transform: pos.above ? "translateY(-100%)" : undefined,
    zIndex: 60,
    border: "1px solid var(--border)",
    borderRadius: 10,
    background: "var(--bg-elevated)",
    boxShadow: "0 12px 32px rgba(0,0,0,.32)",
    padding: 12,
  }),
} as const;
