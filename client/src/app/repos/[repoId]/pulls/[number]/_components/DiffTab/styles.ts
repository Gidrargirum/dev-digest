import type { CSSProperties } from "react";

export const s = {
  headerRight: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  } satisfies CSSProperties,
  modeSwitch: {
    display: "flex",
    gap: 6,
  } satisfies CSSProperties,
} as const;
