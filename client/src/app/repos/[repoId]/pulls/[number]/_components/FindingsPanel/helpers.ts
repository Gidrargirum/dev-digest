import type { FindingRecord, PrFile } from "@devdigest/shared";
import type { Severity } from "@devdigest/ui";
import type { EvalCaseSeed } from "@/components/eval-case-editor";
import { LOW_CONFIDENCE_THRESHOLD, SEVERITY_ORDER } from "./constants";

/** Optionally drop low-confidence findings, optionally keep a single
 *  severity, and sort by severity. */
export function visibleFindings(
  findings: FindingRecord[],
  hideLow: boolean,
  severity: Severity | null = null,
): FindingRecord[] {
  let shown = findings;
  if (hideLow) shown = shown.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD);
  if (severity) shown = shown.filter((f) => f.severity === severity);
  return [...shown].sort(
    (a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9),
  );
}

/**
 * How many findings each severity has.
 *
 * Counted over the confidence-filtered set, not the raw one: a chip that
 * promises "2 Warning" while "hide low confidence" is on must open two cards,
 * not one — a count that disagrees with the list it filters is worse than no
 * count at all.
 */
export function severityCounts(
  findings: FindingRecord[],
  hideLow: boolean,
): Record<string, number> {
  const base = hideLow
    ? findings.filter((f) => f.confidence >= LOW_CONFIDENCE_THRESHOLD)
    : findings;
  const counts: Record<string, number> = {};
  for (const f of base) counts[f.severity] = (counts[f.severity] ?? 0) + 1;
  return counts;
}

/**
 * Reconstruct a unified diff from the PR's per-file patches (`PrFile.patch`
 * is just the `@@ ...@@` hunk body, GitHub-API style — no `diff --git`/
 * `---`/`+++` headers) so it round-trips through the server's
 * `parseUnifiedDiff` (`diff --git a/b/`, `--- a/`, `+++ b/`, then the hunk).
 * Files with no patch (binary, renamed-only) are skipped.
 */
export function buildUnifiedDiff(files: PrFile[]): string {
  return files
    .filter((f) => f.patch)
    .map((f) => `diff --git a/${f.path} b/${f.path}\n--- a/${f.path}\n+++ b/${f.path}\n${f.patch}`)
    .join("\n");
}

/**
 * Build the eval-case seed from a triaged finding (AC-2/AC-3): `must_find`
 * with one expectation carrying the finding's location/severity/category/title
 * when accepted, `must_not_flag` with an empty expectation set when dismissed.
 * Caller (FindingsPanel) only calls this once `accepted_at`/`dismissed_at` is
 * set — see the disabled state on FindingCard's action (AC-4). Also carries
 * the originating PR's diff + title/body so the editor doesn't open with an
 * empty Diff tab (AC-5's "frozen copy" has to come from somewhere).
 */
export function buildEvalSeed(
  f: FindingRecord,
  pr: { title: string; body?: string | null; files: PrFile[] },
): EvalCaseSeed | null {
  const input_diff = buildUnifiedDiff(pr.files);
  const input_meta = { title: pr.title, body: pr.body ?? "" };
  // "From finding: <title>" — matches the reference demo's auto-generated
  // case naming (TZ_Evals.md §2), not just the bare finding title.
  const name = `From finding: ${f.title}`;
  if (f.accepted_at) {
    return {
      expectation_type: "must_find",
      expected_output: [
        {
          file: f.file,
          start_line: f.start_line,
          end_line: f.end_line,
          severity: f.severity,
          category: f.category,
          title: f.title,
        },
      ],
      name,
      input_diff,
      input_meta,
    };
  }
  if (f.dismissed_at) {
    return { expectation_type: "must_not_flag", expected_output: [], name, input_diff, input_meta };
  }
  return null;
}
