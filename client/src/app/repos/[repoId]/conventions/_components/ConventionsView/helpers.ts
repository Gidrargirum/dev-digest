import type { ConventionCandidate, ConventionScan, ConventionScanStatus } from "@devdigest/shared";
import { ACTIVE_SCAN_STATUSES, DAY_MS, HOUR_MS, MINUTE_MS, STATUS_ORDER } from "./constants";

/**
 * Triage order: pending first, then accepted, then rejected; within a group by
 * MEASURED confidence descending. Pure and total — a stable copy, never in place.
 */
export function sortCandidates(candidates: ConventionCandidate[]): ConventionCandidate[] {
  return candidates
    .slice()
    .sort(
      (a, b) =>
        STATUS_ORDER[a.status] - STATUS_ORDER[b.status] || b.confidence - a.confidence,
    );
}

/** True while a scan is still queued or running. */
export function isScanActive(scan: ConventionScan | null | undefined): boolean {
  return !!scan && (ACTIVE_SCAN_STATUSES as readonly ConventionScanStatus[]).includes(scan.status);
}

export function acceptedIds(candidates: ConventionCandidate[]): string[] {
  return candidates.filter((c) => c.status === "accepted").map((c) => c.id);
}

/** Coarse relative-time bucket. Returns the key + count for next-intl to format
 *  — the wording itself stays in messages/en/conventions.json. */
export function relativeBucket(
  iso: string | null | undefined,
  now = Date.now(),
): { key: "justNow" | "minutes" | "hours" | "days" | "unknown"; count: number } {
  const ts = iso ? Date.parse(iso) : NaN;
  if (!Number.isFinite(ts)) return { key: "unknown", count: 0 };
  const delta = Math.max(0, now - ts);
  if (delta < MINUTE_MS) return { key: "justNow", count: 0 };
  if (delta < HOUR_MS) return { key: "minutes", count: Math.floor(delta / MINUTE_MS) };
  if (delta < DAY_MS) return { key: "hours", count: Math.floor(delta / HOUR_MS) };
  return { key: "days", count: Math.floor(delta / DAY_MS) };
}
