/**
 * Pure helpers for the Why + Risk Brief service — side-effect free: they
 * operate only on their arguments (no DB, no network, no `Date.now()`, no
 * randomness; time and models arrive as arguments). Kept deterministic so the
 * deferred unit lane can exercise them without a single mock.
 */
import { createHash } from 'node:crypto';
import type { BriefRisk, BriefReviewFocus, RiskLevel } from '@devdigest/shared';
import { MAX_INPUT_FILES, MAX_RISKS, MAX_REVIEW_FOCUS } from './constants.js';

// ---------------------------------------------------------------- state key

export interface StateKeyFile {
  path: string;
  additions: number;
  deletions: number;
}

/**
 * PR state key (AC-4): sha256 over `head_sha` plus the path-sorted list of
 * `path:additions:deletions`. `head_sha` alone is not enough — `GET /pulls/:id`
 * (`modules/pulls/routes.ts`) refreshes `body`/`additions`/`deletions`/
 * `files_count` from GitHub WITHOUT touching `head_sha`, so a changed diff
 * would otherwise keep a stale brief.
 */
export function derivePrStateKey(headSha: string, files: StateKeyFile[]): string {
  const digest = [...files]
    .map((f) => `${f.path}:${f.additions}:${f.deletions}`)
    .sort()
    .join('\n');
  return createHash('sha256').update(`${headSha}\n${digest}`).digest('hex');
}

// ---------------------------------------------------------------- changed lines

/**
 * Parse `@@ -a,b +c,d @@` hunk headers and return the NEW (right-side) line
 * numbers covered by added (`+`) AND context (` `) lines — a review-focus
 * anchor may legitimately sit on an unchanged line inside a rendered hunk.
 * Deletion (`-`) lines and hunk headers advance nothing on the new side and
 * contribute no number. `null`/empty patch → `[]`.
 */
export function changedLinesFromPatch(patch: string | null): number[] {
  if (!patch) return [];
  const out: number[] = [];
  let newLine = 0;
  let inHunk = false;
  for (const line of patch.split('\n')) {
    const header = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,\d+)? @@/.exec(line);
    if (header) {
      newLine = Number(header[1]);
      inHunk = true;
      continue;
    }
    if (!inHunk) continue;
    if (line.startsWith('\\')) continue; // "\ No newline at end of file"
    if (line.startsWith('-')) continue; // deletion — no new-side line
    // added (`+`) or context (` `) — carries a new-side number. A context line
    // in a unified diff always has a leading space, so a bare empty string
    // (e.g. a trailing split artifact) is correctly ignored.
    if (line.startsWith('+') || line.startsWith(' ')) {
      out.push(newLine);
      newLine += 1;
    }
  }
  return out;
}

// ---------------------------------------------------------------- input selection

export interface InputFile {
  path: string;
  additions: number;
  deletions: number;
  patch: string | null;
}

export interface SelectedInput {
  described: InputFile[];
  omittedCount: number;
  omittedChangedLines: number;
}

/**
 * Describe at most `max` files individually, chosen by `additions + deletions`
 * descending; collapse the rest into an aggregate (AC-36).
 */
export function selectInputFiles(files: InputFile[], max = MAX_INPUT_FILES): SelectedInput {
  const sorted = [...files].sort(
    (a, b) => b.additions + b.deletions - (a.additions + a.deletions),
  );
  const described = sorted.slice(0, max);
  const omitted = sorted.slice(max);
  return {
    described,
    omittedCount: omitted.length,
    omittedChangedLines: omitted.reduce((n, f) => n + f.additions + f.deletions, 0),
  };
}

// ---------------------------------------------------------------- grounding

export interface GroundingSets {
  pathSet: Set<string>;
  /** old path → new path for renames (AC-12a). No data source in this pass —
   *  stays empty; the structure exists for when `pr_files` carries the previous
   *  filename. */
  pathsByAlias: Map<string, string>;
  changedLinesByPath: Map<string, number[]>;
}

/** Built from ALL changed files, not only the described ones (AC-36). */
export function buildGroundingSets(allFiles: InputFile[]): GroundingSets {
  const pathSet = new Set<string>();
  const changedLinesByPath = new Map<string, number[]>();
  for (const f of allFiles) {
    pathSet.add(f.path);
    changedLinesByPath.set(f.path, changedLinesFromPatch(f.patch));
  }
  return { pathSet, pathsByAlias: new Map(), changedLinesByPath };
}

export interface CandidateRisk {
  title?: unknown;
  detail?: unknown;
  path?: unknown;
  line?: unknown;
  endpoint?: unknown;
}

export interface CandidateFocus {
  path?: unknown;
  line?: unknown;
  reason?: unknown;
}

export interface CandidateBrief {
  risks?: CandidateRisk[];
  review_focus?: CandidateFocus[];
}

export interface GroundedEntries {
  risks: BriefRisk[];
  reviewFocus: BriefReviewFocus[];
  risksTotal: number;
  reviewFocusTotal: number;
}

function resolvePath(raw: unknown, sets: GroundingSets): string | undefined {
  if (typeof raw !== 'string' || raw.length === 0) return undefined;
  if (sets.pathSet.has(raw)) return raw;
  const aliased = sets.pathsByAlias.get(raw);
  return aliased && sets.pathSet.has(aliased) ? aliased : undefined;
}

