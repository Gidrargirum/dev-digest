/**
 * Skill bodies, the community-skills catalog, and the two skill-aware reviewer
 * prompts used by the seed.
 *
 * These mirror the style of `seed-prompts.ts`: plain exported markdown
 * template-string constants. Editing a body here only affects freshly seeded
 * workspaces — the DB row is the source of truth at run time.
 */

export const TEST_QUALITY_RUBRIC_BODY = `# Test quality rubric

Evaluate TEST CODE changed or added in this diff. Ignore production code
except to check whether it is actually exercised by the tests.

## Coverage of branches
- Flag when a new or changed function has a conditional branch (if/else,
  switch, ternary, \`&&\`/\`||\` short-circuit) with no corresponding test
  exercising the false/error path.
- Flag a new error-handling branch (catch block, early return on invalid
  input) that has no test asserting the error case.

## Missing edge cases
- Flag when a function that accepts a collection, string, or number has no
  test for the empty/zero-length input.
- Flag when a function has no test for \`null\`/\`undefined\` on an optional
  argument it explicitly handles.
- Flag when a function has an obvious boundary (min, max, off-by-one) with no
  test at or near that boundary.

## Happy-path-only tests
- Flag a test file where every test asserts only the success case and none
  assert a failure, rejection, or validation error — for code that clearly has
  failure modes.

## Over-mocking
- Flag when a test mocks so much of the unit under test that the assertion no
  longer exercises real logic (e.g. mocking the function's own return value,
  or stubbing out the only branching logic being tested).
- Flag mocks that assert only "was called" without asserting on the arguments
  or the resulting behavior.

## Flaky patterns
- Flag \`setTimeout\`/\`sleep\`-based waits instead of awaiting a real promise or
  a polling/retry helper.
- Flag unseeded \`Math.random()\` or \`Date.now()\` used inside an assertion
  without freezing/mocking time.
- Flag tests that depend on execution order or on shared mutable state left
  over from a previous test.`;

export const API_CONTRACT_BREAKING_CHANGE_BODY = `# API contract breaking-change rubric

Evaluate whether this diff changes the PUBLIC CONTRACT of an existing route
or exported API handler in a way that breaks existing callers.

## Route signature
- Flag any change to an existing route's path, HTTP method, or set of
  required path/query parameters.
- Flag a previously optional parameter becoming required.

## Request shape
- Flag a request field being removed, renamed, or having its required/optional
  status narrowed (optional → required) on an existing endpoint.
- Flag validation being narrowed (stricter format, smaller enum, tighter
  bounds) in a way that would reject previously-valid input.

## Response shape
- Flag a response field being removed or renamed.
- Flag a response field's type changing (e.g. string → number, single value →
  array) on an existing endpoint.
- Flag a nullable field becoming non-nullable or vice versa where callers may
  depend on the old behavior.

## Status codes & enums
- Flag a status code changing for an existing success or error condition
  (e.g. 200 → 201, 404 → 400).
- Flag an enum value being removed from a request or response field that
  existing callers may send or depend on.

## Exemptions
- Flag any modification to an existing exported route handler's request or
  response shape as a potential breaking change UNLESS the diff also bumps a
  version marker (e.g. \`/v2/\`, a version header/field) or adds a
  backward-compatible default that preserves the old behavior for callers who
  don't opt in.
- A brand-new route or a field being ADDED (not removed/renamed/narrowed) is
  not a breaking change — do not flag additive changes.`;

export const NO_THEN_CHAINS_BODY = `# No .then() chains

Prefer \`async/await\` over \`.then()\`/\`.catch()\` promise chains in all
TypeScript/JavaScript source.

- Flag any new or changed \`.then(\` call on a promise where the enclosing
  function could instead \`await\` the value.
- Flag chained \`.then().then()\` sequences — rewrite as sequential \`await\`
  statements.
- Flag \`.catch()\` used for control flow where a \`try/catch\` around an
  \`await\` would be clearer.
- Exempt: fire-and-forget calls where the promise is intentionally not
  awaited (e.g. background logging) and top-level \`.catch()\` on an
  intentionally unawaited promise.`;

export const SECRET_LEAKAGE_GATE_BODY = `# Secret leakage gate

Scan the diff's added/changed lines for hardcoded secrets, tokens, and API
keys that should never be committed.

## Patterns to flag
- Stripe-style live keys: \`sk_live_...\`, \`rk_live_...\`.
- Generic assignment patterns: \`api_key =\`, \`apiKey:\`, \`secret =\`,
  \`token =\` followed by a literal string (not \`process.env...\`).
- Supabase/service-role style: \`service_role\`, \`SUPABASE_SERVICE_ROLE_KEY\`
  assigned a literal value.
- Next.js public-env misuse: \`NEXT_PUBLIC_.*_SECRET\` or
  \`NEXT_PUBLIC_.*_KEY\` — a secret exposed to the browser bundle by name alone.
- AWS-style access keys: \`AKIA[0-9A-Z]{16}\`, or a literal paired with
  \`aws_secret_access_key\`.
- Private key material: \`-----BEGIN PRIVATE KEY-----\` or similar PEM blocks.

## Rule
- Flag ANY literal string matching these patterns in source, config, test
  fixtures, or committed \`.env\` files — severity CRITICAL regardless of
  whether the key looks like a placeholder, unless it is an obviously fake
  example (e.g. \`sk_live_xxxxxxxxxxxx\`, all-x or all-0 placeholder).
- Always suggest moving the value to an environment variable read through the
  project's secrets mechanism and rotating the key.`;

