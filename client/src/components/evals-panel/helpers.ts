import type { EvalCase, EvalRunRecord } from "@devdigest/shared";
import { readSkillActualOutput, formatMarginal } from "@/components/eval-case-editor";
import { METRIC_KEYS } from "./constants";

/** "expected N finding(s), got M · recall X%" — from the case's most recent
 *  run (the latest batch's per-case row), or `undefined` if never run. */
export function caseRunSummary(
  evalCase: EvalCase,
  latestRuns: Map<string, EvalRunRecord>,
): { expected: number; got: number; recallPct: number | null; pass: boolean | null } | null {
  const run = latestRuns.get(evalCase.id);
  if (!run) return null;
  const expected = evalCase.expected_output.length;
  const got = run.matched.length + run.unmatched.length;
  const recallPct = run.recall == null ? null : Math.round(run.recall * 100);
  return { expected, got, recallPct, pass: run.pass };
}

/** Map case_id → its row in a batch's per-case detail. */
export function runsByCase(runs: EvalRunRecord[]): Map<string, EvalRunRecord> {
  return new Map(runs.map((r) => [r.case_id, r]));
}

/**
 * Amendment A (AC-57) — "recall +0.25 · precision −0.15 · citation 0" next
 * to a skill-owned case's row, sign always in the text. `null` when the case
 * has never run, or its run isn't skill-shaped (agent-owned run rows never
 * carry a `marginal` member — `readSkillActualOutput` returns `null` for
 * those, which is exactly the "don't render this" signal here).
 */
export function caseMarginalText(evalCase: EvalCase, latestRuns: Map<string, EvalRunRecord>): string | null {
  if (evalCase.owner_kind !== "skill") return null;
  const run = latestRuns.get(evalCase.id);
  if (!run) return null;
  const skillActual = readSkillActualOutput(run.actual_output);
  if (!skillActual) return null;
  return METRIC_KEYS.map((key) => `${key} ${formatMarginal(skillActual.marginal[key])}`).join(" · ");
}
