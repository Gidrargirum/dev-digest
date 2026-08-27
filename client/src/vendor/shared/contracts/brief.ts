import { z } from 'zod';

/**
 * PR Brief building blocks: Intent, Blast radius, Risks, PR History,
 * Smart Diff. Composed into PrBrief.
 */

// ---- Intent ----
export const IntentConfidence = z.enum(['low', 'medium', 'high']);
export type IntentConfidence = z.infer<typeof IntentConfidence>;

export const Intent = z.object({
  intent: z.string(),
  in_scope: z.array(z.string()),
  out_of_scope: z.array(z.string()),
  risk_areas: z.array(z.string()).default([]),
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

export const Risk = z.object({
  kind: z.string(),
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

// ---- Composed PR Brief (pr_brief.json) ----
export const PrBrief = z.object({
  intent: Intent,
  blast: BlastRadius,
  risks: Risks,
  history: PrHistory,
});
export type PrBrief = z.infer<typeof PrBrief>;

// ---- Why + Risk Brief (pr_why_risk_brief) — separate from PrBrief above ----
// New contract for the L05 "Why + Risk Brief" feature (spec
// 2026-08-27-pr-why-risk-brief). Deliberately NOT a reshape of `PrBrief` /
// `pr_brief`: different table (`pr_why_risk_brief`, carries a state key), a
// single structured model call, and grounded path/line/endpoint references.
export const RiskLevel = z.enum(['high', 'medium', 'low']); // AC-15
export type RiskLevel = z.infer<typeof RiskLevel>;

export const BriefRisk = z.object({
  title: z.string(),
  detail: z.string().nullish(),
  path: z.string().nullable(), // grounded (AC-12) or null
  line: z.number().int().nullable(), // grounded (AC-13) or null
  endpoint: z.string().nullable(), // grounded against blast set; null on AC-18 path
});
export type BriefRisk = z.infer<typeof BriefRisk>;

export const BriefReviewFocus = z.object({
  path: z.string(),
  line: z.number().int(),
  reason: z.string(),
});
export type BriefReviewFocus = z.infer<typeof BriefReviewFocus>;

export const PrWhyRiskBrief = z.object({
  pr_id: z.string(),
  what: z.string(),
  why: z.string(),
  risk_level: RiskLevel,
  risks: z.array(BriefRisk),
  review_focus: z.array(BriefReviewFocus),
  risks_total: z.number().int(), // pre-truncation count (AC-16 -> AC-35)
  review_focus_total: z.number().int(), // pre-truncation count (AC-16 -> AC-35)
  sources: z.array(z.string()), // which inputs contributed (AC-17)
  pr_state_key: z.string(), // AC-4
  model: z.string().nullable(), // "<provider>/<model>"
  computed_at: z.string(), // ISO-8601
});
export type PrWhyRiskBrief = z.infer<typeof PrWhyRiskBrief>;

export const PrWhyRiskBriefResponse = z.object({ brief: PrWhyRiskBrief.nullable() }); // AC-20
export type PrWhyRiskBriefResponse = z.infer<typeof PrWhyRiskBriefResponse>;

export const PrWhyRiskBriefRegenerateResponse = z.object({
  status: z.enum(['started', 'running']), // AC-8 / AC-21
});
export type PrWhyRiskBriefRegenerateResponse = z.infer<typeof PrWhyRiskBriefRegenerateResponse>;