export const PR_QUALITY_RUBRIC_BODY = `# PR quality rubric

Evaluate the overall quality of this pull request across four dimensions.
Return a finding only when the issue is worth the author's time — aim for a
handful of high-signal findings, not an exhaustive list. Silence on a
dimension means it looked fine.

## Correctness
- Does the diff do what the PR description claims?
- Are there logic errors, unhandled edge cases, or incorrect assumptions
  about inputs introduced by this change?

## Security
- Does the diff introduce an obvious injection, access-control, or
  secret-handling issue? (Defer to a dedicated security skill for depth —
  here, only flag the clear cases.)

## Tests
- Does new behavior have a corresponding test?
- Do existing tests still cover the changed code path, or were they weakened
  (assertions removed/loosened) to make the diff pass?

## Scope
- Is the diff focused on what the title/description says, or does it bundle
  unrelated refactors that make the change harder to review?
- Is anything conspicuously missing given the stated goal (e.g. a migration
  without a corresponding schema change, a new field without validation)?

## Discipline
- Return only DISTINCT, high-signal findings — do not pad the list toward a
  target count. Zero findings is a valid, good outcome for a clean PR.`;

export interface SeedSkillDef {
  name: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  source: 'manual' | 'imported_url' | 'extracted' | 'community';
  body: string;
  enabled: boolean;
}

export const SEED_SKILLS: SeedSkillDef[] = [
  {
    name: 'pr-quality-rubric',
    description: 'Rubric for evaluating overall PR quality across correctness, tests, and clarity.',
    type: 'rubric',
    source: 'manual',
    body: PR_QUALITY_RUBRIC_BODY,
    enabled: true,
  },
  {
    name: 'test-quality-rubric',
    description: 'Flags untested branches, missing edge cases, over-mocking, and flaky test patterns.',
    type: 'rubric',
    source: 'manual',
    body: TEST_QUALITY_RUBRIC_BODY,
    enabled: true,
  },
  {
    name: 'api-contract-breaking-change',
    description:
      'Detects breaking changes to route signatures, request/response shapes, and status codes.',
    type: 'custom',
    source: 'manual',
    body: API_CONTRACT_BREAKING_CHANGE_BODY,
    enabled: true,
  },
  {
    name: 'no-then-chains',
    description: 'House rule: always use async/await instead of .then() promise chains.',
    type: 'convention',
    source: 'extracted',
    body: NO_THEN_CHAINS_BODY,
    enabled: true,
  },
  {
    name: 'secret-leakage-gate',
    description: 'Detects sk_live, service_role, and other hardcoded secret patterns in the diff.',
    type: 'security',
    source: 'community',
    body: SECRET_LEAKAGE_GATE_BODY,
    enabled: true,
  },
];

export interface SeedCommunitySkillDef {
  name: string;
  repo: string;
  stars: number;
  lang: string;
  description: string;
  type: 'rubric' | 'convention' | 'security' | 'custom';
  body: string;
}

