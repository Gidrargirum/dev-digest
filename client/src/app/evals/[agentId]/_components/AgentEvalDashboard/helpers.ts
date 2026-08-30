import type { EvalBatch } from "@devdigest/shared";
import type { ChartSeries } from "@devdigest/ui";

/** Batches chronological (oldest → newest) — the API returns newest-first. */
export function chronological(batches: EvalBatch[]): EvalBatch[] {
  return [...batches].reverse();
}

/** One line per metric (AC-30), only meaningful with ≥ 2 batches. `null`
 *  values (AC-22) render as 0 on the chart — there is no gap-rendering
 *  primitive in the vendored LineChart, so a null point reads as "no signal"
 *  rather than a plotted zero being mistaken for a real score. */
export function metricSeries(batches: EvalBatch[]): ChartSeries[] {
  const ordered = chronological(batches);
  return [
    { name: "Recall", color: "var(--accent)", data: ordered.map((b) => b.recall ?? 0) },
    { name: "Precision", color: "var(--ok)", data: ordered.map((b) => b.precision ?? 0) },
    { name: "Citation", color: "var(--warn)", data: ordered.map((b) => b.citation_accuracy ?? 0) },
  ];
}

/** Precision-regression banner (AC-33): the latest batch's precision fell
 *  relative to the previous batch of the same agent. */
export function precisionRegression(batches: EvalBatch[]): number | null {
  if (batches.length < 2) return null;
  const [latest, previous] = batches; // newest-first
  if (latest?.precision == null || previous?.precision == null) return null;
  const delta = latest.precision - previous.precision;
  return delta < 0 ? delta : null;
}

export function tracesPassedPct(batch: EvalBatch | null | undefined): number | null {
  if (!batch || batch.cases_total === 0) return null;
  return Math.round((batch.cases_passed / batch.cases_total) * 100);
}
