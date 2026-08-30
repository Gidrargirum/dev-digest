import { z } from 'zod';
import { Severity, FindingCategory } from './findings.js';

/**
 * Conformance, Onboarding, Eval, Memory, Conventions, Skills,
 * Agents and their DTOs.
 */

// ---- Conformance ----
export const ConformanceStatus = z.enum(['implemented', 'missing', 'out_of_scope']);
export type ConformanceStatus = z.infer<typeof ConformanceStatus>;

export const ConformanceItem = z.object({
  requirement: z.string(),
  status: ConformanceStatus,
  evidence_file: z.string().nullish(),
  notes: z.string().nullish(),
});
export type ConformanceItem = z.infer<typeof ConformanceItem>;

export const Conformance = z.object({
  spec_id: z.string(),
  spec_title: z.string(),
  items: z.array(ConformanceItem),
  completeness_pct: z.number().min(0).max(100),
});
export type Conformance = z.infer<typeof Conformance>;

// ---- Onboarding ----
export const OnboardingLink = z.object({
  label: z.string(),
  path: z.string(),
});
export type OnboardingLink = z.infer<typeof OnboardingLink>;

export const OnboardingSection = z.object({
  kind: z.string(),
  title: z.string(),
  body: z.string(), // markdown
  diagram: z.string().nullish(), // mermaid
  links: z.array(OnboardingLink),
});
export type OnboardingSection = z.infer<typeof OnboardingSection>;

export const Onboarding = z.object({
  sections: z.array(OnboardingSection),
});
export type Onboarding = z.infer<typeof Onboarding>;

// ---- Eval ----
export const EvalPerTrace = z.object({
  name: z.string(),
  pass: z.boolean(),
  expected: z.unknown(),
  actual: z.unknown(),
});
export type EvalPerTrace = z.infer<typeof EvalPerTrace>;

/**
 * `must_find` — the case expects the agent to surface >=1 matching finding
 * (contributes to recall). `must_not_flag` — the case expects ZERO findings on
 * this input; any produced finding is a false positive (contributes to
 * `no_flag_rate`, never to recall/precision denominators — AC-21).
 */
export const EvalExpectationType = z.enum(['must_find', 'must_not_flag']);
export type EvalExpectationType = z.infer<typeof EvalExpectationType>;

/** One finding the case expects (or, for `must_not_flag`, must NOT produce). */
export const EvalExpectedFinding = z.object({
  file: z.string(),
  start_line: z.number().int(),
  end_line: z.number().int(),
  severity: Severity,
  category: FindingCategory,
  title: z.string(),
});
export type EvalExpectedFinding = z.infer<typeof EvalExpectedFinding>;

export const EvalRun = z.object({
  // Nullable (AC-22): a zero denominator (e.g. a must_not_flag case has no
  // recall denominator) is `null`, never substituted with 0 or 1.
  recall: z.number().min(0).max(1).nullable(),
  precision: z.number().min(0).max(1).nullable(),
  citation_accuracy: z.number().min(0).max(1).nullable(),
  // False-positive rate over must_not_flag cases (AC-24) — API-only, never a
  // fifth metric card in the dashboard UI.
  no_flag_rate: z.number().min(0).max(1).nullable(),
  traces_passed: z.number().int(),
  traces_total: z.number().int(),
  duration_ms: z.number().int(),
  cost_usd: z.number().nullable(),
  per_trace: z.array(EvalPerTrace),
});
export type EvalRun = z.infer<typeof EvalRun>;

export const EvalOwnerKind = z.enum(['skill', 'agent']);
export type EvalOwnerKind = z.infer<typeof EvalOwnerKind>;

export const EvalCase = z
  .object({
    id: z.string(),
    owner_kind: EvalOwnerKind,
    owner_id: z.string(),
    // The baseline agent whose provider/model/system_prompt/remaining skills
    // supply both passes of a skill-owned case's execution (Amendment A,
    // AC-38). Required (in practice, enforced by the service — see
    // `EvalCaseInputShape` in `eval-ci.ts`) when `owner_kind = 'skill'`;
    // meaningless and left `null` for `owner_kind = 'agent'`. Chosen by the
    // user in the case editor, never auto-inferred from `agent_skills`.
    baseline_agent_id: z.string().uuid().nullish(),
    name: z.string(),
    input_diff: z.string(),
    input_files: z.unknown(),
    input_meta: z.unknown(),
    expectation_type: EvalExpectationType,
    expected_output: z.array(EvalExpectedFinding),
    notes: z.string().nullish(),
  })
  .superRefine((val, ctx) => {
    // A `must_not_flag` case expects ZERO findings on its input (AC-21) — a
    // non-empty `expected_output` would contradict that and is rejected.
    if (val.expectation_type === 'must_not_flag' && val.expected_output.length > 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        path: ['expected_output'],
        message: 'expected_output must be empty when expectation_type is "must_not_flag"',
      });
    }
  });