/** Snap `line` to the nearest changed line in the same file, or `undefined`. */
function snapLine(line: unknown, changed: number[] | undefined): number | undefined {
  if (!changed || changed.length === 0) return undefined;
  if (typeof line !== 'number' || !Number.isFinite(line)) return undefined;
  if (changed.includes(line)) return line;
  let best: number | undefined;
  let bestDist = Infinity;
  for (const c of changed) {
    const d = Math.abs(c - line);
    if (d < bestDist) {
      bestDist = d;
      best = c;
    }
  }
  return best;
}

/**
 * Validate the model's risk/focus entries against server-derived sets
 * (AC-12, AC-12a, AC-13, AC-18); truncate to the caps (AC-16) and return the
 * PRE-truncation counts. Never decides "everything dropped → discard the
 * brief" — that is the service's call (AC-14).
 */
export function groundEntries(
  candidate: CandidateBrief,
  sets: GroundingSets,
  endpointSet: Set<string>,
): GroundedEntries {
  const groundedRisks: BriefRisk[] = [];
  for (const r of candidate.risks ?? []) {
    if (typeof r.title !== 'string' || r.title.length === 0) continue;
    const path = resolvePath(r.path, sets);
    // A risk that cites a path must ground it; a path-less risk is allowed.
    if (r.path != null && !path) continue;
    let line: number | null = null;
    if (path && r.line != null) {
      const snapped = snapLine(r.line, sets.changedLinesByPath.get(path));
      if (snapped === undefined) continue; // unverifiable line → drop (AC-13)
      line = snapped;
    }
    let endpoint: string | null = null;
    if (r.endpoint != null) {
      if (typeof r.endpoint === 'string' && endpointSet.has(r.endpoint)) {
        endpoint = r.endpoint;
      }
      // outside the (possibly empty) endpoint set → null it, keep the entry
    }
    groundedRisks.push({
      title: r.title,
      detail: typeof r.detail === 'string' ? r.detail : null,
      path: path ?? null,
      line,
      endpoint,
    });
  }

  const groundedFocus: BriefReviewFocus[] = [];
  for (const f of candidate.review_focus ?? []) {
    if (typeof f.reason !== 'string' || f.reason.length === 0) continue;
    const path = resolvePath(f.path, sets);
    if (!path) continue; // review-focus requires a grounded path
    const line = snapLine(f.line, sets.changedLinesByPath.get(path));
    if (line === undefined) continue; // AC-13
    groundedFocus.push({ path, line, reason: f.reason });
  }

  return {
    risks: groundedRisks.slice(0, MAX_RISKS),
    reviewFocus: groundedFocus.slice(0, MAX_REVIEW_FOCUS),
    risksTotal: groundedRisks.length,
    reviewFocusTotal: groundedFocus.length,
  };
}

// ---------------------------------------------------------------- prompt render

/** One aggregate/described-file line block for the model input — paths and
 *  counts only, NEVER patch text (AC-10). */
export function renderInputFiles(selected: SelectedInput): string {
  const lines = selected.described.map(
    (f) => `${f.path} (+${f.additions} -${f.deletions})`,
  );
  if (selected.omittedCount > 0) {
    lines.push(
      `… and ${selected.omittedCount} more file(s), ${selected.omittedChangedLines} changed line(s) total`,
    );
  }
  return lines.length > 0 ? lines.join('\n') : '(no changed files)';
}

export const RISK_LEVEL_VALUES: readonly RiskLevel[] = ['high', 'medium', 'low'];

// ---------------------------------------------------------------- linked issues

export interface LinkedIssueRef {
  owner?: string;
  repo?: string;
  number: number;
  /** `owner/repo#123` referencing a DIFFERENT repo than the one under review. */
  crossRepo: boolean;
}

const CLOSING_KEYWORD = '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)';
const REF_PATTERN = new RegExp(
  `(?:\\b${CLOSING_KEYWORD}\\b\\s*:?\\s*)?(?:([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+))?#(\\d+)\\b`,
  'gi',
);

/**
 * Extract linked issue references from a PR body. Deduplicated, capped at
 * `limit`. Deliberately a LOCAL copy of `modules/intent/helpers.ts`'s function
 * of the same name — `.dependency-cruiser.cjs`'s `no-cross-module-imports`
 * forbids importing it, even for a pure helper.
 */
export function parseLinkedIssueRefs(
  body: string | null | undefined,
  limit: number,
): LinkedIssueRef[] {
  if (!body) return [];
  const seen = new Set<string>();
  const out: LinkedIssueRef[] = [];
  for (const m of body.matchAll(REF_PATTERN)) {
    if (out.length >= limit) break;
    const [, owner, repo, numStr] = m;
    const number = Number(numStr);
    if (!Number.isFinite(number)) continue;
    const crossRepo = Boolean(owner && repo);
    const key = crossRepo ? `${owner}/${repo}#${number}` : `#${number}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ ...(owner ? { owner } : {}), ...(repo ? { repo } : {}), number, crossRepo });
  }
  return out;
}
