import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. The model-authored `Brief { what, why, risk_level, risks[],
 * review_focus[] }` is the single risk surface (see specs/2026-08-28-pr-brief.md);
 * the persisted/transport shape `PrBriefRecord` lives in `review-api.ts`.
 */

// ---- Intent ----
export const IntentConfidence = z.enum(['low', 'medium', 'high']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  confidence: IntentConfidence.default('low'),
  sources: z.array(z.string()).default([]),
});
export type Intent = z.infer<typeof Intent>;

// ---- Blast radius ----
export const BlastStatus = z.enum(['ok', 'partial', 'degraded']);
export type BlastStatus = z.infer<typeof BlastStatus>;

export const ChangedSymbol = z.object({
  name: z.string(),
  file: z.string(),
  kind: z.string(),
});
export type ChangedSymbol = z.infer<typeof ChangedSymbol>;

export const BlastCaller = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number().int(),
});
export type BlastCaller = z.infer<typeof BlastCaller>;

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
  /** MAX_CALLERS_PER_SYMBOL was hit for this symbol. */
  callers_truncated: z.boolean(),
});
export type DownstreamImpact = z.infer<typeof DownstreamImpact>;

export const BlastRadius = z.object({
  changed_symbols: z.array(ChangedSymbol),
  downstream: z.array(DownstreamImpact),
  summary: z.string(),
});
export type BlastRadius = z.infer<typeof BlastRadius>;

/**
 * A PR in the same repo that touched at least one of the current PR's
 * changed files — "Prior PRs touching these files" (see specs/blast-radius.md
 * "Not implemented", now implemented as a top-level field of
 * `PrBlastResponse`). Deliberately NOT `PrHistoryItem` above: that type is
 * for the LLM-authored PR history section (`merged_at`/`notes`), while this
 * one is a plain DB aggregate with no model involved — any PR in the repo
 * regardless of status, not just merged ones.
 */
export const PriorPrRef = z.object({
  number: z.number().int(),
  title: z.string(),
  updated_at: z.string().nullable(),
  overlap_count: z.number().int(),
});
export type PriorPrRef = z.infer<typeof PriorPrRef>;

export const PrBlastResponse = z.object({
  status: BlastStatus,
  reason: z.string().nullable(),
  blast: BlastRadius.nullable(),
  counts: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
  /**
   * Top PRs in the same repo (any status) that touched files this PR also
   * touched — independent of the repo-intel index, so present even when
   * `status: 'degraded'` and `blast: null`.
   */
  prior_prs: z.array(PriorPrRef),
});
export type PrBlastResponse = z.infer<typeof PrBlastResponse>;

// ---- Risks ----
export const RiskSeverity = z.enum(['high', 'medium', 'low']);
export type RiskSeverity = z.infer<typeof RiskSeverity>;

/** The closed set of risk categories a `Risk.kind` may take (AC-16) — replaces
 *  the former free string, so a drifted kind is rejected by contract validation. */
export const RiskAreaKind = z.enum([
  'security',
  'dependency',
  'performance',
  'data',
  'api_change',
  'other',
]);
export type RiskAreaKind = z.infer<typeof RiskAreaKind>;

export const Risk = z.object({
  kind: RiskAreaKind,
  title: z.string(),
  explanation: z.string(),
  severity: RiskSeverity,
  file_refs: z.array(z.string()),
});
export type Risk = z.infer<typeof Risk>;

export const Risks = z.object({
  risks: z.array(Risk),
});
export type Risks = z.infer<typeof Risks>;

// ---- PR Brief (model output) ----
/** The Brief's model-assessed merge risk — drives the card's accent rail (AC-18). */
export const RiskLevel = z.enum(['low', 'medium', 'high']);
export type RiskLevel = z.infer<typeof RiskLevel>;

/** One "read this first" entry: a short label plus grounded file references. */
export const ReviewFocusItem = z.object({
  label: z.string(),
  file_refs: z.array(z.string()),
});
export type ReviewFocusItem = z.infer<typeof ReviewFocusItem>;

/**
 * The generated, cached PR Brief — one structured `risk_brief` LLM call per
 * `(pr_id, head_sha)`. Review metrics (verdict/score/cost/tokens) are
 * deliberately NOT here — they stay on `RunSummary` / the review record.
 */
export const Brief = z.object({
  what: z.string(),
  why: z.string(),
  risk_level: RiskLevel,
  risks: z.array(Risk),
  review_focus: z.array(ReviewFocusItem),
});
export type Brief = z.infer<typeof Brief>;

// ---- PR History ----
export const PrHistoryItem = z.object({
  pr_number: z.number().int(),
  title: z.string(),
  merged_at: z.string(),
  author: z.string(),
  files_overlap: z.array(z.string()),
  notes: z.string(),
});
export type PrHistoryItem = z.infer<typeof PrHistoryItem>;

export const PrHistory = z.object({
  history: z.array(PrHistoryItem),
});
export type PrHistory = z.infer<typeof PrHistory>;

// ---- Smart Diff ----
export const SmartDiffRole = z.enum(['core', 'wiring', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;

export const SmartDiffFile = z.object({
  path: z.string(),
  pseudocode_summary: z.string().nullish(),
  additions: z.number().int(),
  deletions: z.number().int(),
  finding_lines: z.array(z.number().int()),
});
export type SmartDiffFile = z.infer<typeof SmartDiffFile>;

export const SmartDiffGroup = z.object({
  role: SmartDiffRole,
  files: z.array(SmartDiffFile),
});
export type SmartDiffGroup = z.infer<typeof SmartDiffGroup>;

export const ProposedSplit = z.object({
  name: z.string(),
  files: z.array(z.string()),
});
export type ProposedSplit = z.infer<typeof ProposedSplit>;

export const SmartDiff = z.object({
  groups: z.array(SmartDiffGroup),
  split_suggestion: z.object({
    too_big: z.boolean(),
    total_lines: z.number().int(),
    proposed_splits: z.array(ProposedSplit),
  }),
});
export type SmartDiff = z.infer<typeof SmartDiff>;
