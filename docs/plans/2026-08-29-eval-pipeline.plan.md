# Development Plan — Eval Pipeline

Spec: [`specs/2026-08-29-eval-pipeline.md`](../../specs/2026-08-29-eval-pipeline.md) (status: approved, zero open `[NEEDS CLARIFICATION]`)

## Execution mode

**Multi-agent.** This feature is a schema migration + a new server module with
async batch execution + seven client screens + seed data + a new npm script —
the server half and the client half each exceed what one context window
handles without dropping detail, and they have a hard handoff (the contract
must be frozen and synced before any client work compiles). Groups A–D below
name the executing agent per step:

- Group A (contracts, schema, server module) — `implementer`
- Group B (client) — `implementer`, after Group A's contracts are merged
- Group C (tests) — `api-test-writer`, then `ui-test-writer`
- Group D (e2e) — `implementer` or `ui-test-writer`

Run `architecture-reviewer` after Group A completes, before Group B starts.

## Decisions locked in before implementation

- **`EvalRun`'s `recall`/`precision`/`citation_accuracy` become nullable, plus
  a new `no_flag_rate` field** — required by AC-22 (never substitute `0`/`1`
  for a zero denominator) and AC-24 (expose the false-positive rate over
  `must_not_flag` cases in the API, not as a fifth metric card). No client
  consumer of `EvalRun` exists yet, so this widening is safe.
- **`Promote` is `POST /agents/:id/promote`**, living in the agents module's
  route plugin — the only placement with no conflict against the
  `no-cross-module-imports` arch rule (`modules/eval` may not import
  `modules/agents/service.ts`), and it inherits `PUT /agents/:id`'s
  authorization exactly as the spec's *Untrusted inputs* section requires.

## Scope

- Packages: `server/` (schema, new `modules/eval/`, agents-module additions,
  seed, `verify:l06`), `client/` (7 screens + hooks + nav + i18n),
  `server/src/vendor/shared` + `client/src/vendor/shared` (contracts, synced
  via script — never hand-edited in both places), `e2e/` (one new flow).
- **Out of scope, explicitly**: `reviewer-core/` gets no code change (AC-23
  reuses `groundFindings` as-is via `reviewPullRequest`); `mcp/`; the unrelated
  `evals/` harness package; the `Run all agents` dashboard action (named only
  in Edge cases / UX proposals, in no AC); `owner_kind='skill'` (Non-goal —
  API rejects it); all five "Proposed UX improvements" (explicitly proposals,
  not decisions); CI export, scheduled runs, LLM-as-judge.

## Recommendations adopted

- **Sync vendored contracts with `scripts/sync-shared.mjs`**, never hand-edit
  the client copy. `--check` is the CI gate.
- **Reuse `RunBus` keyed by the batch id** for async batch execution
  (Non-functional: Responsiveness) — `GET /runs/:id/events` takes an arbitrary
  id and only touches `container.runBus`, so no new SSE route is needed.

## Constraints

- `CLAUDE.md` — `@devdigest/shared` is vendored as two copies → any contract
  change is one step covering both, via `sync-shared.mjs` (step 1).
- `server/AGENTS.md` — a new module is `modules/<name>/` **plus one import in
  `modules/index.ts`**; no filesystem autoload (step 7).
