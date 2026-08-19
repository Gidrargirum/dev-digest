import type { FindingActionKind } from "@devdigest/shared";
import type { Severity } from "@devdigest/ui";

/** Severities offered as filter chips, worst first — the same order the list
 *  is sorted in, so the chips read as a legend for what is below them. */
export const FILTERABLE_SEVERITIES: Severity[] = ["CRITICAL", "WARNING", "SUGGESTION"];

/** Sort weight per severity (lower = shown first). */
export const SEVERITY_ORDER: Record<string, number> = {
  CRITICAL: 0,
  WARNING: 1,
  SUGGESTION: 2,
  INFO: 3,
};

/** Confidence below this is hidden when "hide low confidence" is on. */
export const LOW_CONFIDENCE_THRESHOLD = 0.65;

/** Keyboard shortcut → finding action. */
export const KEY_TO_ACTION: Record<string, FindingActionKind> = {
  a: "accept",
  d: "dismiss",
};
