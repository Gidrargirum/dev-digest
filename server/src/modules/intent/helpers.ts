/**
 * Pure helpers for the intent service (side-effect free; operate purely on
 * their arguments — no DB / network / `this`).
 */
import type { IntentConfidence } from '@devdigest/shared';

// ---------------------------------------------------------------- linked issues

export interface LinkedIssueRef {
  owner?: string;
  repo?: string;
  number: number;
  /** `owner/repo#123` referencing a DIFFERENT repo than the one under review. */
  crossRepo: boolean;
}

/**
 * All 9 GitHub closing keywords (close/closes/closed, fix/fixes/fixed,
 * resolve/resolves/resolved), case-insensitive, optionally followed by
 * `owner/repo#123` (cross-repo) or a bare `#123` (same-repo). A bare `#123`
 * with NO keyword also counts — PR authors reference issues informally
 * ("see #123") far more often than with a closing verb.
 */
const CLOSING_KEYWORD = '(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)';
const REF_PATTERN = new RegExp(
  `(?:\\b${CLOSING_KEYWORD}\\b\\s*:?\\s*)?(?:([A-Za-z0-9_.-]+)\\/([A-Za-z0-9_.-]+))?#(\\d+)\\b`,
  'gi',
);

/**
 * Extract linked issue references from a PR body. Deduplicated, capped at
 * `limit`. `octokit.ts:126` (`resolveLinkedIssue`, which feeds
 * `PrDetail.linked_issue`) is intentionally NOT reused here — different
 * contract, different consumer (decision, plans/intent-layer.md §1 "Поза
 * скоупом").
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

// ------------------------------------------------------------------ confidence

/**
 * `confidence` rubric — computed by CODE, never the model (the model's own
 * schema does not even carry the field). Self-reported LLM confidence is
 * uncalibrated, and this is also the injection defense: text inside `body`/an
 * issue cannot raise its own trust, because `sources[]` is the only input and
 * it is built from labels the code assigns, not from model output.
 *
 *   - only `pr_title` + `pr_branch` (+ `pr_files`)        → low
 *   - additionally a non-empty `pr_body`                  → medium
 *   - additionally a linked issue (`issue#…`) or, when the
 *     disabled step-9 spec-file flag is ever enabled, a
 *     `spec:…` source                                     → high
 */
export function confidenceFromSources(sources: string[]): IntentConfidence {
  if (sources.some((s) => s.startsWith('issue#') || s.startsWith('spec:'))) return 'high';
  if (sources.includes('pr_body')) return 'medium';
  return 'low';
}

// ------------------------------------------------------------------- rendering

/** Serialize the intent into the plain string the review prompt's `intent`
 *  slot expects (`reviewer-core/AGENTS.md`: "Inputs are resolved strings"). */
export function renderIntentForPrompt(record: {
  intent: string;
  in_scope: string[];
  out_of_scope: string[];
}): string {
  const lines = [record.intent.trim()];
  if (record.in_scope.length > 0) lines.push(`In scope: ${record.in_scope.join('; ')}`);
  if (record.out_of_scope.length > 0) lines.push(`Out of scope: ${record.out_of_scope.join('; ')}`);
  return lines.join('\n');
}
