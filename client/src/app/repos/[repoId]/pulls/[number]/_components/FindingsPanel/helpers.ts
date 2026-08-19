import type { FindingRecord } from "@devdigest/shared";
import type { Severity } from "@devdigest/ui";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings, optionally keep a single
 *  severity, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * How many findings each severity has.
 *
 * Counted over the confidence-filtered set, not the raw one: a chip that
 * promises "2 Warning" while "hide low confidence" is on must open two cards,
 * not one — a count that disagrees with the list it filters is worse than no
 * count at all.
 */
export function severityCounts(
  findings: FindingRecord[],
  hideLow: boolean,
): Record<string, number> {
  const base = hideLow
    ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD)
    : findings;
  const counts: Record<string, number> = {};
  for (const f of base) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}