export type EvalCase = z.infer<typeof EvalCase>;

// ---- Memory ----
export const MemoryScope = z.enum(['repo', 'global', 'team']);
export type MemoryScope = z.infer<typeof MemoryScope>;

export const MemoryKind = z.enum([
  'decision',
  'convention',
  'preference',
  'fact',
  'learning',
]);
export type MemoryKind = z.infer<typeof MemoryKind>;

export const MemorySource = z.object({
  pr: z.number().int().nullish(),
  context: z.string(),
});
export type MemorySource = z.infer<typeof MemorySource>;

export const MemoryItem = z.object({
  content: z.string(),
  scope: MemoryScope,
  kind: MemoryKind,
  confidence: z.number().min(0).max(1),
  sources: z.array(MemorySource),
});
export type MemoryItem = z.infer<typeof MemoryItem>;

// ---- Skills ----
export const SkillType = z.enum(['rubric', 'convention', 'security', 'custom']);
export type SkillType = z.infer<typeof SkillType>;

export const SkillSource = z.enum(['manual', 'imported_url', 'extracted', 'community']);
export type SkillSource = z.infer<typeof SkillSource>;

export const Skill = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string(),
  enabled: z.boolean(),
  version: z.number().int(),
  evidence_files: z.array(z.string()).nullish(),
});
export type Skill = z.infer<typeof Skill>;

export const CommunitySkill = z.object({
  id: z.string(),
  name: z.string(),
  repo: z.string(),
  stars: z.number().int(),
  lang: z.string(),
  desc: z.string(),
  type: SkillType,
  body: z.string(),
});
export type CommunitySkill = z.infer<typeof CommunitySkill>;

export const SkillVersion = z.object({
  skill_id: z.string(),
  version: z.number().int(),
  body: z.string(),
  created_at: z.string(),
});
export type SkillVersion = z.infer<typeof SkillVersion>;

/** Result of parsing an uploaded file / archive before it is persisted. */
export const SkillImportDraft = z.object({
  name: z.string(),
  description: z.string(),
  type: SkillType,
  body: z.string(),
  /** Files present in an uploaded archive that were NOT read or executed. */
  ignored_files: z.array(z.string()),
});
export type SkillImportDraft = z.infer<typeof SkillImportDraft>;

export const SkillStatAgent = z.object({
  id: z.string(),
  name: z.string(),
});
export type SkillStatAgent = z.infer<typeof SkillStatAgent>;

export const SkillCategoryCount = z.object({
  category: z.string(),
  count: z.number().int(),
});
export type SkillCategoryCount = z.infer<typeof SkillCategoryCount>;

export const SkillStats = z.object({
  used_by: z.array(SkillStatAgent),
  findings_30d: z.number().int(),
  accepted_30d: z.number().int(),
  /** null when there is nothing to compute a rate from. */
  accept_rate: z.number().min(0).max(100).nullable(),
  by_category: z.array(SkillCategoryCount),
});
export type SkillStats = z.infer<typeof SkillStats>;

// ---- Conventions ----
/** Dimension of code style a rule belongs to. Caps per category keep the
 *  candidate list from collapsing into eight variations of one rule. */
export const ConventionCategory = z.enum([
  'naming',
  'structure',
  'error-handling',
  'async',
  'testing',
  'api',
  'imports',
  'security',
  'other',
]);
export type ConventionCategory = z.infer<typeof ConventionCategory>;

export const ConventionStatus = z.enum(['pending', 'accepted', 'rejected']);
export type ConventionStatus = z.infer<typeof ConventionStatus>;

/** `config` — derived deterministically from eslint/tsconfig/prettier, no model
 *  involved. `model` — proposed by the LLM and mechanically verified afterwards. */
export const ConventionOrigin = z.enum(['config', 'model']);
export type ConventionOrigin = z.infer<typeof ConventionOrigin>;

export const ConventionCandidate = z.object({
  id: z.string(),
  category: ConventionCategory,
  rule: z.string(),
  evidence_path: z.string(),
  evidence_line: z.number().int(),
  evidence_end_line: z.number().int(),
  evidence_snippet: z.string(),
  /**
   * MEASURED confidence — support/(support+violations) counted by grep over the
   * clone, or 1 for `config` rules. Never the model's self-report, which is
   * kept separately as `model_confidence` and is not surfaced in the UI.
   */
  confidence: z.number().min(0).max(1),
  model_confidence: z.number().min(0).max(1).nullable(),
  support: z.number().int(),
  violations: z.number().int(),
  origin: ConventionOrigin,
  status: ConventionStatus,
  /** Set once the candidate has been baked into a skill — it is then never re-proposed. */
  skill_id: z.string().nullable(),
});
export type ConventionCandidate = z.infer<typeof ConventionCandidate>;

