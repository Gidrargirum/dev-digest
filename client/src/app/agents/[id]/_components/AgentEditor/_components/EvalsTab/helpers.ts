import type { EvalCase, EvalRunRecord } from "@devdigest/shared";

/** "expected N finding(s), got M · recall X%" — from the case's most recent
 *  run (the latest batch's per-case row), or `undefined` if never run. */
export function caseRunSummary(
  evalCase: EvalCase,
  latestRuns: Map<string, EvalRunRecord>,
): { expected: number; got: number; recallPct: number | null } | null {
  const run = latestRuns.get(evalCase.id);
  if (!run) return null;
  const expected = evalCase.expected_output.length;
  const got = run.matched.length + run.unmatched.length;
  const recallPct = run.recall == null ? null : Math.round(run.recall * 100);
  return { expected, got, recallPct };
}

/** Map case_id → its row in a batch's per-case detail. */
export function runsByCase(runs: EvalRunRecord[]): Map<string, EvalRunRecord> {
  return new Map(runs.map((r) => [r.case_id, r]));
}
