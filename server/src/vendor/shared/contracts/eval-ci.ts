import { z } from 'zod';
import { Verdict, Finding } from './findings.js';
import {
  EvalRun,
  EvalOwnerKind,
  EvalExpectationType,
  EvalExpectedFinding,
  Conformance,
  Provider,
  CiFailOn,
} from './knowledge.js';

/**
 * A4 — Eval / CI / Compose / Conformance API contracts (L06).
 *
 * These EXTEND the barrel; they do not modify existing contract files. The base
 * `EvalRun`, `EvalCase`, `EvalOwnerKind`, `Conformance` live in `knowledge.ts`;
 * here we add the *API-facing* request/response shapes (records persisted in
 * `eval_runs`, `composed_reviews`, `ci_installations`, `ci_runs`,
 * `conformance_checks`) plus the eval-dashboard aggregate.
 */

// ===========================================================================
// Eval — case input + persisted run record + dashboard
// ===========================================================================

/** Create/update payload for an eval case (id + owner resolved by the route). */
/**
 * Base object shape — kept separate from `EvalCaseInput` (below) because
 * `.superRefine()` returns a `ZodEffects`, which has no `.partial()`.
 * `modules/eval/routes.ts` builds its PUT/patch body from THIS shape, then
 * re-applies `refineMustNotFlagExpectedOutput` itself so a partial update
 * still gets the same cross-field check whenever both fields are present.
 */
export const EvalCaseInputShape = z.object({
  // Amendment A: `owner_kind = 'skill'` is a first-class, supported value
  // (AC-36) — no longer rejected at the route level. For a skill-owned case,
  // `baseline_agent_id` is required; that requirement is enforced by
  // `EvalService`, keyed off `owner_kind`, NOT by this schema (a
  // discriminated union was considered and rejected — see the plan's
  // Recommendations — because it would retroactively make `baseline_agent_id`
  // required-looking on the already-shipped agent-owned shape).
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  // Required only for `owner_kind = 'skill'` (AC-38); the service, not this
  // schema, enforces that. `null`/absent for `owner_kind = 'agent'`.
  baseline_agent_id: z.string().uuid().nullish(),
  name: z.string().min(1),
  input_diff: z.string().default(''),
  input_files: z.unknown().nullish(),
  input_meta: z.unknown().nullish(),
  expectation_type: EvalExpectationType,
  expected_output: z.array(EvalExpectedFinding),
  notes: z.string().nullish(),
});

/**
 * A `must_not_flag` case expects ZERO findings on its input (AC-21) — a
 * non-empty `expected_output` would contradict that and is rejected.
 * Exported so a partial (PATCH-style) schema built from `EvalCaseInputShape`
 * can apply the same rule via its own `.superRefine()` call.
 */
export function refineMustNotFlagExpectedOutput(
  val: { expectation_type?: EvalExpectationType | undefined; expected_output?: EvalExpectedFinding[] | undefined },
  ctx: z.RefinementCtx,
): void {
  if (val.expectation_type === 'must_not_flag' && val.expected_output && val.expected_output.length > 0) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['expected_output'],
      message: 'expected_output must be empty when expectation_type is "must_not_flag"',
    });
  }
}

export const EvalCaseInput = EvalCaseInputShape.superRefine(refineMustNotFlagExpectedOutput);
export type EvalCaseInput = z.infer<typeof EvalCaseInput>;

/**
 * The scored outcome of ONE review pass (Amendment A, AC-53) — either the
 * `with` pass (skill under test present) or the `without` pass (skill
 * removed) of a skill-owned case's two-pass execution. `error` is set, and
 * every other field left at its zero-signal value, when that specific pass
 * failed (AC-46) while the other pass succeeded.
 */
