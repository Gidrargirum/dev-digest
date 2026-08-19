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

export const API_CONTRACT_RESPONSE_SCHEMA_BODY = `# API contract — response schema

Evaluate whether this diff changes the SHAPE of an existing API response body
in a way that breaks existing callers. Scope is response body shape only.

This skill does **not** cover the route path, HTTP method, request body,
query/path parameters, or status codes — that's \`api-contract-breaking-change\`.
It does **not** cover whether a breaking change requires a semver/version bump
— that's \`api-contract-semver-discipline\`. It does **not** cover how long an
old shape must stay supported before removal — that's
\`api-contract-deprecation-policy\`. Don't duplicate those rubrics here; only
judge the shape of the response payload itself.

## Field removal and rename

- Flag any response field being removed from an existing endpoint's payload.
- Flag any response field being renamed — this is indistinguishable from a
  removal-plus-addition to a caller reading the old name.
- Flag a field moving from the top level into a nested object (or vice versa)
  under a new or different key — callers keying off the old path break even
  though the value still exists somewhere in the payload.

## Type changes

- Flag a response field's type changing (e.g. \`string\` → \`number\`,
  \`boolean\` → \`string\`, \`number\` → \`string\`).
- Flag a scalar field becoming an object or array, or an object/array field
  becoming a scalar (e.g. \`tags: string\` → \`tags: string[]\`, or
  \`address: Address\` → \`address: string\`).
- Flag a previously single-object field becoming an array of that object, or
  an array field collapsing to a single object — both break callers that
  assume the old cardinality (\`.map()\` on a value that's no longer an array,
  or direct property access on a value that's now an array).

## Nullability and optionality

- Flag a nullable/optional response field becoming non-nullable/required, or
  the reverse, where existing callers may branch on \`null\`/\`undefined\` (e.g.
  a null-check that becomes dead code, or a consumer that never expected
  \`null\` and now receives it).
- Flag a field that was always present becoming conditionally omitted
  (\`undefined\`) based on new server-side logic — strict/typed clients that
  assume the field always exists will fail to deserialize.
- Flag a previously optional response field being marked as always present
  going forward if any existing code path can still omit it — the type
  promise and the runtime behavior must match.

## Enums and constrained values

- Flag an enum value being removed from a response field that existing
  callers may already be switching/mapping on (narrowing the value space is
  breaking even though it looks like "fewer cases to handle").
- Flag an enum field's value casing or format changing (e.g. \`"ACTIVE"\` →
  \`"active"\`) — string comparisons in calling code will silently stop
  matching.

## Nested structure changes

- Flag a nested object's internal structure being flattened, restructured, or
  having a sub-field relocated to a different parent (e.g.
  \`user.address.city\` → \`user.city\`, or \`user: { name, email }\` → separate
  \`userName\`/\`userEmail\` top-level fields).
- Flag a previously flat set of fields being wrapped in a new nested object
  with no corresponding top-level fallback.

## Pagination and envelope changes

- Flag a paginated response's wrapper/envelope key changing (e.g.
  \`items\` → \`data\`, \`results\` → \`records\`) — this breaks every consumer
  unwrapping the old key.
- Flag the cursor or pagination-token format changing (e.g. an offset integer
  becoming an opaque base64 cursor, or a \`nextPage\` number becoming a
  \`nextCursor\` string) — clients that persist or construct these values break.
- Flag the total-count or has-more-pages field being removed, renamed, or
  changed from a boolean to a different signal.

## Error-response shape

- Flag an error response's shape changing — a field on the error object
  being renamed or removed (e.g. \`error.message\` → \`error.detail\`,
  \`error.code\` disappearing) — error-handling code that reads specific
  fields for user-facing messages or programmatic branching breaks silently.
- Flag the overall error envelope changing (e.g. a bare error object becoming
  wrapped in \`{ error: {...} }\`, or vice versa).

## Date and number format changes

- Flag a date/timestamp field's format changing (e.g. ISO 8601 string →
  Unix epoch number, or seconds-since-epoch → milliseconds-since-epoch)
  without an additive compatibility field — typed clients that parse the
  old format will throw or silently produce \`Invalid Date\`/\`NaN\`.
- Flag a numeric field's precision or units changing (e.g. cents → dollars,
  integer → float) without a rename that makes the new unit unambiguous.

## Exemptions

- A new field being purely ADDED to an existing response is not a breaking
  change — do not flag additive fields, even if they change the response's
  overall size or nesting depth, as long as every previously-existing field
  keeps its name, type, and nullability.
- A field being added to an error response purely for extra debugging/context
  (with existing error fields untouched) is not a breaking change.
- A shape change gated behind a version marker (e.g. a route under \`/v2/\`) or
  behind content negotiation (a different \`Accept\` header or a
  \`Content-Type\` variant) is not breaking on its own merit — the old shape
  must still be reachable through the old route/negotiation path unchanged.

## Examples

**Bad**

\`\`\`diff
 interface OrderResponse {
   id: string;
-  createdAt: string; // ISO 8601, e.g. "2026-08-14T10:00:00Z"
+  createdAt: number; // unix epoch ms
   total: number;
 }
\`\`\`

The field name and type promise are unchanged from the caller's point of
view (\`createdAt\` was always a JS "date"), but the wire format silently
flips from an ISO string to an epoch number. Any client calling \`new
Date(createdAt)\` on the old format now gets a nonsensical date, and strict
JSON-schema/typed deserializers that pinned \`string\` will fail outright with
no version marker to signal the change.

**Good**

\`\`\`diff
 interface OrderResponse {
   id: string;
   createdAt: string; // ISO 8601, unchanged
+  createdAtEpoch: number; // unix epoch ms, new field for clients that want it
   total: number;
 }
\`\`\`

The existing \`createdAt\` field keeps its name, type, and format, so no
existing caller breaks. Clients that want the epoch format can adopt the new
\`createdAtEpoch\` field at their own pace — this is a pure additive change.

## Findings discipline

Cite the exact \`file:line\` of the changed response type, serializer, or
schema. Use severity **CRITICAL** when a typed or strict client would fail to
deserialize the new shape or would silently misinterpret it (wrong type,
wrong format, renamed/removed field with no fallback). Use severity
**WARNING** when the change is real but only affects an edge case, an
undocumented/internal field, or loosely-typed consumers that read the
payload dynamically without a schema.`;

