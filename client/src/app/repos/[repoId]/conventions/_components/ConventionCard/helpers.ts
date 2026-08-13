import type { ConventionCandidate } from "@devdigest/shared";
import { CONFIDENCE_THRESHOLDS } from "./constants";

/** Bar colour for a 0..1 confidence. Decorative only — see constants.ts. */
export function confidenceColor(confidence: number): string {
  const hit = CONFIDENCE_THRESHOLDS.find((t) => confidence >= t.min);
  return hit?.color ?? "var(--text-muted)";
}

/** 0..1 → whole percent, clamped. */
export function confidencePct(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/** `path:startLine-endLine`, collapsing a single-line range to `path:line`. */
export function evidenceLocation(c: ConventionCandidate): string {
  const { evidence_path: path, evidence_line: start, evidence_end_line: end } = c;
  return end > start ? `${path}:${start}-${end}` : `${path}:${start}`;
}
