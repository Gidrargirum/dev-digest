import type { FindingsBreakdown } from "@devdigest/shared";
import type { Severity } from "@devdigest/ui";

/**
 * Display order of the severity counters — worst first, matching the order
 * findings are sorted in on the PR detail page.
 */
export const BREAKDOWN_ORDER: { key: keyof FindingsBreakdown; severity: Severity }[] = [
  { key: "critical", severity: "CRITICAL" },
  { key: "warning", severity: "WARNING" },
  { key: "suggestion", severity: "SUGGESTION" },
];

/** Empty counts — the shape the UI falls back to, rendered as an em dash. */
export const EMPTY_BREAKDOWN: FindingsBreakdown = { critical: 0, warning: 0, suggestion: 0 };