export const ConventionScanStatus = z.enum(['queued', 'running', 'done', 'failed']);
export type ConventionScanStatus = z.infer<typeof ConventionScanStatus>;

export const ConventionScan = z.object({
  id: z.string(),
  repo_id: z.string(),
  status: ConventionScanStatus,
  sample_files: z.number().int(),
  candidates_raw: z.number().int(),
  candidates_kept: z.number().int(),
  model: z.string().nullable(),
  cost_usd: z.number().nullable(),
  error: z.string().nullable(),
  created_at: z.string(),
  finished_at: z.string().nullable(),
});
export type ConventionScan = z.infer<typeof ConventionScan>;

export const ConventionsPage = z.object({
  /** `null` before the repo has ever been scanned. */
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsPage = z.infer<typeof ConventionsPage>;

/** Deterministically assembled skill draft — no model call builds this. */
export const ConventionSkillDraft = z.object({
  name: z.string(),
  description: z.string(),
  body: z.string(),
  evidence_files: z.array(z.string()),
  convention_ids: z.array(z.string()),
  /**
   * The category this draft was grouped by, or `null` when it merges several
   * singleton categories into one general skill. Additive: the legacy
   * singular-draft route always returns `null` here.
   */
  category: ConventionCategory.nullable(),
});
export type ConventionSkillDraft = z.infer<typeof ConventionSkillDraft>;

/** One draft per (grouped) category — the multi-skill preview response. */
export const ConventionSkillDraftSet = z.object({
  drafts: z.array(ConventionSkillDraft),
});
export type ConventionSkillDraftSet = z.infer<typeof ConventionSkillDraftSet>;

/** The skills actually created from a multi-draft submission. */
export const ConventionSkillsResult = z.object({
  skills: z.array(Skill),
});
export type ConventionSkillsResult = z.infer<typeof ConventionSkillsResult>;

// ---- Agents ----
// 'openrouter' routes through the OpenAI-compatible API (OpenAIProvider with a
// custom baseURL) — used by the CI runner for cheap models (DeepSeek/GLM/MiniMax).
export const Provider = z.enum(['openai', 'anthropic', 'openrouter']);
export type Provider = z.infer<typeof Provider>;

// Review execution strategy (matches @devdigest/reviewer-core's ReviewStrategy):
//  - single-pass: send the WHOLE diff in ONE model call (default)
//  - map-reduce:  one model call PER changed file (for very large diffs)
//  - auto:        single-pass, switching to map-reduce when the diff is large
export const ReviewStrategy = z.enum(['single-pass', 'map-reduce', 'auto']);
export type ReviewStrategy = z.infer<typeof ReviewStrategy>;

// CI gate policy — when a review should BLOCK (REQUEST_CHANGES + fail the check)
// vs just comment. Deterministic from finding severities, NOT the model's verdict:
//  - never:    never block, always comment (advisory only)
//  - critical: block iff >=1 CRITICAL finding (default)
//  - warning:  block iff >=1 WARNING or CRITICAL finding
//  - any:      block iff >=1 finding of any severity
export const CiFailOn = z.enum(['never', 'critical', 'warning', 'any']);
export type CiFailOn = z.infer<typeof CiFailOn>;

export const Agent = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string(),
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  enabled: z.boolean(),
  version: z.number().int(),
  strategy: ReviewStrategy.default('single-pass'),
  ci_fail_on: CiFailOn.default('critical'),
  // Inject repo-intel context (repo skeleton + callers + rank note) into this
  // agent's review prompt. Default on; gated again by the global flag.
  repo_intel: z.boolean().default(true),
});
export type Agent = z.infer<typeof Agent>;

export const AgentSkillLink = z.object({
  agent_id: z.string(),
  skill_id: z.string(),
  order: z.number().int(),
  enabled: z.boolean(),
});
export type AgentSkillLink = z.infer<typeof AgentSkillLink>;

// The immutable config snapshot captured in `agent_versions` whenever an agent's
// config changes (everything but `enabled`). Mirrors the shape written by the
// agents repository — provider/model/prompt/output_schema/strategy/gate/repo_intel
// plus the ordered skill ids linked at snapshot time. Used for reproducibility
// (eval replays a past version) and for surfacing an agent's edit history.
export const AgentVersionConfig = z.object({
  provider: Provider,
  model: z.string(),
  system_prompt: z.string(),
  output_schema: z.unknown().nullish(),
  strategy: ReviewStrategy,
  ci_fail_on: CiFailOn,
  repo_intel: z.boolean(),
  skills: z.array(z.string()),
});
export type AgentVersionConfig = z.infer<typeof AgentVersionConfig>;

export const AgentVersion = z.object({
  agent_id: z.string(),
  version: z.number().int(),
  config: AgentVersionConfig,
  created_at: z.string(),
});
export type AgentVersion = z.infer<typeof AgentVersion>;
