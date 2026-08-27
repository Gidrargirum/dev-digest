/**
 * Why + Risk Brief module constants (spec 2026-08-27-pr-why-risk-brief,
 * "Tunable constants").
 */

/** Cap on stored risks; the model's overflow is truncated (AC-16). */
export const MAX_RISKS = 8;

/** Cap on stored review-focus entries; overflow truncated (AC-16). */
export const MAX_REVIEW_FOCUS = 6;

/** Files described individually in the model input; the rest collapse to one
 *  aggregate line (AC-36). Grounding still validates against ALL changed files. */
export const MAX_INPUT_FILES = 40;

/** Manual regenerations allowed per minute, per pull request (AC-38). */
export const MAX_REGEN = 3;

/** Ceiling on the single structured brief call — cheap output, returns fast
 *  (same order of magnitude as `INTENT_TIMEOUT_MS`). */
export const BRIEF_TIMEOUT_MS = 20_000;

/** Linked-issue references parsed from the PR body (mirrors the intent module). */
export const MAX_LINKED_ISSUES = 3;

/** Job kind for the background brief computation. */
export const BRIEF_JOB_KIND = 'brief.compute';

/** `schemaName` for the structured model call. */
export const BRIEF_SCHEMA_NAME = 'PrWhyRiskBrief';
