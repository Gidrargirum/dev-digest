# PR intent layer

A per-PR intent — a one-sentence purpose, `in_scope[]`, `out_of_scope[]`,
`risk_areas[]`, `confidence`, and the `sources[]` that fed it — derived once
per `(pr_id, head_sha)` before the main code review, passed to the review
prompt as context, and shown as an INTENT card on the Overview tab. Spans
`@devdigest/shared`, `reviewer-core/`, `server/` and `client/`.

## Sources and degradation

Each source degrades independently; a missing source never fails intent
derivation:

| Source | Origin | When absent |
|---|---|---|
| `pr_title` | `pullRequests.title` | never — `NOT NULL` |
| `pr_branch` | `pullRequests.branch` | never — `NOT NULL` |
| `pr_files` | the already-loaded `UnifiedDiff` | a diff-load failure fails the whole review run before intent is reached (unchanged, pre-existing behaviour) |
| `pr_body` | `pullRequests.body` | `null` → the description block is omitted from the intent prompt |
| `issue#N` | GitHub issues linked from `body` via closing keywords or a bare `#N`, up to `MAX_LINKED_ISSUES` | each issue fetch is wrapped individually — one failure **must not** prevent the others from contributing |
| `owner/repo#N (skipped)` | a linked issue in a different repository | recognized but never fetched — the token may lack access to the other repo. It **must** still appear in `sources[]` with the `(skipped)` suffix |

In-repo spec/plan file reading (`spec:<path>`) is gated behind
`INTENT_READ_PLAN_FILES`, default `false`, and is **not implemented** by this
spec — see "Not implemented" below.

## Confidence rubric

`confidence` **must** be computed by code from `sources[]`, never returned by
the LLM — a self-reported confidence from a model reading untrusted PR/issue
text would let that text inflate its own trust:

- only `pr_title` + `pr_branch` + `pr_files` → `low`
- the above, plus a non-empty `pr_body` → `medium`
- the above, plus at least one successfully-fetched `issue#N` → `high`

`confidence` **must** be derivable from `sources[]` alone — no other input may
influence it.

## Cache key and invariants

- The cache key **is** `(pr_id, head_sha)`. The `pr_intent` table's primary key
  is `pr_id`; a new `head_sha` **must** overwrite the row (`onConflictDoUpdate`)
  — intent history is **not** retained.
- A cache hit (`row.head_sha === pull.head_sha`) **must not** trigger an LLM
  call.
- Intent derivation **must never** block or fail a review run. Any error during
  source collection, model call, or persistence **must** be caught; the run
  continues with no intent for that run, and nothing is persisted (the cache is
  never poisoned by a failed attempt).
- Intent **must not** influence `score`, `verdict`, or produce any finding
  category (e.g. no `scope-creep` category exists). It is prompt context only.

## Prompt contract (reviewer-core)

- `ReviewInput.intent` is an optional **resolved string** — never an id or an
  object. Serializing the persisted intent into that string is the server's
  job (`renderIntentForPrompt`), not `reviewer-core`'s.
- When `intent` is omitted or empty, `assemblePrompt` **must** produce byte-
  identical `messages` to a call with no `intent` field at all — the slot is a
  strict addition, not a behaviour change for existing callers.
- When present, the intent section **must** be wrapped as untrusted content
  (the same mechanism as `pr_description`), rendered immediately after
  `## PR description` and before `## Skills / rules`.
- `PromptAssembly.intent` **must** be `null` when the slot wasn't rendered —
  never an empty string.

## Cost attribution

Intent is computed once per set of runs (one review-run request may fan out to
several agents), while `RunStats` (`tokensIn`/`tokensOut`/`costUsd`) is
per-run. To avoid double-counting or losing the cost entirely:

- On a cache **miss**, the intent call's tokens/cost **must** be attributed to
  exactly one run — the first job in the batch (`jobs[0].runId`).
- On a cache **hit**, no run's stats change — the LLM was not called.
- Every other run in the batch **must** show zero intent cost, regardless of
  cache outcome.
- When the model's cost cannot be estimated (`estimateCost` returns `null` for
  an unknown provider/model slug), the cost **must not** be silently dropped:
  `tool_calls.meta` **must** record `cost:unknown` so the gap is visible.

## API contract

`GET /pulls/:id/intent` → `200 PrIntentResponse`:

- `{ intent: null }` when no intent has been computed yet for this PR — **not**
  a `404`. A `404` would make the client's `apiFetch` normalize "not computed
  yet" into an `ApiError`, which this endpoint's callers must not have to
  special-case.
- `{ intent: PrIntentRecord }` otherwise, where `PrIntentRecord` extends the
  core `Intent` contract with `pr_id`, `head_sha`, and `computed_at`.
- There is **no** endpoint to trigger recomputation. Intent is derived only as
  a side effect of `POST /pulls/:id/review`.

## UI contract

- The INTENT card on the Overview tab renders only when `intent !== null` — a
  PR with no computed intent shows no card, not an empty/error state.
- Within the card, an empty `risk_areas[]` **must** suppress the risk-areas
  section entirely — it is not rendered as an empty list.
- Data reaches the card only through `usePrIntent(prId)` in `lib/hooks/*`; the
  types come from `@devdigest/shared`, never redeclared client-side.

## Settings

- `review_intent` has no default provider/model of its own in the
  `FEATURE_MODELS` registry (`FeatureModelDef.inheritsFrom: 'review_agent'`).
  Until a workspace explicitly picks a model for it, the intent call **must**
  use the same provider/model as the review agent running that batch.
- The Settings UI **must** show an explicit "inherits from the review agent"
  state for `review_intent` while unset — never a blank/undefined model value.

## Acceptance

- Running a review on a PR whose body links a resolvable GitHub issue produces
  a `pr_intent` row with `confidence: 'high'`, and `GET /pulls/:id/intent`
  returns it.
- Running a review again on the same `head_sha` does not call the LLM for
  intent a second time; the persisted row is unchanged.
- If the intent LLM call fails, the review run still completes normally and
  `GET /pulls/:id/intent` returns `{ intent: null }`.
- A PR opened against a cross-repo issue (`owner/repo#123`) shows
  `"owner/repo#123 (skipped)"` in `sources[]` and never attempts to fetch that
  issue.

## Not implemented

Reading in-repo spec/plan files as an additional intent source
(`INTENT_READ_PLAN_FILES`, `spec:<path>` sources) is designed but deliberately
disabled — the `high` confidence tier is already reachable through a linked
issue, and leaving the flag off keeps the path-traversal surface (arbitrary
repo file reads driven by PR body text) closed until there is a concrete need
for it. If enabled in the future, this spec **must** be extended with the
allowlist rules (prefix, extension, `..`/absolute-path rejection, size/count
limits) before the flag defaults to `true` in any environment.
