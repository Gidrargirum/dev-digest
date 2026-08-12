import type { FindingRecord, FindingsBreakdown } from "@devdigest/shared";
import { EMPTY_BREAKDOWN } from "./constants";

/** Severity → sort rank, worst first. Unknown severities sort last. */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

/**
 * Per-severity counts of a finding list, dismissed findings excluded — the
 * client-side twin of the server aggregation behind `PrMeta.findings_breakdown`.
 * Used on the Agent runs timeline, where the findings are already loaded.
 */
export function countBySeverity(findings: FindingRecord[]): FindingsBreakdown {
  const counts = { ...EMPTY_BREAKDOWN };
  for (const f of findings) {
    if (f.dismissed_at) continue;
    if (f.severity === "CRITICAL") counts.critical += 1;
    else if (f.severity === "WARNING") counts.warning += 1;
    else if (f.severity === "SUGGESTION") counts.suggestion += 1;
  }
  return counts;
}

/** Total across all severities. */
export function totalFindings(counts: FindingsBreakdown | null | undefined): number {
  if (!counts) return 0;
  return counts.critical + counts.warning + counts.suggestion;
}

/** Findings worth showing, worst severity first (dismissed ones dropped). */
export function sortBySeverity(findings: FindingRecord[]): FindingRecord[] {
  return findings
    .filter((f) => !f.dismissed_at)
    .slice()
    .sort((a, b) => (SEVERITY_RANK[a.severity] ?? 99) - (SEVERITY_RANK[b.severity] ?? 99));
}
