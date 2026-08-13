/** Confidence colour thresholds. Colour is decoration only — the numeric
 *  percentage is always rendered as text next to the bar (WCAG AA: colour is
 *  never the sole carrier of meaning). */
export const CONFIDENCE_THRESHOLDS = [
  { min: 0.85, color: "var(--ok)" },
  { min: 0.6, color: "var(--warn)" },
  { min: 0, color: "var(--crit)" },
] as const;

/** Rows the inline rule editor opens with. */
export const RULE_EDITOR_ROWS = 3;

/** How long the copy button stays in its "Copied" state. */
export const COPIED_RESET_MS = 1200;
