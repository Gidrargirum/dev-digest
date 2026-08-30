/** Constants for EvalDashboard. */

/** Colour coding shared by the agent stat blocks and the recent-runs bars —
 *  recall blue, precision green, citation amber (theme tokens, not literals). */
export const METRIC_COLOR = {
  recall: "var(--accent)",
  precision: "var(--ok)",
  citation: "var(--warn)",
} as const;

/** How many of an agent's most recent batches feed its recall sparkline. */
export const SPARKLINE_BATCH_COUNT = 8;