export const API_CONTRACT_SEMVER_DISCIPLINE_BODY = `# API contract — semver discipline

This skill assumes a breaking change may already be present in the diff —
either found directly by inspection, or flagged by a sibling skill
(**api-contract-breaking-change** for route/request/status-code breaks,
**api-contract-response-schema** for response body shape breaks). Its job is
not to re-detect the break. It checks whether the diff's *version story* is
honest: does a breaking change carry a major bump / new version path/header,
or does it merge into an existing version as if nothing changed. Deprecation
windows ahead of removal are a separate concern — see
**api-contract-deprecation-policy**.

## Bump rules

| Change type | Requirement |
|---|---|
| Backward-incompatible change to an existing, already-released endpoint's contract (removed/renamed field, narrowed validation, changed status code, changed type) | MAJOR required — new version path (\`/v2/\`) or version header bump; merging it under the unchanged version is non-compliant |
| Purely additive change (new optional field, new endpoint, new optional query param) | MINOR-safe — no major bump needed |
| Bug fix that restores documented behavior, or an internal-only change with zero observable contract change | PATCH-safe — no major bump needed |

## Silent breaks

- Flag a breaking change (as found directly, or per api-contract-breaking-change /
  api-contract-response-schema) merged with no accompanying new version
  path/header and no deprecation window.
- Flag a breaking change applied in place to an existing versioned route
  (e.g. editing \`/v1/orders\` handler directly) instead of introducing the
  change under a new version.

## New-version correctness

- Flag a new \`/v2/\`-style route (or version-header value) introduced that is
  documented or described as a compatible replacement path but is not
  actually a strict superset-compatible replacement — i.e. it silently drops
  or narrows something the old version supported without calling that out.
- Flag a new version path that does not coexist with the old one at all when
  the PR claims backward compatibility is preserved.

## Bump hygiene

- Flag (SUGGESTION only, not a blocker) a version bump in name only — e.g. a
  route renamed to \`/v2/\` whose request/response contract is byte-identical
  to \`/v1/\` — this wastes a version bump and misleads consumers into
  expecting a change.
- Flag multiple unrelated breaking changes bundled into a single version bump
  without each one being called out individually in the PR
  description/changelog — reviewers and consumers should be able to see what
  actually changed under the new version, not just that "something" did.

## Exemptions

- Routes explicitly marked unstable/experimental (e.g. under a \`/beta/\`
  prefix, or gated behind an \`x-experimental\` header/flag) are exempt from
  strict semver discipline — breaking them without a version bump is
  allowed. Still flag as SUGGESTION if the PR gives no note at all about the
  break, since even experimental consumers benefit from a heads-up.
- Internal-only endpoints not exposed to external consumers may be exempted
  case-by-case. Recognize these by an internal routing prefix (e.g.
  \`/internal/\`, \`/_internal/\`), absence from any public SDK or published
  OpenAPI/contract document, or explicit code comments/route metadata marking
  the endpoint internal-only. When in doubt whether an endpoint is truly
  internal, do not assume exemption — treat it as public and apply the bump
  rules above.

## Examples

**Bad**
\`\`\`
- DELETE-able field: \`discountCode\` removed from the response of
  \`PATCH /api/orders/:id\`
- Route path unchanged: still \`/api/orders/:id\`
- No API-Version header change, no /v2/ path
- PR description: "cleaned up unused order fields"
\`\`\`
This is a MAJOR-worthy break (removed response field on a released endpoint)
shipped with zero version signal. Existing consumers reading \`discountCode\`
break with no warning and no migration path.

**Good**
\`\`\`
- \`discountCode\` removed from the response, but only under the new route:
  \`PATCH /api/v2/orders/:id\`
- \`PATCH /api/v1/orders/:id\` unchanged, still returns \`discountCode\`
- PR description: "v2: drops deprecated discountCode field per
  api-contract-deprecation-policy notice from 2026-06-01"
\`\`\`
The break exists only behind a new version path; the old version keeps
working for existing callers, and the changelog names the specific
breaking change instead of burying it in a generic bump.

## Findings discipline

- Cite the exact file:line of the changed route/handler/schema and, where
  applicable, the line introducing or omitting the version signal.
- Severity CRITICAL: a breaking change ships with no version signal at
  all (no new path, no header bump, no deprecation note).
- Severity WARNING: a version signal exists but is incomplete — e.g. a new
  version path was added but the old path was removed instead of kept
  alongside it, or the changelog bundles multiple breaks under one bump
  without itemizing them.
- Severity SUGGESTION: pure hygiene issues — an unnecessary/no-op version
  bump, or a version note that is undocumented but does not affect any
  actual break.`;

