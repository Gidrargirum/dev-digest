/** The three deterministic metrics every batch reports (AC-18) — shared
 *  iteration order for the metric cards and the per-case marginal display
 *  (AC-57), so the two never drift out of sync. */
export const METRIC_KEYS = ["recall", "precision", "citation_accuracy"] as const;
export type MetricKey = (typeof METRIC_KEYS)[number];
