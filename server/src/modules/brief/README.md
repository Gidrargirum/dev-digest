# `modules/brief` — PR Brief

A generated, cached, model-authored `Brief { what, why, risk_level, risks[],
review_focus[] }` for a pull request. Generated **as a side effect of a review
run reaching `done`** — never from a client request — with exactly one
structured `risk_brief` LLM call per `(pr_id, head_sha)`. Normative spec:
`specs/2026-08-28-pr-brief.md`.

## Route

- `POST /pulls/:id/brief` → `PrBriefResponse` (`@devdigest/shared`).
  - No `force`: returns the cached Brief when its `head_sha` matches the PR's
    current `head_sha`, else `200 { brief: null }` — never an implicit
    generation (AC-10 / AC-11).
  - `force: true`: one new LLM call over the same deterministic facts,
    overwrites the row under the current `head_sha`, `run_id: null` (AC-12).
    A failure is a deterministic `5xx { error }` and leaves the cached Brief
    unchanged (AC-13).
  - `:id` not found, or found in a **different** workspace → `404`
    (`NotFoundError`) on **both** paths. This deliberately diverges from
    `GET /pulls/:id/intent`'s `{ intent: null }` convention (decision #3):
    the Brief route has an explicit regenerate path, and answering `200` for a
    PR the caller cannot see would let `force` probe another workspace.

## Layering

- `repository.ts` (infra) — the only file here that imports `db/schema`. Resolves
  `:id` to a workspace-scoped PR (tenancy in the query, mirrors
  `BlastRepository.resolvePr`), reads `pr_files` / `pr_intent` directly (its own
  tables, not another module's repository), upserts `pr_brief`, and holds the
  `pg_advisory_xact_lock(hashtext('pr_brief:<id>'))` that serializes generation
  (AC-7). The lock-scoped `BriefTxRepository` runs the cache re-check + upsert on
  the connection that holds the lock.
- `service.ts` (application) — takes `BriefDeps` (`llm`, `github`, `featureModel`,
  `blast`) + `BriefRepositoryPort`, never the concrete repository or `Container`
  (AC-9). Assembles the input
  from intent + blast summary + `pr_files` stats + the linked GitHub issue, wraps
  untrusted text, makes one `completeStructured` call, applies the grounding gate,
  upserts.
- `github` port (`() => Promise<GitHubClient>`) — same shape and same underlying
  client `IntentService` uses. Resolves the first **same-repo** issue referenced
  in the PR body (`parseFirstLinkedIssueRef`, a minimal local copy of
  `modules/intent`'s parser — cross-module import is forbidden) and fetches its
  title/body. A missing ref or a fetch failure → the issue section is omitted,
  not an error.
- `helpers.ts` — pure: `assembleBriefInput` (truncation order per AC-3),
  `groundBrief` (AC-4 / AC-5 path-set gate), `renderIntentFacts`, `estimateTokens`.
- `routes.ts` (entry) — `POST /pulls/:id/brief`, validation via `schema` only.

## Tests

- Pure input-budgeting/grounding and service orchestration tests are colocated
  as `helpers.test.ts` / `service.test.ts`.
- The real Postgres + HTTP workflow lives in
  `server/test/brief.it.test.ts` (the required `*.it.test.ts` lane).