export const API_CONTRACT_DEPRECATION_POLICY_BODY = `# API contract — deprecation policy

Evaluate whether a PUBLIC API element being removed, replaced, or changed in
this diff went through a proper deprecation cycle — or whether it was
silently removed with no warning trail.

## Scope

This skill judges **process**, not mechanics: was the removal/change of a
route, field, enum value, header, or param preceded by a deprecation
marker, an announced replacement, and a sunset window — or is a new
deprecation being introduced correctly. It does not judge whether the
underlying change is technically breaking (that's
\`api-contract-breaking-change\`), whether a response body's shape changed
(that's \`api-contract-response-schema\`), or whether the package/API version
was bumped correctly (that's \`api-contract-semver-discipline\`). Assume the
change under review already qualifies as a removal or behavior change of a
public element — this skill only asks: was it deprecated first?

## What counts as a deprecation marker

Treat any of the following, found anywhere in the diff or the linked
changelog/migration guide, as valid evidence of prior deprecation:

- An \`@deprecated\` JSDoc/docstring tag that states a reason and points to the
  replacement.
- A \`Deprecation\` or \`Sunset\` HTTP response header (RFC 8594) present on the
  endpoint.
- An explicit entry in a CHANGELOG or migration guide announcing the
  deprecation.
- A runtime warning surfaced to callers — a deprecation log line or a
  warning field in the response body.

Absence of all four is absence of a deprecation trail.

## Flag missing deprecation trail on removal

- Flag any route, field, enum value, header, or param being REMOVED in this
  diff when the diff and the linked changelog show no evidence it was
  previously marked deprecated by any of the markers above.
- Flag a removal that references "deprecated" in a commit message or PR
  description only, with no marker actually present in a prior release's
  code, headers, or changelog — talk is not a deprecation trail.

## Flag incomplete new deprecations

- Flag a NEW deprecation being introduced in this diff (a route, field, or
  param newly marked \`@deprecated\`, or a new \`Deprecation\` header) that has
  no replacement or migration pointer explaining what callers should use
  instead.
- Flag a deprecation marker with no sunset date or target version at all —
  open-ended deprecation with no removal target is a smell, not a blocker;
  file it as SUGGESTION severity, not CRITICAL/WARNING.

## Flag behavior changes to already-deprecated elements

- Flag any silent behavior change (new validation, different response
  shape, changed default) to something already marked deprecated in a prior
  release. Deprecated elements should be frozen except for security fixes —
  changing them resets the clock and confuses callers who are mid-migration.

## Flag early removal

- Flag a removal happening sooner than the sunset window the deprecation
  itself stated — e.g. marked deprecated with "removal in v3" but actually
  removed in this diff while the package is still on v2.

## Exemptions

- Removing something that was NEVER released publicly (still pre-release,
  beta, or internal-only, or added and removed within the same unreleased
  version) does not need a deprecation cycle — do not flag it.
- Security-critical removals (e.g. an endpoint tied to an active
  vulnerability) may bypass the normal sunset window. Still flag these, but
  at SUGGESTION severity, to confirm the exception is documented and
  affected callers are notified out-of-band.

## Examples

**Bad**
\`\`\`
- app.delete('/api/users/:id/legacy-profile', legacyProfileHandler)
\`\`\`
The route \`/api/users/:id/legacy-profile\` is deleted outright in this diff.
No \`@deprecated\` marker, \`Deprecation\`/\`Sunset\` header, or changelog entry
exists anywhere in the repo history for this route — callers had zero
warning. Flag as CRITICAL.

**Good**
\`\`\`
// v1.4.0 (prior release):
/**
 * @deprecated since v1.4.0, removed in v2.0.0. Use GET /api/users/:id?include=profile instead.
 */
app.get('/api/users/:id/legacy-profile', legacyProfileHandler, {
  headers: { Deprecation: 'true', Sunset: 'Wed, 01 Jan 2026 00:00:00 GMT' },
})

// this diff (v2.0.0, after the sunset date):
- app.get('/api/users/:id/legacy-profile', legacyProfileHandler, { ... })
+ // CHANGELOG.md: "Removed /legacy-profile per the v1.4.0 deprecation notice."
\`\`\`
The route was marked deprecated two releases ago with a stated replacement
and sunset date, and this diff removes it only after that date has passed,
with a changelog entry documenting the removal. No flag.

## Findings discipline

- Cite the exact file:line of the removal or the new deprecation marker.
- Severity CRITICAL: a public element removed or changed with zero
  deprecation trail and no exemption applies.
- Severity WARNING: a deprecation trail exists but is incomplete — missing a
  replacement pointer, or removal happening before the stated sunset window.
- Severity SUGGESTION: hygiene issues only — an open-ended deprecation with
  no sunset date, or an early/undocumented removal that qualifies under an
  exemption but should still be recorded.`;

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
    name: 'api-contract-response-schema',
    description:
      'Detects changes to the SHAPE of an API response body — field removal/rename, type changes, nullability flips, enum narrowing, nested structure and pagination-envelope changes.',
    type: 'custom',
    source: 'manual',
    body: API_CONTRACT_RESPONSE_SCHEMA_BODY,
    enabled: true,
  },
  {
    name: 'api-contract-semver-discipline',
    description:
      'Evaluates whether a breaking API change correctly reflects a major version bump (new version path / API-Version header) instead of shipping silently under an unchanged version.',
    type: 'custom',
    source: 'manual',
    body: API_CONTRACT_SEMVER_DISCIPLINE_BODY,
    enabled: true,
  },
  {
    name: 'api-contract-deprecation-policy',
    description:
      'Detects whether a public API element being removed or changed went through a proper deprecation cycle — marked, announced, given a migration path and a sunset window.',
    type: 'custom',
    source: 'manual',
    body: API_CONTRACT_DEPRECATION_POLICY_BODY,
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