- `server/AGENTS.md` — validate with the route schema
  (`schema.body`/`schema.params`), not `.parse()` in the handler (steps 4, 7 —
  AC-7's `400` comes from the route schema).
- `server/AGENTS.md` — outside world only through a container port
  (`container.llm()`); tests substitute via `ContainerOverrides`, never module
  mocks (steps 5, 12).
- `server/AGENTS.md` — an integration test must be `*.it.test.ts` or it runs
  in the wrong lane (step 12).
- `server/insights/INSIGHTS.md` (2026-08-27) — `arch:check` cruises `src`
  only; a DB-backed test file under `src/modules/**` trips new violations →
  DB-backed tests go in `server/test/`; only the port-free scorer test may sit
  in `src/modules/eval/`.
- `server/insights/INSIGHTS.md` (2026-08-13) — `pnpm db:generate` goes
  interactive when a table gains and loses a column in one pass; this change
  is additions-only, so one pass is safe. Never hand-edit generated SQL.
- `server/insights/INSIGHTS.md` (2026-08-28) — persist before publishing the
  completion event; step 5 writes the batch aggregate before
  `runBus.complete()`.
- `.dependency-cruiser.cjs` — `service-not-in-adapters` /
  `service-not-in-db`; the diff parse lives in
  `modules/eval/batch-executor.ts`, mirroring `modules/reviews/diff-loader.ts`.
- `client/AGENTS.md` — data only through `lib/hooks/*` → `lib/api.ts`;
  response types come from `vendor/shared`, never redeclared; fixed component
  folder layout; styles in `styles.ts`; `page.tsx` holds no feature state.
- `client/insights` (2026-08-19) — client imports only **types** from
  `@devdigest/shared`; AC-8's JSON validation is a plain `JSON.parse` in
  `helpers.ts`, not a contract `safeParse`.
- `client/insights` (2026-08-02) — `@testing-library/user-event` is not a
  dependency; drive interaction with `fireEvent`.
- `insights/INSIGHTS.md` (2026-08-13) — a sidebar screen requires editing
  `client/src/vendor/ui/nav.ts`, which `pr-self-review` rule B6 flags on
  sight; `routing.md` carries an explicit carve-out. Touch only the `NAV`
  array (step 10) and say so in the PR body.
- `e2e/AGENTS.md` — deterministic locators only; `--text` matches rendered
  text; nothing may trigger a model call; new flow is `11-eval-case.flow.json`.
- `e2e/insights` (2026-08-02) — seeded findings carry no
  `accepted_at`/`dismissed_at`; the flow must click `Accept` first.
- Spec constraints carried through unchanged: AC-18/Module interactions (the
  scorer is constructed with no ports at all); AC-14 (never read live
  GitHub/git at run time); AC-22 (`null`, never `0`/`1`); AC-26
  (macro-average); AC-34 (workspace scope on every read, `404` cross-tenant);
  *Untrusted inputs* (stored diff reaches the prompt only through
  `reviewPullRequest`'s existing wrapping; model-produced `file` strings never
  touch disk).

## Skills the implementer must invoke

| Files that will change | Skills (per `routing.md`) |
|---|---|
| `server/src/vendor/shared/contracts/{knowledge,eval-ci}.ts`, `client/src/vendor/shared/**` (script-generated) | `zod`, `typescript-expert`, `security` (+ `sync-shared.mjs --check` parity gate) |
| `server/src/db/schema/eval.ts` | `postgresql-table-design`, `drizzle-orm-patterns`, `security` |
| `server/src/db/migrations/**` (generated) | listed, not reviewed — hand-editing is a finding |
| `server/src/db/seed.ts` | `onion-architecture`, `drizzle-orm-patterns`, `security` |
| `server/src/modules/eval/repository.ts` | `onion-architecture`, `drizzle-orm-patterns`, `security` |
| `server/src/modules/eval/{service,scorer,batch-executor,helpers}.ts` | `onion-architecture`, `typescript-expert`, `security` |
| `server/src/modules/eval/routes.ts`, `server/src/modules/index.ts` | `onion-architecture`, `fastify-best-practices`, `security` |
| `server/src/modules/agents/{service,repository,routes}.ts` | `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `security` |
| `server/src/modules/eval/scorer.test.ts`, `server/test/eval*.it.test.ts` | tests slice → rules B5/B9 |
| `server/package.json`, `server/scripts/verify-l06.mjs` | `security` (no gate row; see Risks) |
| `client/src/lib/hooks/eval.ts`, `client/src/lib/hooks/index.ts` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/app/evals/**/*.tsx`, `client/src/app/agents/[id]/_components/AgentEditor/**` | `frontend-architecture`, `next-best-practices`, `react-best-practices`, `security` |
| `client/src/components/eval-case-editor/**`, `.../FindingCard/**` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/vendor/ui/nav.ts` | **B6 carve-out** — `NAV` entry only, nothing else in the file |
| `client/**/*.test.tsx` | `react-testing-library` |
| `client/messages/en/eval.json` | — (no row; strings only) |
| `e2e/specs/11-eval-case.flow.json` | e2e slice → rule B9, `e2e/AGENTS.md` |

The implementer re-checks `git status --porcelain` at the end of each group
and reports any divergence.

## Steps

### Group A — contracts and persistence (agent: `implementer`)

#### 1. Extend the shared contracts and mirror them — package: contracts
- Files: `server/src/vendor/shared/contracts/knowledge.ts` (edit),
  `server/src/vendor/shared/contracts/eval-ci.ts` (edit),
  `client/src/vendor/shared/**` (regenerated by script — never hand-edited)
- Skills: `zod`, `typescript-expert`, `security`
- What to do, in `knowledge.ts`:
  - `EvalExpectationType = z.enum(['must_find','must_not_flag'])` + inferred
    type (AC-6).
  - `EvalExpectedFinding = z.object({ file, start_line, end_line, severity,
    category, title })` reusing the `Severity`/`FindingCategory` enums already
    in `contracts/findings.ts`.
  - `EvalCase` gains `expectation_type: EvalExpectationType` and narrows
    `expected_output` from `z.unknown()` to `z.array(EvalExpectedFinding)`.
  - `EvalRun`'s `recall` / `precision` / `citation_accuracy` become
    `.nullable()` (AC-22), and it gains `no_flag_rate: z.number().nullable()`
    (AC-24 — API-only, never a fifth card). **Decision locked**: widen
    `EvalRun` directly.
  - In `eval-ci.ts`: `EvalCaseInput` gains `expectation_type`, narrows
    `expected_output` the same way, and constrains `owner_kind` to `'agent'`
    at the route level (Non-goal: reject `'skill'`).
  - `EvalRunRecord` gains `batch_id: z.string()` and `matched`/`unmatched`
    detail fields (AC-24's detail view, AC-25's pass reason).
  - New `EvalBatch` (`id`, `agent_id`, `agent_version`, `status`,
    `started_at`, `finished_at`, `cases_total`, `cases_passed`, macro
    `recall`/`precision`/`citation_accuracy` nullable, `no_flag_rate`
    nullable, `cost_usd`, `duration_ms`) and `EvalBatchStarted`
    (`{ batch_id }` — what the async `POST` returns).
  - Metric fields on `EvalDashboard.current`/`delta` become nullable for the
    same AC-22 reason.
  - Then run `node scripts/sync-shared.mjs` (copy) and
    `node scripts/sync-shared.mjs --check` (must exit 0).
- Done when: `--check` exits 0 and `cd server && pnpm typecheck` +
  `cd client && pnpm typecheck` pass.
- Tests: none of its own — extend `server/test/contracts.test.ts` if it
  enumerates schemas.

#### 2. Schema: expectation type, batch identity, indexes — package: server/
- Files: `server/src/db/schema/eval.ts` (edit), `server/src/db/migrations/**`
  (generated)
- Skills: `postgresql-table-design`, `drizzle-orm-patterns`, `security`
- What to do:
  - `evalCases`: add `expectationType: text('expectation_type', { enum:
    ['must_find','must_not_flag'] }).notNull().default('must_find')` (AC-6's
    established closed-set shape). Add an index on `(owner_kind, owner_id)`.
  - New `evalBatches` table: `id` uuid pk, `workspaceId` → `workspaces`
    cascade, `agentId` uuid → `agents` cascade, `agentVersion` integer
    **notNull** (AC-13), `status` `text(..., { enum:
    ['running','done','failed','cancelled'] })` notNull default `'running'`,
    `startedAt`/`finishedAt` timestamptz, `casesTotal`/`casesPassed` integer,
    `recall`/`precision`/`citationAccuracy`/`noFlagRate`/`costUsd`
    doublePrecision nullable, `durationMs` integer. Index
    `(agent_id, started_at)`.
  - `evalRuns`: add `batchId` uuid `.notNull().references(() =>
    evalBatches.id, { onDelete: 'cascade' })` + index. Safe as `notNull`: no
    code path or seed writes `eval_runs` today.
  - Generate with `cd server && pnpm db:generate`. Additions only → one
    non-interactive pass. Never hand-edit the SQL.
- Done when: `pnpm db:migrate` applies cleanly against a fresh DB and
  `pnpm typecheck` passes.
- Tests: covered by step 12's integration lane.

#### 3. The scorer — pure, port-free — package: server/ (application ring)
- Files: `server/src/modules/eval/scorer.ts` (new),
  `server/src/modules/eval/scorer.test.ts` (new, unit lane)
- Skills: `onion-architecture`, `typescript-expert`, `security`
- What to do: plain functions, **zero constructor, zero imports outside
  `@devdigest/shared`** — no `Container`, no `LLMProvider`, no `db`. That
  import list is what makes AC-18 structurally true.
  - `matchFindings(findings, expectations)` — equal `file` **and** inclusive
    `[start_line,end_line]` intersection of ≥1 line; no other field
    participates (AC-19). Greedy one-to-one: each expectation consumed once,
    each finding satisfies at most one; surplus overlaps count unmatched
    (AC-20). String comparison only — never resolve `file` against the
    filesystem.
  - `scoreCase({ expectationType, findings, expectations, citationAccuracy })`
    → `{ recall|null, precision|null, citation_accuracy|null, pass,
    matched[], unmatched[] }`. `must_not_flag` contributes no recall
    denominator and every produced finding as unmatched (AC-21). Zero
    denominator → `null` (AC-22). `pass` per AC-25.
  - `aggregate(caseResults)` → macro-average over cases with a value for that
    metric, excluding `null`s (AC-26); plus `no_flag_rate` (AC-24) and
    `cases_passed`/`cases_total`.
  - No clock, no randomness, no I/O (Non-functional: Determinism).
- Done when: `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
  passes and `pnpm arch:check` reports no new violation.
- Tests: `scorer.test.ts`. Cases: single-line edge overlap = full match; two
  findings on one expectation → 1 TP + 1 FP; `must_not_flag` with zero
  findings → `precision: null`, `pass: true`; zero-expectation case excluded
  from the macro average; byte-identical output across two invocations.

#### 4. Eval repository + case CRUD service — package: server/
- Files: `server/src/modules/eval/repository.ts` (new),
  `server/src/modules/eval/service.ts` (new),
  `server/src/modules/eval/helpers.ts` (new — row→DTO mapping)
- Skills: `onion-architecture`, `drizzle-orm-patterns`, `security`
- What to do:
  - `repository.ts` is the only file here importing `db/schema`. Methods:
    `listCasesForAgent`, `getCase`, `insertCase`, `updateCase`, `deleteCase`,
    `insertBatch`, `finishBatch`, `insertRun`, `listBatchesForAgent`,
    `latestRunPerCase`, `recentRunsForWorkspace`, `dashboardForWorkspace`.
    Every query filters on `workspaceId`; a cross-workspace id resolves to
    `undefined` → the route maps that to `404` (AC-34).
  - `service.ts` takes `Container`; must not import `adapters/**` or
    `db/schema`.
  - Case create/update: reject `owner_kind !== 'agent'` with `400`
    (Non-goal); persist `input_diff` / `input_files` / `input_meta` verbatim
    as the frozen copy (AC-5) — never re-read GitHub.
- Done when: `pnpm typecheck` + `pnpm arch:check` + `pnpm arch:ratchet` pass
  with no new baseline entry.
- Tests: deferred to step 12.

#### 5. Batch executor — async over `RunBus` — package: server/
- Files: `server/src/modules/eval/batch-executor.ts` (new)
- Skills: `onion-architecture`, `typescript-expert`, `security`
- What to do, modeled on `modules/reviews/run-executor.ts`:
  - `runBatch(workspaceId, agentId)`: load the agent (404 if not in
    workspace) and its cases; fewer than one case → `400`, persist nothing
    (AC-16). Otherwise insert the `eval_batches` row with `agentVersion =
    agent.version` **up front** (AC-13) and return `{ batch_id }`
    immediately; the loop runs fire-and-forget like `ReviewService.runReview`
    (Responsiveness).
  - Per case: `parseUnifiedDiff(case.input_diff)` imported here (mirroring
    `reviews/diff-loader.ts`), never `container.git`/`container.github`
    (AC-14). Then `reviewPullRequest({ systemPrompt, model, strategy, diff,
    skills: <resolved bodies>, llm: await container.llm(agent.provider),
    onEvent, checkCancelled })`. Stored diff/PR meta reach the prompt only
    through this call — no second injection path.
  - `citation_accuracy` comes from the `outcome.grounding` summary
    `reviewPullRequest` already returns — do not re-implement grounding
    (AC-23).
  - Score with step 3's functions, persist one `eval_runs` row per case
    carrying `batch_id`, publish a progress event on `container.runBus` keyed
    by the batch id per case.
  - Wrap each case in try/catch: failure persists `pass: false` and the loop
    continues (AC-15).
  - On finish: write the batch aggregate row **first**, then
    `runBus.complete(batchId)`.
- Done when: `pnpm typecheck` + `pnpm arch:check` pass.
- Tests: step 12 drives this with a stubbed provider via `ContainerOverrides`.

#### 6. Promote + agent-deletion cascade in the agents module — package: server/
- Files: `server/src/modules/agents/service.ts` (edit),
  `server/src/modules/agents/repository.ts` (edit),
  `server/src/modules/agents/routes.ts` (edit)
- Skills: `onion-architecture`, `fastify-best-practices`, `drizzle-orm-patterns`, `security`
- What to do:
  - `AgentsService.promoteVersion(workspaceId, agentId, version)`: read the
    `agent_versions` snapshot (404 if absent or cross-workspace), call
    `repo.update(...)` with that snapshot's config. `AgentsRepository.update`
    already bumps `agents.version` and snapshots, so promoting `v7` lands a
    new `v8` equal to `v7` and never rewinds (AC-29).
  - Route **`POST /agents/:id/promote`** (decision locked) with
    `schema.body = { version: z.number().int().positive() }`, in the same
    plugin as `PUT /agents/:id` so it inherits identical authorization.
  - `AgentsRepository.deleteById`: wrap in `db.transaction` and delete
    `eval_cases WHERE owner_kind='agent' AND owner_id = :id` (runs cascade via
    `eval_runs.case_id`, `eval_batches` cascade off `agents`) in the same
    transaction.
- Done when: `pnpm typecheck`, `pnpm arch:check`, `pnpm arch:ratchet` pass; no
  `modules/eval → modules/agents` import exists.
- Tests: step 12 (`agents-versions.it.test.ts` is the natural neighbour).

#### 7. Routes + module registration — package: server/
- Files: `server/src/modules/eval/routes.ts` (new),
  `server/src/modules/index.ts` (edit)
- Skills: `onion-architecture`, `fastify-best-practices`, `security`
- What to do: a default Fastify plugin, one import + one entry in
  `modules/index.ts`. Routes, all workspace-scoped via
  `getContext(container, req)`, all validated by `schema.params`/`schema.body`:
  - `GET|POST /agents/:id/eval-cases`,
    `GET|PUT|DELETE /eval-cases/:caseId`,
    `POST /eval-cases/:caseId/run` (single-case run for AC-9's `Run on save`).
  - `POST /agents/:id/eval-runs` → immediate `{ batch_id }` (AC-12,
    Responsiveness); `400` on an empty case set (AC-16).
  - `GET /agents/:id/eval-runs` (batch history, newest first),
    `GET /eval-runs/:batchId` (aggregate + per-case detail incl.
    `no_flag_rate` and matched/unmatched — AC-24).
  - `GET /evals/dashboard` — workspace-wide agent list + `Recent runs`
    (AC-31, AC-32).
  - `routes.ts` must not import `repository.ts` directly; it constructs the
    service.
  - The `400` for a non-parsing `expected_output` comes from the route schema
    being `z.array(EvalExpectedFinding)`; nothing partial is persisted (AC-7).
- Done when: `pnpm typecheck`, `pnpm arch:check`, `pnpm arch:ratchet`, unit
  lane all pass; the app boots.
- Tests: step 12.

#### 8. Seed data ≥ 8 cases, both types — package: server/
- Files: `server/src/db/seed.ts` (edit; optionally a sibling
  `seed-eval-cases.ts` following the `seed-prompts.ts`/`seed-skills.ts`
  precedent)
- Skills: `drizzle-orm-patterns`, `security`
- What to do: idempotently insert ≥ 8 `eval_cases` for the seeded
  demonstration agent, covering both expectation types (AC-17). Each case
  carries a small self-contained `input_diff` whose hunks actually contain
  the expectation's lines — otherwise the grounding gate drops the correct
  finding and recall is capped at 0 by construction. Keep `db:seed`
  re-runnable.
- Done when: `pnpm db:seed` twice in a row leaves the same row count, and
  both expectation types are present.
- Tests: asserted by step 9's `verify:l06` and step 12.

#### 9. `pnpm verify:l06` — package: server/
- Files: `server/scripts/verify-l06.mjs` (new), `server/package.json` (edit)
- Skills: `security`
- What to do: a Node script owned by `server/` (AC-35) that exits non-zero
  unless all four hold: the seeded agent has ≥ 8 cases; both expectation
  types are represented; a batch scores end-to-end against a stubbed
  provider (`ContainerOverrides`, no keys, no network); the scorer module
  performs no provider call — assert this structurally, by checking
  `modules/eval/scorer.ts`'s import list contains no adapter/container/
  provider import.
- Done when: `cd server && pnpm verify:l06` exits 0 on a seeded DB and
  non-zero with the seed cases removed.
- Tests: the script is the test.

### Group B — client (agent: `implementer`, after Group A's contracts are merged)

#### 10. Data layer, nav and strings — package: client/
- Files: `client/src/lib/hooks/eval.ts` (new),
  `client/src/lib/hooks/index.ts` (edit — barrel),
  `client/src/vendor/ui/nav.ts` (edit — **`NAV` array entry only**),
  `client/messages/en/eval.json` (edit)
- Skills: `frontend-architecture`, `react-best-practices`, `security`
- What to do: React Query hooks over `lib/api.ts` only — `useEvalCases`,
  `useCreateEvalCase`, `useUpdateEvalCase`, `useDeleteEvalCase`,
  `useRunEvalCase`, `useStartEvalBatch`, `useEvalBatches`, `useEvalBatch`,
  `useEvalDashboard`, plus a batch-progress subscription reusing the
  `EventSource` pattern in `lib/hooks/reviews.ts:198` against
  `/runs/{batch_id}/events`. Types come from `vendor/shared`; never
  redeclare, never `parse()` a Zod contract client-side. Add the
  `Eval Dashboard` item to `NAV` under the Skills Lab group with `href:
  "/evals"`. Handle `ApiError` `status: 0` as "API unreachable".
- Done when: `cd client && pnpm typecheck && pnpm lint` pass.
- Tests: step 13.

#### 11. The seven screens — package: client/
- Files (all new unless noted), each as the fixed
  `Name.tsx · styles.ts · constants.ts · helpers.ts · index.ts` folder:
  - `.../FindingCard/FindingCard.tsx` (edit) — `Turn into eval case` beside
    `Accept`/`Dismiss` (AC-1); disabled with explanation when neither
    `accepted_at` nor `dismissed_at` is set (AC-4); opens the editor
    pre-seeded `must_find` + one expectation (AC-2) or `must_not_flag` + `[]`
    (AC-3).
  - `client/src/components/eval-case-editor/` — the modal, both variants.
    `expected_output` validated with plain `JSON.parse` in `helpers.ts`;
    while invalid, disable `Save` + `Run case` (AC-8). `Run on save` runs the
    case and renders read-only `Actual output`; otherwise `Never run yet`
    (AC-9). Render model-produced strings as text — no
    `dangerouslySetInnerHTML`.
  - `.../AgentEditor/_components/EvalsTab/` — case list with name,
    `MUST FIND`/`MUST NOT FLAG` badge, `expected N finding(s), got M ·
    recall X%`, `Run`/`Edit`/`Delete` (AC-10); empty state with no metric
    cards when zero cases (AC-11). Wire into `AgentEditor.tsx`.
  - `client/src/app/evals/page.tsx` + `_components/EvalDashboard/` — every
    workspace agent with model badge; `Configure eval cases →` instead of
    metrics for an agent with no batches (AC-31); global `Recent runs` table
    (AC-32).
  - `client/src/app/evals/[agentId]/page.tsx` + `_components/` — four metric
    cards (Recall / Precision / Citation Accuracy / Traces Passed — exactly
    four, AC-24 forbids a fifth); `METRIC TREND` via
    `vendor/ui/charts/LineChart`, one line per metric, only from ≥ 2 batches
    (AC-30); run history with `cost_usd`; checkbox selection enabling
    `Compare` only at exactly two (AC-27); precision-regression alert banner
    (AC-33).
  - `_components/CompareRunsPopup/` — signed deltas for recall, precision,
    citation_accuracy and cost, plus a textual `system_prompt` diff from the
    two `agent_versions` snapshots (AC-28), and `Promote` calling
    `POST /agents/:id/promote`. Deltas carry the sign in the text, not colour
    alone (Accessibility). Icon-only buttons get `aria-label`.
- Skills: `frontend-architecture`, `next-best-practices`, `react-best-practices`, `security`
- What to do beyond the above: `page.tsx` files compose and pass params
  only; all styling in `styles.ts`; derive display values during render;
  `Running…` comes from the batch SSE subscription, not polling.
- Done when: `cd client && pnpm typecheck && pnpm lint && pnpm build` pass.
- Tests: step 13.

### Group C — tests (agents: `api-test-writer`, then `ui-test-writer`)

#### 12. Server integration tests — package: server/ — agent: `api-test-writer`
- Files: `server/test/eval-cases.it.test.ts` (new),
  `server/test/eval-batch.it.test.ts` (new),
  `server/test/agents-versions.it.test.ts` (edit)
- Skills: tests slice (rules B5/B9); `security` for tenancy assertions
- What to do — all in `server/test/`, all `*.it.test.ts`, provider stubbed
  via `ContainerOverrides`:
  - AC-5: create a case, mutate/delete the originating PR, re-read — inputs
    survive; run time performs no GitHub/git call.
  - AC-7: malformed `expected_output` → `400`, nothing persisted.
  - AC-12/13: `POST /agents/:id/eval-runs` returns a batch id immediately;
    one `eval_runs` row per case; every row carries `batch_id`; the batch
    records the agent's `version` at execution time.
  - AC-15: one case's provider stub throws → that row is `pass: false` and
    the remaining cases still run.
  - AC-16: zero cases → `400`, nothing persisted.
  - AC-17: the seeded agent has ≥ 8 cases across both types.
  - AC-29: promote `v7` → the agent sits at a new `v8` whose config equals
    `v7`; `agent_versions` unchanged; `agents.version` never decreases.
  - AC-34: a case/agent id from another workspace → `404` on read, run and
    promote.
  - Module interactions: deleting an agent removes its eval cases and their
    runs in one transaction.
- Done when: `cd server && pnpm exec vitest run .it.test` passes (Docker
  required; without it the run is `SKIPPED`, not a pass).

#### 13. Client component tests — package: client/ — agent: `ui-test-writer`
- Files: `FindingCard.test.tsx` (edit),
  `eval-case-editor/EvalCaseEditor.test.tsx`, `EvalsTab.test.tsx`,
  `EvalDashboard.test.tsx`, `CompareRunsPopup.test.tsx` (new)
- Skills: `react-testing-library`
- What to do: `fetch` mocked, drive with `fireEvent` (no `user-event`). One
  flow test per component: disabled/enabled `Turn into eval case` states
  (AC-1–AC-4); invalid JSON disabling `Save`/`Run case` (AC-8); `Never run
  yet` vs rendered `Actual output` (AC-9); cases list row content and
  zero-case empty state with no metric cards (AC-10, AC-11); `Compare`
  enabled only at exactly two selections (AC-27); signed delta text and
  prompt diff (AC-28); trend chart only from two batches (AC-30); `Configure
  eval cases →` for a metric-less agent (AC-31); precision-regression banner
  (AC-33).
- Done when: `cd client && pnpm test` passes.

### Group D — e2e (agent: `implementer` or `ui-test-writer`)

#### 14. One provider-free browser flow — package: e2e/
- Files: `e2e/specs/11-eval-case.flow.json` (new)
- Skills: e2e slice → rule B9, `e2e/AGENTS.md`
- What to do: on the seeded stack, open the seeded PR's findings, click
  `Accept` on a seeded finding (seed ships untriaged, AC-4 keeps the action
  disabled otherwise), click `Turn into eval case`, save, open the agent's
  `Evals` tab and `wait --text` for the case name. Deterministic locators
  only; assert rendered text (e.g. uppercase `MUST FIND`); `wait --text`
  before clicking. Nothing in this flow may reach a provider — scoring
  correctness is `server-unit`'s job and the two-prompt experiment stays
  manual QA.
- Done when: `./scripts/e2e.sh` passes end to end on the isolated stack.

## Verification gates

- [ ] `node scripts/sync-shared.mjs --check` (repo root) — run first
- [ ] `cd server && pnpm typecheck`
- [ ] `cd server && pnpm arch:check`
- [ ] `cd server && pnpm arch:ratchet` — the baseline may shrink, never grow
- [ ] `cd server && pnpm db:migrate` (schema changed; not run on boot)
- [ ] `cd server && pnpm db:seed`
- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'`
- [ ] `cd server && pnpm exec vitest run .it.test` (Docker required; if
      absent, report `SKIPPED`, not pass)
- [ ] `cd server && pnpm verify:l06`
- [ ] `cd client && pnpm typecheck`
- [ ] `cd client && pnpm lint` (`--max-warnings 0`)
- [ ] `cd client && pnpm test`
- [ ] `cd client && pnpm build`
- [ ] `./scripts/e2e.sh` (repo root)
- Not run: `reviewer-core` gates — no file in that package is planned. If a
  step ends up touching it, add `cd reviewer-core && npm run typecheck &&
  npm test` and re-run the server arch gates (`arch:check` cruises
  `../reviewer-core/src`).

## Risks

- **`client/src/vendor/ui/nav.ts` trips `pr-self-review` rule B6 on sight.**
  There is no legal alternative — `Sidebar.tsx` imports `NAV` directly and
  exposes no injection prop — and `routing.md` carries an explicit carve-out.
  Touch only the `NAV` array, name the carve-out in the PR body. Accepted.
- **`server/scripts/verify-l06.mjs` matches no row in `routing.md`.** Reviewed
  by `security` but by no structural skill. Accepted — it's a test harness,
  not production code.
- **`modules/eval/batch-executor.ts` imports `adapters/git/diff-parser.js`
  directly.** The literal AC text ("not by importing the adapter class")
  holds because `service.ts` does not import it; `modules/reviews/
  diff-loader.ts` is exact prior art. Accepted; if `arch:check` flags it,
  move the import, don't add it to the ratchet baseline.
- **`eval_runs.batch_id NOT NULL`** is safe because no code path or seed
  writes that table today. Accepted; if a dev DB has rows, delete them rather
  than weakening the column.
- **A batch is ≥ 8 provider calls.** Only the per-agent `Run` action is
  planned; `Run all agents` stays out of scope, removing the agents × cases
  multiplier.
- **Only step 1 may touch contracts, and only via `sync-shared.mjs`.** Any
  later contract need blocks on re-running step 1's sync, or `--check` goes
  red.
