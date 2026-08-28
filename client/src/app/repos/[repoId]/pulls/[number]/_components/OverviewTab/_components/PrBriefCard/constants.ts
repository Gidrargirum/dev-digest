import type { IconName } from "@devdigest/ui";
import type { Verdict } from "@devdigest/shared";

/** Accent-rail colour per model-assessed merge risk (AC-18). Total lookup over
 *  the wire enum — an unknown value falls back to `medium` rather than
 *  crashing the card. */
export const RISK_RAIL: Record<string, { rail: string; label: string }> = {
  low: { rail: "var(--ok)", label: "var(--ok)" },
  medium: { rail: "var(--warn)", label: "var(--warn)" },
  high: { rail: "var(--crit)", label: "var(--crit)" },
};

/** How long the metrics take to recompute is irrelevant to the card — but the
 *  fallback ordering (newest done run) needs a stable comparator; see helpers. */
export const DONE_STATUS = "done";

export const VERDICT_META: Record<
  Verdict,
  { color: string; background: string; icon: IconName }
> = {
  request_changes: {
    color: "var(--crit)",
    background: "var(--crit-bg)",
    icon: "XCircle",
  },
  approve: {
    color: "var(--ok)",
    background: "var(--ok-bg)",
    icon: "CheckCircle",
  },
  comment: {
    color: "var(--info)",
    background: "var(--info-bg)",
    icon: "MessageSquare",
  },
};
