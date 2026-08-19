/**
 * Smart Diff — deterministic, client-only classification and grouping.
 *
 * `SmartDiff` in `@devdigest/shared` (contracts/brief.ts) describes a FUTURE,
 * model-backed version of this feature: per-file `pseudocode_summary` and a
 * model-proposed `split_suggestion`. Neither can be filled in without an LLM
 * call, and a "deterministic pseudocode summary" is not a real summary — it's
 * either an empty string or a restatement of the file path, i.e. a fake. See
 * plans/smart-diff.md ("Що робимо з невикористаними полями контракту").
 *
 * This module deliberately does NOT type its view model as `SmartDiff` and
 * does NOT pretend to have `pseudocode_summary` / `split_suggestion` — those
 * two contract fields are filled in by nobody on the client, on purpose. Only
 * `SmartDiffRole` is reused from the shared contract, so the three
 * core/wiring/boilerplate categories can't drift between a possible future
 * server implementation and this deterministic one.
 */
import type { PrFile, ReviewRecord, Severity, SmartDiffRole } from "@devdigest/shared";
import { BOILERPLATE_PATTERNS, GROUP_ORDER, WIRING_PATTERNS } from "./constants";

const REGEXP_SPECIAL = /[.+^${}()|[\]\\]/g;

/**
 * Converts one glob pattern into an anchored RegExp:
 *  - a leading `**\/` matches zero or more path segments (so it also matches
 *    a root-level file, not just a nested one);
 *  - any other `**` matches any run of characters, including `/`;
 *  - `*` matches any run of characters within one path segment;
 *  - a pattern containing no `/` at all matches the basename at any depth.
 */
function globToRegExp(glob: string): RegExp {
  let pattern = "";
  let i = 0;
  while (i < glob.length) {
    if (glob.slice(i, i + 3) === "**/") {
      pattern += "(?:.*/)?";
      i += 3;
    } else if (glob.slice(i, i + 2) === "**") {
      pattern += ".*";
      i += 2;
    } else if (glob[i] === "*") {
      pattern += "[^/]*";
      i += 1;
    } else {
      pattern += glob[i]!.replace(REGEXP_SPECIAL, "\\$&");
      i += 1;
    }
  }
  const anchored = glob.includes("/") ? `^${pattern}$` : `(?:^|.*/)${pattern}$`;
  return new RegExp(anchored);
}

const compiledPatternCache = new Map<string, RegExp>();

function matchesAny(path: string, patterns: string[]): boolean {
  return patterns.some((glob) => {
    let re = compiledPatternCache.get(glob);
    if (!re) {
      re = globToRegExp(glob);
      compiledPatternCache.set(glob, re);
    }
    return re.test(path);
  });
}

/** Classify one file path into a Smart Diff role. Rules apply top-down,
 *  first match wins: boilerplate, then wiring, else core. */
export function classify(path: string): SmartDiffRole {
  if (matchesAny(path, BOILERPLATE_PATTERNS)) return "boilerplate";
  if (matchesAny(path, WIRING_PATTERNS)) return "wiring";
  return "core";
}

/** One file inside a Smart Diff group. */
export interface SmartDiffFileView {
  path: string;
  role: SmartDiffRole;
  additions: number;
  deletions: number;
}

/** One Smart Diff group (always present, even with zero files). */
export interface SmartDiffGroupView {
  role: SmartDiffRole;
  files: SmartDiffFileView[];
}

/** Group + classify every file. Always returns all three groups in
 *  `core → wiring → boilerplate` order — even for an empty `files` list —
 *  so a caller never has to special-case a missing group. Within a group,
 *  files sort by `additions + deletions` descending. */
export function groupFiles(files: PrFile[]): SmartDiffGroupView[] {
  const byRole = new Map<SmartDiffRole, SmartDiffFileView[]>(
    GROUP_ORDER.map((role) => [role, []]),
  );
  for (const file of files) {
    const role = classify(file.path);
    byRole.get(role)!.push({
      path: file.path,
      role,
      additions: file.additions ?? 0,
      deletions: file.deletions ?? 0,
    });
  }
  return GROUP_ORDER.map((role) => ({
    role,
    files: [...byRole.get(role)!].sort(
      (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
    ),
  }));
}

/** One finding, reduced to what Smart Diff needs to mark it on a diff line. */
export interface FindingMark {
  id: string;
  runId: string | null;
  startLine: number;
  endLine: number;
  severity: Severity;
  title: string;
}

/** Index every finding across every review by the file path it's on. */
export function findingsByPath(reviews: ReviewRecord[]): Map<string, FindingMark[]> {
  const map = new Map<string, FindingMark[]>();
  for (const review of reviews) {
    for (const finding of review.findings) {
      const mark: FindingMark = {
        id: finding.id,
        runId: review.run_id,
        startLine: finding.start_line,
        endLine: finding.end_line,
        severity: finding.severity,
        title: finding.title,
      };
      const list = map.get(finding.file);
      if (list) list.push(mark);
      else map.set(finding.file, [mark]);
    }
  }
  return map;
}

/** Whether a file's total changed lines exceed `threshold`. The threshold
 *  itself is a caller-supplied product decision (see LARGE_FILE_LINES in
 *  `@/components/diff-viewer/constants`), not hardcoded here. */
export function isLargeFile(
  file: Pick<PrFile, "additions" | "deletions">,
  threshold: number,
): boolean {
  return (file.additions ?? 0) + (file.deletions ?? 0) > threshold;
}

/** Total number of files touched by this diff (all groups combined). */
export function affectedFilesCount(files: PrFile[]): number {
  return files.length;
}
