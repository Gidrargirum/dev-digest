/**
 * Pure helpers for the Brief service — side-effect free, operate only on their
 * arguments (no DB / network / `this`).
 */
import type { Brief } from '@devdigest/shared';
import { wrapUntrusted } from '@devdigest/reviewer-core';
import { BRIEF_USER_PREFIX, MAX_INPUT_TOKENS } from './constants.js';

/**
 * Rough token estimate — ~4 chars/token. Deliberately a heuristic, not a real
 * tokenizer: the Brief module takes no `Tokenizer` port, and AC-3 only needs
 * the payload kept "at or below" the ceiling, for which a conservative
 * approximation is enough.
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export interface BriefLinkedIssue {
  number: number;
  title: string;
  body: string | null;
}

export interface BriefChangedFileStat {
  path: string;
  additions: number;
  deletions: number;
}

export interface AssembleBriefInputParams {
  /** Rendered intent text (derived from the PR body — treated as untrusted). */
  intentText: string;
  /** Blast-radius summary; `null` when absent or degraded. */
  blastSummary: string | null;
  changedFiles: BriefChangedFileStat[];
  issue: BriefLinkedIssue | null;
}

/**
 * Assemble the Brief LLM user message from derived facts only — never diff
 * bodies (AC-2). When the payload exceeds `MAX_INPUT_TOKENS` the lowest-priority
 * sections are shed first, in order (AC-3): linked-issue body → blast summary →
 * diff statistics → intent.
 */
export function assembleBriefInput(p: AssembleBriefInputParams): string {
  let includeIssueBody = true;
  let includeBlast = true;
  let fileLimit = p.changedFiles.length;
  let intentText = p.intentText;
  let issueTitle = p.issue?.title ?? '';

  const build = (): string => {
    const sections: string[] = [];

    if (intentText.trim().length > 0) {
      sections.push(`## Derived intent\n${wrapUntrusted('intent', intentText)}`);
    }

    if (includeBlast && p.blastSummary && p.blastSummary.trim().length > 0) {
      sections.push(
        `## Blast radius\n${wrapUntrusted('blast-summary', p.blastSummary.trim())}`,
      );
    }

    if (fileLimit > 0 && p.changedFiles.length > 0) {
      const shown = p.changedFiles.slice(0, fileLimit);
      const lines = shown.map((f) => `- ${f.path} (+${f.additions}/-${f.deletions})`);
      const omitted = p.changedFiles.length - shown.length;
      if (omitted > 0) lines.push(`- …and ${omitted} more file(s)`);
      sections.push(`## Changed files\n${wrapUntrusted('changed-files', lines.join('\n'))}`);
    }

    if (p.issue) {
      const body = includeIssueBody ? (p.issue.body ?? '') : '';
      const text = body.trim().length > 0 ? `${issueTitle}\n\n${body}` : issueTitle;
      sections.push(
        `## Linked issue #${p.issue.number}\n${wrapUntrusted(`issue-${p.issue.number}`, text)}`,
      );
    }

    return sections.join('\n\n');
  };

  const fits = (s: string) => estimateTokens(`${BRIEF_USER_PREFIX}${s}`) <= MAX_INPUT_TOKENS;

  let out = build();
  if (fits(out)) return out;

  includeIssueBody = false;
  out = build();
  if (fits(out)) return out;

  includeBlast = false;
  out = build();
  if (fits(out)) return out;

  while (fileLimit > 0 && !fits(build())) fileLimit = Math.floor(fileLimit / 2);
  out = build();
  if (fits(out)) return out;

  // Last resort: clip the intent text itself until the payload fits.
  while (intentText.length > 0 && !fits(build())) {
    intentText = intentText.slice(0, Math.floor(intentText.length / 2));
  }
  // Issue titles are normally tiny, but they are external text and therefore
  // unbounded at this layer. Preserve them through the documented priority
  // reductions, then clip only as the final fail-safe so the hard ceiling is
  // true for adversarial metadata too.
  while (issueTitle.length > 0 && !fits(build())) {
    issueTitle = issueTitle.slice(0, Math.floor(issueTitle.length / 2));
  }
  return build();
}

/** Serialize the stored intent facts into the plain text the Brief prompt slot expects. */
export function renderIntentFacts(
  facts: { intent: string; inScope: string[]; outOfScope: string[] } | undefined,
): string {
  if (!facts) return '';
  const lines = [facts.intent.trim()];
  if (facts.inScope.length > 0) lines.push(`In scope: ${facts.inScope.join('; ')}`);
  if (facts.outOfScope.length > 0) lines.push(`Out of scope: ${facts.outOfScope.join('; ')}`);
  return lines.join('\n');
}

// --------------------------------------------------------------- linked issue

/**
 * All 9 GitHub closing keywords, optionally followed by `owner/repo#123`
 * (cross-repo) or a bare `#123` (same-repo); a bare `#123` with no keyword
 * counts too. Minimal local copy of `modules/intent/helpers.ts`'s
 * `parseLinkedIssueRefs` — `.dependency-cruiser.cjs`'s `no-cross-module-imports`
 * forbids importing it, and `_shared` has no home for it that would not also
 * mean editing the intent module.
 */
const ISSUE_REF_PATTERN =
  /(?:\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\b\s*:?\s*)?(?:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+))?#(\d+)\b/gi;

/**
 * The first **same-repo** issue/PR number referenced in a PR body, or
 * `undefined`. Cross-repo refs (`owner/repo#123`) are skipped — the token may
 * lack access and they are out of scope, mirroring `IntentService`'s decision.
 */
export function parseFirstLinkedIssueRef(body: string | null | undefined): number | undefined {
  if (!body) return undefined;
  for (const m of body.matchAll(ISSUE_REF_PATTERN)) {
    const [, owner, repo, numStr] = m;
    if (owner && repo) continue;
    const n = Number(numStr);
    if (Number.isFinite(n)) return n;
  }
  return undefined;
}

// ------------------------------------------------------------------- grounding

/** The file path portion of a reference like `src/api/users.ts:12-18`. */
function refPath(ref: string): string {
  return ref.split(':', 1)[0] ?? ref;
}

/**
 * Structural grounding gate (AC-4 / AC-5). Every `file_ref` whose path is not in
 * `knownPaths` (the union of `pr_files` paths and blast paths) is dropped — path
 * only, never line-precise. A `review_focus` item left with no refs is dropped;
 * a `risk` left with no refs is kept, with `file_refs: []`.
 */
export function groundBrief(brief: Brief, knownPaths: Set<string>): Brief {
  const keep = (refs: string[]) => refs.filter((r) => knownPaths.has(refPath(r)));

  return {
    ...brief,
    risks: brief.risks.map((risk) => ({ ...risk, file_refs: keep(risk.file_refs) })),
    review_focus: brief.review_focus
      .map((item) => ({ ...item, file_refs: keep(item.file_refs) }))
      .filter((item) => item.file_refs.length > 0),
  };
}
