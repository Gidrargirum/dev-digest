import type { ConventionStatus } from "@devdigest/shared";

/** Triage order: what still needs a decision floats to the top. */
export const STATUS_ORDER: Record<ConventionStatus, number> = {
  pending: 0,
  accepted: 1,
  rejected: 2,
};

/** Scan statuses that keep the Re-scan button busy. */
export const ACTIVE_SCAN_STATUSES = ["queued", "running"] as const;

export const SKELETON_CARDS = 3;
export const SKELETON_CARD_HEIGHT = 150;

/** How often the "last scan {when}" label re-reads the clock. */
export const NOW_TICK_MS = 30_000;

export const MINUTE_MS = 60_000;
export const HOUR_MS = 3_600_000;
export const DAY_MS = 86_400_000;