export const EvalPassResult = z.object({
  findings: z.array(Finding),
  recall: z.number().min(0).max(1).nullable(),
  precision: z.number().min(0).max(1).nullable(),
  citation_accuracy: z.number().min(0).max(1).nullable(),
  pass: z.boolean(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  error: z.string().nullish(),
});
export type EvalPassResult = z.infer<typeof EvalPassResult>;

/**
 * The `with` − `without` signed difference of each metric (AC-50). `null`
 * whenever either side is `null` under AC-22 — a missing value is never
 * treated as zero. Zero itself ("both passes scored identically") is a
 * distinct, valid value (AC-51).
 */
export const EvalMarginalEffect = z.object({
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
});
export type EvalMarginalEffect = z.infer<typeof EvalMarginalEffect>;

/**
 * `EvalRunRecord.actual_output`'s shape for a skill-owned run (AC-53) — a
 * consumer tells this apart from the agent-owned flat shape via the owning
 * batch/case's `owner_kind`, never by probing the payload.
 */
export const EvalSkillActualOutput = z.object({
  with: EvalPassResult.nullable(),
  without: EvalPassResult.nullable(),
  marginal: EvalMarginalEffect,
});
export type EvalSkillActualOutput = z.infer<typeof EvalSkillActualOutput>;

/** A persisted eval run row (one execution of a case), returned by the API. */
export const EvalRunRecord = z.object({
  id: z.string(),
  case_id: z.string(),
  case_name: z.string().nullish(),
  batch_id: z.string(),
  ran_at: z.string(),
  actual_output: z.unknown(),
  pass: z.boolean().nullable(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  // Detail view (AC-24/AC-25), so a failing case is diagnosable without
  // re-reading the raw output. `matched` — expectations that found a
  // matching produced finding. `unmatched` — expectations that found NO
  // matching finding PLUS any produced findings that matched no expectation
  // (false positives), both mapped onto the shared `EvalExpectedFinding`
  // shape (file/lines/severity/category/title) so the client can render
  // them uniformly regardless of which side they came from.
  matched: z.array(EvalExpectedFinding),
  unmatched: z.array(EvalExpectedFinding),
});
export type EvalRunRecord = z.infer<typeof EvalRunRecord>;

export const EvalBatchStatus = z.enum(['running', 'done', 'failed', 'cancelled']);
export type EvalBatchStatus = z.infer<typeof EvalBatchStatus>;

/**
 * A persisted eval batch (mirrors `eval_batches`) — one
 * `POST /agents/:id/eval-runs` or `POST /skills/:id/eval-runs` (Amendment A).
 *
 * `agent_id`/`agent_version` are always the BASELINE agent — for a skill
 * batch that is the agent supplying provider/model/system_prompt for both
 * passes, not "the agent under test" (skills have no agent of their own).
 * `owner_kind`/`owner_id` (AC-40) name what the batch actually measures:
 * `'agent'`/agent id for an agent batch, `'skill'`/skill id for a skill
 * batch. `skill_version` is the skill's version in force at execution time
 * (AC-40); `null` for an agent batch. `marginal` is the batch-level
 * macro-averaged marginal effect (AC-50); `null` for an agent batch, which
 * has no `with`/`without` distinction.
 */
export const EvalBatch = z.object({
  id: z.string(),
  agent_id: z.string(),
  agent_version: z.number().int(),
  owner_kind: EvalOwnerKind,
  owner_id: z.string(),
  skill_version: z.number().int().nullable(),
  status: EvalBatchStatus,
  started_at: z.string(),
  finished_at: z.string().nullable(),
  cases_total: z.number().int(),
  cases_passed: z.number().int(),
  recall: z.number().nullable(),
  precision: z.number().nullable(),
  citation_accuracy: z.number().nullable(),
  no_flag_rate: z.number().nullable(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullable(),
  marginal: EvalMarginalEffect.nullable(),
});
export type EvalBatch = z.infer<typeof EvalBatch>;

/** What `POST /agents/:id/eval-runs` returns immediately (AC-12, Responsiveness). */
export const EvalBatchStarted = z.object({
  batch_id: z.string(),
});
export type EvalBatchStarted = z.infer<typeof EvalBatchStarted>;

/** A batch + its per-case run detail (`GET /eval-runs/:batchId`). */
export const EvalBatchDetail = z.object({
  batch: EvalBatch,
  runs: z.array(EvalRunRecord),
});
export type EvalBatchDetail = z.infer<typeof EvalBatchDetail>;

/** Result of running a single case: the metrics (EvalRun) + the persisted row id. */
export const EvalRunResult = z.object({
  run_id: z.string(),
  case_id: z.string(),
  result: EvalRun,
});
export type EvalRunResult = z.infer<typeof EvalRunResult>;

/**
 * One row of the dashboard's agent list (AC-31): every agent in the
 * workspace gets an entry, whether or not it has ever run a batch —
 * `latest_batch` is `null` for an agent with no batches yet, and the client
 * renders "Configure eval cases →" for it instead of metrics.
 */
export const EvalDashboardAgent = z.object({
  agent_id: z.string(),
  agent_name: z.string(),
  agent_model: z.string(),
  latest_batch: EvalBatch.nullable(),
});
export type EvalDashboardAgent = z.infer<typeof EvalDashboardAgent>;

/**
 * One row of the dashboard's `Recent runs` table (AC-32): an `EvalRunRecord`
 * plus which agent + agent version it belongs to — the table spans every
 * agent in the workspace, so the row needs to name its agent explicitly
 * (unlike `EvalBatchDetail.runs`, which is already scoped to one agent).
 */
export const EvalDashboardRun = EvalRunRecord.extend({
  agent_id: z.string(),
  agent_name: z.string(),
  agent_version: z.number().int(),
});
export type EvalDashboardRun = z.infer<typeof EvalDashboardRun>;

/**
 * Workspace-wide dashboard (`GET /evals/dashboard`, AC-31/AC-32): every
 * agent in the workspace with its latest batch (or `null` if it has never
 * run one) — plus the most recent runs across the whole workspace.
 */
export const EvalDashboard = z.object({
  agents: z.array(EvalDashboardAgent),
  recent_runs: z.array(EvalDashboardRun),
});
export type EvalDashboard = z.infer<typeof EvalDashboard>;

// ===========================================================================
// Compose Review
// ===========================================================================

export const ComposeReviewInput = z.object({
  /** Finding ids to fold into the draft (optional — body may be hand-written). */
  finding_ids: z.array(z.string()).default([]),
  /** Editable markdown body. If omitted, the server composes one from findings. */
  body: z.string().nullish(),
  verdict: Verdict.default('comment'),
  /** When true, attach selected findings as inline comments (path+line+body). */
  inline_comments: z.boolean().default(false),
});
export type ComposeReviewInput = z.infer<typeof ComposeReviewInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type ComposeReviewInputBody = z.input<typeof ComposeReviewInput>;

/** A persisted composed review (mirrors the `composed_reviews` row). */
export const ComposedReview = z.object({
  id: z.string(),
  pr_id: z.string(),
  body: z.string(),
  verdict: Verdict.nullable(),
  posted_at: z.string().nullable(),
  github_review_id: z.string().nullable(),
});
export type ComposedReview = z.infer<typeof ComposedReview>;

/** A preview (no GitHub side-effect) of what would be posted. */
export const ComposeReviewPreview = z.object({
  body: z.string(),
  verdict: Verdict,
  inline_comments: z.array(
    z.object({ path: z.string(), line: z.number().int(), body: z.string() }),
  ),
});
export type ComposeReviewPreview = z.infer<typeof ComposeReviewPreview>;

// ===========================================================================
// Export-to-CI + CI Runs
// ===========================================================================

export const CiTarget = z.enum(['gha', 'circle', 'jenkins', 'cli']);
export type CiTarget = z.infer<typeof CiTarget>;

/** One generated file in the CI bundle (path + editable contents). */
export const CiFile = z.object({
  path: z.string(),
  contents: z.string(),
  editable: z.boolean().default(true),
});
export type CiFile = z.infer<typeof CiFile>;

/**
 * AgentManifest — the agent contract shared by the studio and the CI runner.
 *
 * The studio (`CiService.agentYaml`) WRITES this shape to
 * `.devdigest/agents/<slug>.yaml`; the agent-runner READS it. Keeping one Zod
 * schema for both ends guarantees the formats never drift. `skills` are slugs
 * resolved to `.devdigest/skills/<slug>.md`.
 */
export const AgentManifest = z.object({
  name: z.string().min(1),
  provider: Provider.default('openrouter'),
  model: z.string().min(1),
  system_prompt: z.string(),
  // Tolerate both a missing key and an explicit `null` (YAML `skills:` with no
  // value parses to null, which `.default([])` does NOT catch) — normalize both
  // to an empty array so manifests without skills validate cleanly.
  skills: z
    .array(z.string())
    .nullish()
    .transform((v) => v ?? []),
  strategy: z.enum(['auto', 'single-pass', 'map-reduce']).default('auto'),
  // CI gate policy (see CiFailOn) — when the posted review should BLOCK
  // (REQUEST_CHANGES + fail the check) vs just comment. Default: block on critical.
  ci_fail_on: CiFailOn.default('critical'),
});
export type AgentManifest = z.infer<typeof AgentManifest>;
/** Caller-facing input type — `.default()` fields stay optional. */
export type AgentManifestInput = z.input<typeof AgentManifest>;

/** Request body for `POST /agents/:id/export-ci`. */
export const CiExportInput = z.object({
  repo: z.string().min(1), // "owner/name"
  target: CiTarget.default('gha'),
  /** "open_pr" opens a PR with the files; "files" just returns/persists them. */
  action: z.enum(['open_pr', 'files']).default('open_pr'),
  post_as: z.enum(['github_review', 'pr_comment', 'none']).default('github_review'),
  triggers: z.array(z.string()).default(['opened', 'synchronize', 'reopened']),
  base: z.string().default('main'),
});
export type CiExportInput = z.infer<typeof CiExportInput>;
/** Caller-facing input type — `.default()` fields stay optional (web hooks). */
export type CiExportInputBody = z.input<typeof CiExportInput>;

/** A persisted CI installation (mirrors `ci_installations`). */
export const CiInstallation = z.object({
  id: z.string(),
  agent_id: z.string(),
  repo: z.string(),
  target_type: CiTarget,
  installed_at: z.string(),
});
export type CiInstallation = z.infer<typeof CiInstallation>;

/** Response of `POST /agents/:id/export-ci`. */
export const CiExport = z.object({
  installation: CiInstallation,
  files: z.array(CiFile),
  pr_url: z.string().nullable(),
});
export type CiExport = z.infer<typeof CiExport>;

export const CiRunStatus = z.enum(['succeeded', 'failed', 'no_findings', 'running']);
export type CiRunStatus = z.infer<typeof CiRunStatus>;

/** A CI run row (mirrors `ci_runs`) — ingested from GitHub Actions artifacts. */
export const CiRun = z.object({
  id: z.string(),
  ci_installation_id: z.string().nullable(),
  pr_number: z.number().int().nullable(),
  ran_at: z.string().nullable(),
  status: z.string().nullable(),
  findings_count: z.number().int().nullable(),
  cost_usd: z.number().nullable(),
  github_url: z.string().nullable(),
  source: z.string().nullable(),
  agent: z.string().nullish(),
  duration_s: z.number().nullish(),
});
export type CiRun = z.infer<typeof CiRun>;

/**
 * The artifact shape uploaded by the CI action (`devdigest-result.json`).
 * Ingested back on refresh to populate `ci_runs` (L06).
 */
export const CiResultArtifact = z.object({
  findings_count: z.number().int(),
  critical: z.number().int().nullish(),
  warning: z.number().int().nullish(),
  suggestion: z.number().int().nullish(),
  cost_usd: z.number().nullable(),
  duration_ms: z.number().int().nullish(),
  agent: z.string(),
  version: z.string().nullish(),
  pr_number: z.number().int().nullish(),
});
export type CiResultArtifact = z.infer<typeof CiResultArtifact>;

// ===========================================================================
// Conformance (PRD ↔ PR) — API record (the analysis shape is `Conformance`)
// ===========================================================================

/** Request body for `POST /pulls/:id/conformance`. */
export const ConformanceInput = z.object({
  /** Spec path/id to compare against; if omitted, the first available spec. */
  spec: z.string().nullish(),
  provider: z.enum(['openai', 'anthropic', 'openrouter']).nullish(),
  model: z.string().nullish(),
});
export type ConformanceInput = z.infer<typeof ConformanceInput>;

/** A persisted conformance check (mirrors `conformance_checks` + the report). */
export const ConformanceReport = z.object({
  id: z.string(),
  pr_id: z.string(),
  report: Conformance,
});
export type ConformanceReport = z.infer<typeof ConformanceReport>;

// ===========================================================================
// Hooks (Secret-Leak + Phantom-API detectors) — emit grounding-exempt findings
// ===========================================================================

export const HookKind = z.enum(['secret_leak', 'phantom']);
export type HookKind = z.infer<typeof HookKind>;

/** Result of running the built-in detectors over a PR. */
export const HookScanResult = z.object({
  pr_id: z.string(),
  review_id: z.string().nullable(),
  findings: z.array(Finding),
});
export type HookScanResult = z.infer<typeof HookScanResult>;