export const SEED_COMMUNITY_SKILLS: SeedCommunitySkillDef[] = [
  {
    name: 'owasp-top-10-review',
    repo: 'secdev/agent-skills',
    stars: 1240,
    lang: 'any',
    description: 'Maps diff changes to the OWASP Top 10 with CWE references.',
    type: 'security',
    body: `# OWASP Top 10 review

Map each change in the diff to the relevant OWASP Top 10 category and cite the
CWE where applicable.

- A01 Broken Access Control (CWE-284, CWE-639) — missing authz checks, IDOR.
- A02 Cryptographic Failures (CWE-327, CWE-798) — weak/missing crypto, hardcoded keys.
- A03 Injection (CWE-89, CWE-78) — SQL/NoSQL, command, template injection.
- A04 Insecure Design (CWE-841) — missing rate limiting, no threat boundary.
- A05 Security Misconfiguration (CWE-16) — debug mode, permissive CORS/headers.
- A06 Vulnerable Components (CWE-1104) — outdated/known-CVE dependencies.
- A07 Auth Failures (CWE-287) — weak session handling, broken password flows.
- A08 Data Integrity Failures (CWE-502) — insecure deserialization.
- A09 Logging Failures (CWE-778) — no audit trail, secrets logged.
- A10 SSRF (CWE-918) — server-side request forgery via user-controlled URL.

Flag only categories with a concrete match in the diff; cite file:line and the
CWE number for each finding.`,
  },
  {
    name: 'react-hooks-rules',
    repo: 'frontend-guild/skills',
    stars: 842,
    lang: 'TypeScript',
    description: 'Detects conditional hooks, missing deps, stale closures.',
    type: 'convention',
    body: `# React hooks rules

Check every changed React component/hook for the Rules of Hooks and common
dependency-array mistakes.

- Flag a hook (\`useState\`, \`useEffect\`, \`useMemo\`, ...) called conditionally,
  inside a loop, or after an early return.
- Flag a \`useEffect\`/\`useMemo\`/\`useCallback\` dependency array missing a value
  referenced in its body (stale closure risk).
- Flag a dependency array with a value that changes identity every render
  (inline object/array/function) without memoization, causing the effect to
  re-run every render.
- Flag a custom hook name not prefixed with \`use\`.`,
  },
  {
    name: 'sql-injection-gate',
    repo: 'secdev/agent-skills',
    stars: 690,
    lang: 'any',
    description: 'Flags string-concatenated SQL and unparameterized queries.',
    type: 'security',
    body: `# SQL injection gate

Scan the diff for query construction that is not parameterized.

- Flag any SQL string built via \`+\`, template-literal interpolation, or
  \`.concat()\` where a variable is spliced directly into the query text.
- Flag raw query execution (\`db.raw\`, \`db.execute(sql\`...\`)\` style) that
  interpolates a request-derived value instead of using a bound parameter.
- Do not flag values passed through the query builder's own parameter
  binding (e.g. Drizzle's \`sql\`\${value}\`\` tagged template, \`eq()\`, \`inArray()\`).
- Always suggest the parameterized equivalent in the fix.`,
  },
  {
    name: 'a11y-jsx-audit',
    repo: 'a11y-collective/skills',
    stars: 318,
    lang: 'TypeScript',
    description: 'Checks JSX for missing alt text, ARIA, and focus traps.',
    type: 'custom',
    body: `# A11y JSX audit

Check changed JSX for accessibility regressions.

- Flag an \`<img>\` with no \`alt\` attribute (or a non-empty \`alt\` missing on a
  meaningful image).
- Flag an interactive element built from a non-interactive tag (\`<div>\`,
  \`<span>\` with an \`onClick\`) with no \`role\` and no keyboard handler.
- Flag a modal/dialog that opens without moving focus into it or trapping tab
  order.
- Flag a form control with no associated \`<label>\` or \`aria-label\`.
- Flag color-only signaling (e.g. red text with no icon/label) for
  error/success state.`,
  },
];

export const TEST_QUALITY_REVIEWER_PROMPT = `# Role
You are a test-quality reviewer. Focus ONLY on test code changes in this diff —
coverage of new branches, missing edge cases, over-mocking, and flaky patterns.
Do not comment on production code quality outside of what is or isn't tested.

# What to check
- Every new or changed conditional branch, error path, and boundary condition
  in the production code has a corresponding test.
- New tests cover empty/null/boundary inputs, not only the happy path.
- Mocks are not so heavy they hide the real behavior under test.
- No time-based waits, unseeded randomness, or order-dependent tests were
  introduced.

# Severity
- **CRITICAL** — a new function with non-trivial branching logic (auth checks,
  payment/data-mutating paths) has NO test at all.
- **WARNING** — a real but non-blocking test gap: an untested edge case or
  error path, over-mocking that weakens the assertion.
- **SUGGESTION** — a minor test-hygiene nit.

# Verdict
- **request_changes** — at least one CRITICAL finding.
- **comment** — only WARNING/SUGGESTION findings.
- **approve** — test coverage for this diff looks solid: empty findings list.

# Findings discipline
Report only DISTINCT issues, cite an exact file and line range, and do not pad
the list toward a target count. If the diff has no test changes and no
production changes that obviously need new tests, approve with an empty list.`;

export const API_CONTRACT_REVIEWER_PROMPT = `# Role
You are an API contract reviewer. Focus ONLY on whether this diff changes any
EXISTING route's public contract in a breaking way — signature, required
params, request/response shape, or status codes. Do not review unrelated
correctness, performance, or style issues.

# What to check
- Route path, method, or required-parameter changes on an existing endpoint.
- Request/response fields removed, renamed, or retyped.
- Optional fields becoming required, or validation narrowed in a way that
  rejects previously-valid input.
- Status codes changing for an existing success/error condition.
- Enum values removed from a request or response field.

# Exemptions
- A brand-new route, or a field being purely ADDED, is not a breaking change.
- A change guarded by a version marker (e.g. \`/v2/\`) or a backward-compatible
  default is not breaking — note the mitigation instead of flagging it.

# Severity
- **CRITICAL** — an existing caller's request or response handling will break
  with no migration path.
- **WARNING** — a contract narrowing that is technically breaking but affects
  an unlikely input, or lacks a version bump though one may not be needed yet.
- **SUGGESTION** — a contract change that is safe today but worth flagging for
  documentation/versioning hygiene.

# Verdict
- **request_changes** — at least one CRITICAL finding.
- **comment** — only WARNING/SUGGESTION findings.
- **approve** — no contract-breaking change found: empty findings list.

# Findings discipline
Report only DISTINCT issues, cite an exact file and line range, and do not pad
the list toward a target count. If the diff touches no existing route
contract, approve with an empty list.`;
