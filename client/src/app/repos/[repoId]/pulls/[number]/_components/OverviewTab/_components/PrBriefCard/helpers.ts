import type { PrBriefRecord, ReviewRecord, RunSummary, Verdict } from "@devdigest/shared";
import { DONE_STATUS } from "./constants";

export interface BriefMetrics {
  score: number | null;
  verdict: Verdict | null;
  costUsd: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  durationMs: number | null;
  findingsCount: number | null;
  blockers: number | null;
  /** No run could be resolved at all — render every metric in its unknown
   *  state (score `N/A`, the rest dashed), card still shows what/why/risk
   *  (AC-19 fallback). */
  unknown: boolean;
}

const EMPTY: BriefMetrics = {
  score: null,
  verdict: null,
  costUsd: null,
  tokensIn: null,
  tokensOut: null,
  durationMs: null,
  findingsCount: null,
  blockers: null,
  unknown: true,
};

function byRanAtDesc(a: RunSummary, b: RunSummary): number {
  return (b.ran_at ?? "").localeCompare(a.ran_at ?? "");
}

/**
 * Review metrics for the Brief card (AC-19). Always sourced from the run
 * history / persisted review, never from `Brief` itself.
 *
 * - Primary: the run whose `run_id` matches `brief.run_id`.
 * - Fallback (`brief.run_id` null, e.g. after a forced regeneration, or the run
 *   is gone): the newest `status: 'done'` run.
 * - Neither: unknown state.
 */
export function resolveBriefMetrics(
  brief: PrBriefRecord,
  prRuns: RunSummary[],
  reviews: ReviewRecord[],
): BriefMetrics {
  const matched = brief.run_id
    ? prRuns.find((r) => r.run_id === brief.run_id && r.status === DONE_STATUS)
    : undefined;
  const run =
    matched ?? [...prRuns].filter((r) => r.status === DONE_STATUS).sort(byRanAtDesc)[0];
  if (!run) return EMPTY;

  const review = reviews.find((r) => r.run_id === run.run_id);
  return {
    score: run.score ?? review?.score ?? null,
    verdict: review?.verdict ?? null,
    costUsd: run.cost_usd,
    tokensIn: run.tokens_in,
    tokensOut: run.tokens_out,
    durationMs: run.duration_ms,
    findingsCount: run.findings_count,
    blockers: run.blockers,
    unknown: false,
  };
}

export function formatTokens(tin: number | null, tout: number | null): string | null {
  if (tin == null && tout == null) return null;
  return `${tin?.toLocaleString() ?? "—"}→${tout?.toLocaleString() ?? "—"}`;
}

export function formatDuration(ms: number | null): string | null {
  return ms == null ? null : `${(ms / 1000).toFixed(1)}s`;
}
