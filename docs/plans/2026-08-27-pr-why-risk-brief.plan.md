# Development Plan — PR Why + Risk Brief

**Spec:** `specs/2026-08-27-pr-why-risk-brief.md` (39 acceptance criteria)
**Branch:** `specification-plan-homework`
**Open-question status:** all 4 resolved before start (option A on each) — decisions are baked into the steps below.

> No tests are written in this pass (a deliberate deferral for the token budget). The
> Verification section describes lanes and the e2e flow, but executable tests (unit /
> integration / `e2e/*.flow.json`) are created in a separate future pass. Code structure
> must stay test-friendly.

---

## Execution mode

- **Single-agent** — one `implementer` pass via `run-plan`. All 12 steps in sequence, gates run inline after the server group (steps 1–7) and after the client group (steps 8–12), full set at the end.
- Test-writing agents (`api-test-writer` / `ui-test-writer`) are **not** involved in this pass: executable tests are deliberately deferred (see *Verification gates* → "Deferred").

## Scope

- **Packages:** `server/` (new `modules/brief/` module, new table + migration, triggers in `pulls`/`reviews`, container wiring), `client/` (React Query hook, Overview card, Intent block extension, new shared line-addressing surface in `components/diff-viewer/`, URL params), both vendored copies of `vendor/shared` (via `scripts/sync-shared.mjs`).
- **Out of scope:** `mcp/` (untouched entirely — spec Non-goal "No MCP tool"); `reviewer-core/` (no I/O for this feature; only the existing `wrapUntrusted` export is consumed); the existing `PrBrief { intent, blast, risks, history }` contract and the `pr_brief` table (not repurposed, not edited); how intent (L03) and blast (L04) are themselves computed; executable tests (unit / integration / `e2e/*.flow.json`) — a separate future pass; `src/vendor/ui/**` (do-not-touch).

## Recommendations (decisions already taken, baked into the plan)

1. **Blast — never through `container.blast`.** `BlastService.getBlast` (`server/src/modules/blast/service.ts`) runs a BFS over `file_edges` via `repoIntel.getBlastRadius` on every call — that is precisely the "trigger a blast-radius computation" AC-18a forbids. So the use case accepts `blastSummary?` as an optional input parameter and **never** resolves it itself. Coordinator's decision (option A): in this pass the parameter stays empty forever — the brief runs without a blast input; it will be wired up when L04 is finished.
2. **`vendor/shared` sync via script, not by hand.** The root `insights/INSIGHTS.md` (2026-08-13) records: `server/src/vendor/shared` is canonical (`reviewer-core/tsconfig.json` resolves the alias there), `node scripts/sync-shared.mjs` copies server → client, and `--check` is a gate in `guards.yml`. Verified at planning time: `✓ already in sync (13 files)`. So "two edits" means one edit to the server copy plus running the script.
3. **Changed-line parser — a local pure helper, not `parseUnifiedDiff`.** The existing parser lives in `server/src/adapters/git/diff-parser.ts` — infrastructure ring; `service.ts`/`helpers.ts` (application) cannot import it without breaking `arch:check`. All that is needed is the changed line numbers from `pr_files.patch` — roughly 20 lines of a pure function in `modules/brief/helpers.ts`.

## Constraints

- `server/AGENTS.md` — a new module is a `modules/<name>/` folder plus **one** import in `modules/index.ts` (there is no filesystem autoload); the outside world is reached only through a container port (`container.llm()`, `container.github()`); validate with the route schema (`schema.params`/`schema.body`), never `.parse()` inside the handler; `pnpm db:migrate` does not run on boot; an integration test **must** be named `*.it.test.ts`.
- `onion-architecture` (rules 2 and 4) — a service takes **ports**, never the `Container`. Precedents in this repo: `IntentDeps` (`server/src/modules/intent/types.ts`), `BlastRadiusSource` (`server/src/modules/blast/types.ts`). `ReviewRunExecutor` takes `Container` — that is documented debt in the baseline, not a pattern to copy for new code.
- `.dependency-cruiser.cjs` `no-cross-module-imports` — `modules/brief/` must not import `modules/intent/*` or `modules/blast/*`, **not even types** (the rule has no type-only exception; this is documented explicitly in the header of `modules/blast/types.ts`). Cross-module access goes through `container.*`; the shape of the types is a local structural copy.
- `server/insights/INSIGHTS.md` (2026-08-27) — `arch:check`/`arch:ratchet` only cruise `src` (+ `../reviewer-core/src`), not `server/test/`. A test file placed inside `src/modules/<name>/` triggers **new** violations (`repository-owns-persistence`, `no-cross-module-imports`). Relevant to the deferred test pass: anything touching the DB goes in `server/test/`.
- `server/insights/INSIGHTS.md` (2026-08-13) — `pnpm db:generate` turns **interactive** when a table gains and loses columns in the same generation. Here the table is **new**, so there is no risk; do not hand-edit the generated migration (hand-editing a generated migration is itself a review finding).
- `client/AGENTS.md` — data only through `lib/hooks/*` → `lib/api.ts` (a bare `fetch` in a component is forbidden); response types come from `vendor/shared` and are never redeclared locally; fixed component folder layout (`Name.tsx` · `styles.ts` · `constants.ts` · `helpers.ts` · `index.ts`); styles live in the sibling `styles.ts`; `page.tsx` holds no feature state; `src/components/` and `src/lib/` must **not** import from `src/app/` (linted).
- `client/insights/INSIGHTS.md` (2026-08-19) — the client may import only **types** from `@devdigest/shared`; a runtime import breaks the webpack bundle. Consequence: a Zod contract is never parsed on the client, `.default()`s never run there, and a field the server omitted arrives `undefined`. Validation belongs at the server's read boundary; client lookups over wire enums must be total (`TABLE[v] ?? TABLE.fallback`). This applies directly to `risk_level`.
- `client/insights/INSIGHTS.md` (2026-08-19) — `Badge` (`vendor/ui/primitives/Badge.tsx`) ships `white-space: nowrap`, which overflows on model-written text; the sanctioned workaround is `style={{ whiteSpace: "normal" }}` (Badge spreads `style` last), not a fork of `vendor/ui`.
- `client/insights/INSIGHTS.md` (2026-08-19) — `styles.ts` holds plain `CSSProperties`, so pseudo-elements are unavailable; `display: flex` on a `<ul>` kills `list-item` on its children and markers silently disappear with no error (hit in `IntentCard` itself). Render the marker as a real element in JSX.
- `client/insights/INSIGHTS.md` (2026-08-02) — `@testing-library/user-event` is **not** a dependency of `client/`; in the deferred test pass, drive interactions with `fireEvent`.
- `specs/2026-08-27-pr-why-risk-brief.md` — invariants that must keep holding: `risk_level` must not influence the score, the verdict, any finding, or the review agent's prompt; no hunk bodies, file contents, or raw patch text in the model input; denylists / regex scanning / keyword filtering of untrusted text are **forbidden by repository convention** — the shared injection guard is the only defence; `PrBrief` and `pr_brief` are not repurposed (AC-23); the two vendored copies of the contract stay byte-identical (AC-23); brief text is rendered as text and never passed to a raw-HTML rendering path.

## Skills the implementer must invoke

Matrix from `.claude/skills/pr-self-review/routing.md` — **not** first-match-wins; every matching row contributes its skills.

| Files that will change | Skills |
|---|---|
| `server/src/vendor/shared/contracts/brief.ts`, `client/src/vendor/shared/contracts/brief.ts` | `zod`, `typescript-expert`, `security` (+ the vendor-parity gate) |
| `server/src/db/schema/reviews.ts`, `server/src/db/schema.ts` | `postgresql-table-design`, `drizzle-orm-patterns`, `security` |
| `server/src/db/migrations/0019_*.sql`, `migrations/meta/**` | — (generated: list them in the report, do not review, **do not** hand-edit) |
| `server/src/modules/brief/repository.ts` | `onion-architecture`, `drizzle-orm-patterns`, `security` |
| `server/src/modules/brief/service.ts` | `onion-architecture`, `security` |
| `server/src/modules/brief/routes.ts`, `server/src/modules/index.ts` | `onion-architecture`, `fastify-best-practices`, `security` |
| `server/src/modules/brief/{types,constants,helpers}.ts` | `onion-architecture`, `typescript-expert`, `security` |
| `server/src/platform/container.ts` | `onion-architecture`, `security` |
| `server/src/modules/pulls/routes.ts` | `onion-architecture`, `fastify-best-practices`, `security` |
| `server/src/modules/reviews/run-executor.ts` | `onion-architecture`, `security` |
| `client/src/lib/hooks/brief.ts`, `client/src/lib/hooks/diff-target.ts`, `client/src/lib/hooks/index.ts`, `client/src/lib/types.ts` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/components/diff-viewer/**` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | `frontend-architecture`, `next-best-practices`, `react-best-practices`, `security` |
| `client/src/app/repos/[repoId]/pulls/[number]/_components/**` | `frontend-architecture`, `react-best-practices`, `security` |
| `client/messages/en/prReview.json` | — (docs/i18n slice) |

`security` has no glob — it runs on the **whole** changed-source set, on every step, without exception.

This table is a **forecast**. After implementing, re-route the actual `git status --porcelain` through `routing.md` and report any divergence. A path that matches no row is a path no skill will review: name it explicitly.

---

## Steps

### 1. `PrWhyRiskBrief` contract — package: server/ + client/ (`vendor/shared`)

- **Files:** `server/src/vendor/shared/contracts/brief.ts` (edit — **appends only, at the end of the file**), `client/src/vendor/shared/contracts/brief.ts` (generated by the script), `server/src/vendor/shared/index.ts` (check — the re-export of `contracts/brief.js` is already whole; an edit may not be needed).
- **Skills:** `zod`, `typescript-expert`, `security`.
- **What to do** — add **alongside** the existing `PrBrief` (lines 162–169 of the current file), changing nothing inside it:

  ```ts
  // ---- Why + Risk Brief (pr_why_risk_brief) — separate from PrBrief above ----
  export const RiskLevel = z.enum(['high', 'medium', 'low']);        // AC-15
  export type RiskLevel = z.infer<typeof RiskLevel>;

  export const BriefRisk = z.object({
    title: z.string(),
    detail: z.string().nullish(),
    path: z.string().nullable(),        // grounded (AC-12) or null
    line: z.number().int().nullable(),  // grounded (AC-13) or null
    endpoint: z.string().nullable(),    // grounded against blast set; null on AC-18 path
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
    risks_total: z.number().int(),          // pre-truncation count (AC-16 -> AC-35)
    review_focus_total: z.number().int(),   // pre-truncation count (AC-16 -> AC-35)
    sources: z.array(z.string()),           // which inputs contributed (AC-17)
    pr_state_key: z.string(),               // AC-4
    model: z.string().nullable(),           // "<provider>/<model>"
    computed_at: z.string(),                // ISO-8601
  });
  export type PrWhyRiskBrief = z.infer<typeof PrWhyRiskBrief>;

  export const PrWhyRiskBriefResponse = z.object({ brief: PrWhyRiskBrief.nullable() }); // AC-20
  export type PrWhyRiskBriefResponse = z.infer<typeof PrWhyRiskBriefResponse>;

  export const PrWhyRiskBriefRegenerateResponse = z.object({
    status: z.enum(['started', 'running']),  // AC-8 / AC-21
  });
  export type PrWhyRiskBriefRegenerateResponse = z.infer<typeof PrWhyRiskBriefRegenerateResponse>;
  ```

  - **No `.default()`s** that the client would depend on: the client does not parse the contract, so the server always serializes every field explicitly.
  - Use `.nullish()` only where a field can genuinely be absent from *any* producer (here: only `detail`); everything else is `.nullable()` with an explicit `null`.
  - Then, from the repo root: `node scripts/sync-shared.mjs` (server → client). Do **not** mirror the file by hand.
- **Done when:** `node scripts/sync-shared.mjs --check` exits 0; `cd server && pnpm typecheck` and `cd client && pnpm typecheck` are green; `git diff server/src/vendor/shared/contracts/brief.ts` shows **only** added lines — no line of `PrBrief`/`Intent`/`BlastRadius`/`SmartDiff` is modified (AC-23).
- **Tests:** deferred (separate pass).

### 2. `pr_why_risk_brief` table + migration — package: server/

- **Files:** `server/src/db/schema/reviews.ts` (edit — add the table **after** the existing `prBrief`, leaving it untouched), `server/src/db/schema.ts` (edit — import + barrel entry next to `prBrief`), `server/src/db/migrations/0019_*.sql` + `migrations/meta/**` (generated).
- **Skills:** `postgresql-table-design`, `drizzle-orm-patterns`, `security`.
- **What to do** — a new table, styled on the neighbouring `prIntent`:

  ```ts
  export const prWhyRiskBrief = pgTable('pr_why_risk_brief', {
    prId: uuid('pr_id')
      .primaryKey()
      .references(() => pullRequests.id, { onDelete: 'cascade' }),
    prStateKey: text('pr_state_key').notNull(),          // AC-4 — what pr_brief lacks
    what: text('what').notNull(),
    why: text('why').notNull(),
    riskLevel: text('risk_level').notNull(),             // enum enforced at the read boundary
    risks: jsonb('risks').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    reviewFocus: jsonb('review_focus').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
    risksTotal: integer('risks_total').notNull().default(0),
    reviewFocusTotal: integer('review_focus_total').notNull().default(0),
    sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
    model: text('model'),
    computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
  });
  ```

  - `risk_level` is `text`, not a PG enum: the value is business-logic-driven and gets validated by Zod at the read boundary, exactly like `pr_intent.confidence` (`RiskLevel.catch('low')`). A drifted label must degrade, not throw.
  - A PK on `pr_id` is enough: one brief per PR, overwritten in place, no brief history by design (same as `pr_intent`). Do not add further indexes — there are no other access paths.
  - Do not touch the existing `prBrief` by a single line.
  - Then: `cd server && pnpm db:generate` (non-interactive — the table is new and loses no columns), followed by `cd server && pnpm db:migrate`. Do **not** edit the generated SQL.
- **Done when:** the new migration file `0019_*.sql` contains exactly one `CREATE TABLE "pr_why_risk_brief"` and no `ALTER`/`DROP` against existing tables; `pnpm db:migrate` succeeds; `cd server && pnpm typecheck` is green; `grep -n "pr_brief" server/src/db/migrations/0019_*.sql` returns nothing.
- **Tests:** deferred.

### 3. `modules/brief/` — constants, ports, pure helpers — package: server/

- **Files (new):** `server/src/modules/brief/constants.ts`, `server/src/modules/brief/types.ts`, `server/src/modules/brief/helpers.ts`, `server/src/modules/brief/README.md`.
- **Skills:** `onion-architecture`, `typescript-expert`, `security`.
- **What to do:**

  **`constants.ts`** — the spec's Tunable constants table, in one place:
  ```ts
  export const MAX_RISKS = 8;              // AC-16
  export const MAX_REVIEW_FOCUS = 6;       // AC-16
  export const MAX_INPUT_FILES = 40;       // AC-36
  export const MAX_REGEN = 3;              // AC-38 — per minute, per PR
  export const BRIEF_TIMEOUT_MS = /* same order of magnitude as INTENT_TIMEOUT_MS in modules/intent/constants.ts */;
  export const MAX_LINKED_ISSUES = /* mirrors the intent module */;
  export const BRIEF_JOB_KIND = 'brief.compute';
  export const BRIEF_SCHEMA_NAME = 'PrWhyRiskBrief';
  ```

  **`types.ts`** — ports the module declares itself (the inversion rule: the inner ring declares the interface):
  - `BriefDeps { github(): Promise<GitHubClient>; llm(p: Provider): Promise<LLMProvider>; featureModelOverride(ws: string): Promise<FeatureModelChoice | undefined>; intent(ws: string, prId: string): Promise<PrIntentRecord | undefined>; }` — `intent` is supplied by the container as a thin wrapper over `container.intent.get`, so this module never imports `modules/intent/*`.
  - `BriefJobs { register(kind: string, handler: (payload: unknown) => Promise<void>): void; enqueue(ws: string, kind: string, payload: unknown): Promise<unknown>; }` — a structural subset of `JobRunner`; `platform/container.ts` is the only place `this.jobs` is assigned to this type.
  - `BriefBlastSummary { impactedEndpoints: string[]; degraded?: boolean }` — a **local** structural copy of the slice of blast this module consumes. Comment it exactly the way `modules/blast/types.ts` comments its own copy: the copy exists because cross-module imports are banned, and the module **never** resolves it itself (AC-18a).
  - `BriefPort { get(ws: string, prId: string): Promise<PrWhyRiskBrief | undefined>; requestRecompute(ws: string, prId: string, opts?: { force?: boolean }): Promise<'started' | 'running' | 'unknown_pr'>; }` — for `container.brief` and `ContainerOverrides.brief`.
  - `BriefComputeParams { workspaceId: string; prId: string; blastSummary?: BriefBlastSummary }` — `blastSummary` is **always absent** in this pass (coordinator's decision, option A); the parameter exists as the wiring point for when L04 lands. Document that in a comment directly above the field so the next reader does not mistake it for a forgotten wire.

  **`helpers.ts`** — all pure, no DB, no `Date.now()`, no randomness (time and models arrive as arguments):
  - `derivePrStateKey(headSha: string, files: {path: string; additions: number; deletions: number}[]): string` — sha256 over `head_sha` plus the path-sorted list of `path:additions:deletions` (AC-4). Above the function, a comment naming the trap: `GET /pulls/:id` (`server/src/modules/pulls/routes.ts`) refreshes `body`/`additions`/`deletions`/`files_count` from GitHub **without** updating `head_sha`, so `head_sha` alone is not enough.
  - `changedLinesFromPatch(patch: string | null): number[]` — parses `@@ -a,b +c,d @@`, returns the **new** (right-side) line numbers for `+` and context lines; `null`/empty patch → `[]`.
  - `selectInputFiles(files, max = MAX_INPUT_FILES)` → `{ described, omittedCount, omittedChangedLines }` — sort by `additions + deletions` descending, describe the first `max` individually, collapse the rest into a single aggregate (AC-36).
  - `buildGroundingSets(allFiles)` → `{ pathSet: Set<string>, pathsByAlias: Map<string,string>, changedLinesByPath: Map<string, number[]> }` — built from **all** changed files, not only the described ones (AC-36: a reference to a file outside the top 40 must not be dropped). `pathsByAlias` is the structure behind AC-12a (old path → new path): it is created and consulted, but **there is no data source for it in this pass** (see *Risks*), so it stays empty in practice.
  - `groundEntries(candidate, sets, endpointSet)` → `{ risks, reviewFocus, risksTotal, reviewFocusTotal }`:
    - drop any risk/focus whose `path` is neither in `pathSet` nor resolvable via `pathsByAlias` (AC-12, AC-12a); if it resolved through an alias, store the **new** path;
    - a `line` not among `changedLinesByPath[path]` → snap to the nearest changed line in the same file, otherwise drop; `line <= 0` and negatives fall into the same branch (AC-13);
    - a risk with an `endpoint` outside `endpointSet` → null the `endpoint` or drop the entry (AC-12); an empty `endpointSet` means no endpoint is valid (AC-18);
    - truncate to `MAX_RISKS` / `MAX_REVIEW_FOCUS` and return the **pre-truncation** counts (AC-16);
    - **never** decides "everything was dropped → discard the brief" — that is the service's call (AC-14).
  - **`README.md`** — briefly: what the module does, which ACs it covers, why blast is consume-only, why it owns its own table rather than `pr_brief`.
- **Done when:** `cd server && pnpm typecheck` and `pnpm arch:check` are green; `grep -rn "from '\.\./\(intent\|blast\|pulls\|reviews\)" server/src/modules/brief/` returns nothing; `grep -rn "db/schema\|adapters/" server/src/modules/brief/{constants,types,helpers}.ts` returns nothing.
- **Tests:** **deferred**. Keep the signatures pure and deterministic — the next pass's unit lane (state key, grounding, caps, input selection) must be writable without a single mock.

### 4. `modules/brief/repository.ts` — package: server/

- **Files (new):** `server/src/modules/brief/repository.ts`.
- **Skills:** `onion-architecture`, `drizzle-orm-patterns`, `security`.
- **What to do** — model it one-to-one on `server/src/modules/intent/repository.ts`:
  - `resolvePr(workspaceId, prId)` → `{ id, repoId, number, title, body, branch, headSha } | undefined` — `where` on `pull_requests.workspace_id` **and** `id`. "Wrong workspace" and "does not exist" both return the same `undefined` (AC-22 — no IDOR signal leaked through response shape).
  - `resolveRepoRef(repoId)` → `{ owner, name } | undefined` — needed for the linked-issue fetch.
  - `getChangedFiles(prId)` → `{ path, additions, deletions, patch }[]` from `pr_files`.
  - `findBrief(prId)` → `PrWhyRiskBrief | undefined` — via `rowToBrief(row)`.
  - `findBriefForWorkspace(workspaceId, prId)` → the same lookup with an `innerJoin(pullRequests)` scoped to the workspace (AC-22).
  - `rowToBrief(row)` — **the one place the contract is actually parsed** (the client cannot do it): `PrWhyRiskBrief.safeParse({...})` with `risk_level: RiskLevel.catch('low').parse(row.riskLevel)` (a drifted label degrades rather than throws) and `computed_at: row.computedAt.toISOString()`. A structurally broken row → `undefined`, i.e. treated as a cache miss and recomputed over, rather than served to the UI (identical to `rowToIntentRecord`).
  - `upsertBrief(input)` — `insert(...).onConflictDoUpdate({ target: t.prWhyRiskBrief.prId, set: {...} }).returning()`; parse the result through `rowToBrief`, and an `undefined` right after our own write is a schema/contract drift bug, so `throw` with an explicit message (as `upsertIntent` does).
  - **No business logic:** state key, grounding, and caps are not computed here — the repository is a detail, the service is not.
  - Keep the row type (`typeof t.prWhyRiskBrief.$inferSelect`) module-internal: do not export it out of the file.
- **Done when:** `cd server && pnpm typecheck`, `pnpm arch:check` are green; `grep -n "pr_brief\|prBrief" server/src/modules/brief/repository.ts` returns nothing; `derivePrStateKey`/`groundEntries` are not called from this file.
- **Tests:** deferred (integration lane; the file will live in `server/test/`, not in `src/modules/brief/`).

### 5. `modules/brief/service.ts` — the use case — package: server/

- **Files (new):** `server/src/modules/brief/service.ts`.
- **Skills:** `onion-architecture`, `security`.
- **What to do** — `export class BriefService implements BriefPort`, constructor `(private readonly deps: BriefDeps, private readonly repo: BriefRepository, private readonly jobs: BriefJobs)` — **never `Container`** (onion rule 4; precedents: `IntentService`, `BlastService`, `RepoIntelService`).

  **Public surface:**
  - `get(ws, prId)` → `this.repo.findBriefForWorkspace(ws, prId)` (AC-20, AC-22).
  - `requestRecompute(ws, prId, { force } = {})`:
    1. `const pr = await this.repo.resolvePr(ws, prId)`; if `!pr` → return `'unknown_pr'` (the route turns that into a 404 only for the explicit regenerate action; background triggers simply ignore it);
    2. **in-flight guard**: a private `#inFlight = new Map<string, Promise<void>>()`. If an entry for `prId` exists → return `'running'` with no LLM call whatsoever (AC-8). The process is single (`JobRunner` is in-process, `PQueue` concurrency 3), so an in-memory map suffices — state that assumption in a comment so multi-process deployment does not break it silently;
    3. if `force !== true`: read `stored = await this.repo.findBrief(prId)`, compute `key = derivePrStateKey(pr.headSha, await this.repo.getChangedFiles(prId))`; `stored?.pr_state_key === key` → do nothing and **do not** call the LLM (AC-3). A differing key → continue (AC-5);
    4. `await this.jobs.enqueue(ws, BRIEF_JOB_KIND, { workspaceId: ws, prId })` → `'started'` (AC-1, AC-6).
  - `registerJobs()` — `this.jobs.register(BRIEF_JOB_KIND, (payload) => this.compute(payload as BriefComputeParams))`; call it **once** from the constructor (as `ConventionsService` does), so registration does not depend on someone poking the service first.

  **`compute(params)` — the job-handler body, entirely inside `try/catch`:**
  1. Put an entry in `#inFlight`; remove it in `finally` (AC-8).
  2. **Assemble the inputs (AC-9) — exactly these sources and no others:**
     - derived intent — `await this.deps.intent(ws, prId)`; `undefined` is a **normal** state, not an error (AC-17: the first, import-time brief almost always has no intent);
     - blast summary — **only** `params.blastSummary` if supplied. Never resolve it, never wait on it (AC-18a). In this pass it is always absent → `endpointSet` is empty and no risk can cite an endpoint (AC-18);
     - diff statistics — `repo.getChangedFiles(prId)`: paths, `additions`/`deletions`, and `changedLinesFromPatch(patch)` for the line numbers. **The `patch` text never reaches the prompt** — only the derived line numbers do (AC-10);
     - linked issue — parse the reference links out of `pr.body` (**copy** the `parseLinkedIssueRefs` logic from `modules/intent/helpers.ts` into a local helper; do not import it — cross-module imports are banned). A cross-repo reference is **recognized but never fetched**, exactly as the intent module does; that is the "unresolvable issue" of AC-19. Each fetch in its own `try/catch`: one failed issue must not take the brief down (AC-19).
  3. Fill `sources[]` with the actual contributions (`pr_title`, `pr_body`, `pr_files`, `intent`, `issue#N`, `owner/repo#N (skipped)`) — AC-17 requires recording which sources contributed; the UI turns that into a freshness signal.
  4. **Prompt.** Local `INJECTION_GUARD` and `SYSTEM_PROMPT` constants in this file (shaped like `modules/intent/service.ts`, lines 30–44), copied in substance, not imported. Each untrusted source wrapped **separately**, with its own label: `wrapUntrusted('pr-title', ...)`, `wrapUntrusted('pr-body', ...)`, `wrapUntrusted('pr-files', ...)`, `wrapUntrusted('issue-<n>', ...)` — `wrapUntrusted` is imported from `@devdigest/reviewer-core`. **Do not add denylists, regex scans, or keyword filters over untrusted text under any circumstances** — that is forbidden by repo convention; the guard is the only defence.
  5. **Exactly one** structured call (AC-11, non-functional "cost/latency"):
     ```ts
     const res = await llm.completeStructured({
       model: modelChoice.model,
       schema: BriefLlmSchema,          // local Zod schema of the MODEL OUTPUT
       schemaName: BRIEF_SCHEMA_NAME,
       temperature: 0,
       timeoutMs: BRIEF_TIMEOUT_MS,
       messages: [{ role: 'system', content: SYSTEM_PROMPT }, { role: 'user', content: userContent }],
     });
     ```
     `BriefLlmSchema` = `{ what, why, risk_level: RiskLevel, risks: [...], review_focus: [...] }` — **without** `pr_id`, `pr_state_key`, `computed_at`, `sources`, `model`, `*_total`: those are server-owned fields the model never proposes. A schema-validation failure is a failed attempt under AC-2.
  6. Model: `await this.deps.featureModelOverride(ws)` for `'risk_brief'`, falling back to `defaultFeatureModel('risk_brief')` (the registry already carries `openai/gpt-4.1`, `vendor/shared/contracts/platform.ts`). `model` is stored as `"<provider>/<model>"`. Tokens/cost are attributed to the brief and are **not** added to any `agent_runs`/review run.
  7. `groundEntries(...)` → truncation → `repo.upsertBrief({ ..., prStateKey: key, model, computedAt: new Date() })`. Empty arrays after grounding are a **valid** brief and get stored with `what`/`why`/`risk_level` (AC-14), not a reason to discard everything.
  8. **`catch`:** persist nothing, leave any previously persisted brief untouched, log the error (the `pino` logger arrives via `deps` or via the job handler), swallow it. The PR import and any review run complete normally (AC-2, US-6).
  - `risk_level` has no path out except `PrWhyRiskBrief` → UI: the service exposes no API through which a scorer, a verdict builder, or a prompt builder could read it (spec Non-goal).
- **Done when:** `cd server && pnpm typecheck`, `pnpm arch:check`, `pnpm arch:ratchet` are green; `grep -c "completeStructured" server/src/modules/brief/service.ts` = 1; `grep -n "container\.\|Container" server/src/modules/brief/service.ts` returns nothing; `grep -rn "blast" server/src/modules/brief/service.ts` shows only reads of `params.blastSummary`, never a call.
- **Tests:** deferred (unit lane: state-key derivation, path/line/endpoint grounding, enum and cap enforcement, input file selection and the top-40 cut with full-set validation, input assembly excluding hunk bodies, blast consume-only behaviour).

### 6. Routes + module registration + container — package: server/

- **Files:** `server/src/modules/brief/routes.ts` (new), `server/src/modules/index.ts` (edit), `server/src/platform/container.ts` (edit).
- **Skills:** `onion-architecture`, `fastify-best-practices`, `security`.
- **What to do:**

  **`routes.ts`** — modelled on `modules/intent/routes.ts` (not `blast/routes.ts`: the convention here is "200 with null", not 404):
  - `GET /pulls/:id/brief`, `{ schema: { params: IdParams } }` → `PrWhyRiskBriefResponse`. No brief **or** a PR from another workspace → `200 { brief: null }`, never 404 (AC-20 + AC-22: both causes are deliberately indistinguishable). A read never triggers a computation.
  - `POST /pulls/:id/brief/regenerate`, `{ schema: { params: IdParams } }` → `PrWhyRiskBriefRegenerateResponse`. Its own explicit action, **not** a `force` query flag on the read path (AC-21, matching `POST /pulls/:id/review`, `/repos/:id/refresh`, `/repos/:id/resync`). Service results: `'running'` → `200 { status: 'running' }` (AC-8 — an explicit "already running" response, never a silently duplicated LLM call); `'started'` → `200 { status: 'started' }`; `'unknown_pr'` → `NotFoundError` (a 404 is appropriate here: this is an explicit user action against a specific PR, not a passive read).
  - Rate limit (AC-38): `config: { rateLimit: { max: MAX_REGEN, timeWindow: '1 minute', keyGenerator: (req) => \`brief-regen:${(req.params as { id: string }).id}\` } }` — the budget is **per pull request**, not global and not per IP. `Retry-After` is emitted by `@fastify/rate-limit` itself alongside the 429. Background recomputes (step 7) never go through HTTP and therefore never consume the budget.
  - `workspaceId` comes from `getContext(container, req)`. Validation happens exclusively through `schema.params`; no `.parse()` inside the handler body.

  **`modules/index.ts`** — one import `import brief from './brief/routes.js';` plus one `brief,` entry in the registry. Touch nothing else in the file.

  **`platform/container.ts`:**
  - `ContainerOverrides` += `brief?: BriefPort;`
  - private field `_brief?: BriefPort;`
  - a getter modelled on `get intent()`:
    ```ts
    get brief(): BriefPort {
      if (this.overrides.brief) return this.overrides.brief;
      this._brief ??= new BriefService(
        {
          github: () => this.github(),
          llm: (provider) => this.llm(provider),
          featureModelOverride: (workspaceId) =>
            getFeatureModelOverride(this.db, workspaceId, 'risk_brief'),
          intent: (workspaceId, prId) => this.intent.get(workspaceId, prId),
        },
        new BriefRepository(this.db),
        this.jobs,
      );
      return this._brief;
    }
    ```
    The container is the only place that names concrete classes (rule 4) and the only place `container.intent` is stitched into `BriefDeps.intent`, which keeps `no-cross-module-imports` intact.
- **Done when:** `cd server && pnpm typecheck`, `pnpm arch:check`, `pnpm arch:ratchet` are green; both routes appear in the module registry; regeneration is exposed as its own `POST …/regenerate` action, **not** as a `force` query parameter or request-body field on the read path (AC-21) — the handler *does* pass `{ force: true }` to `BriefService.requestRecompute` internally, which is correct and required by AC-6 (unconditional, cache-bypassing recompute); what must be absent is `force` as HTTP surface, i.e. `req.query.force` / a `force` key in a body schema.
- **Tests:** deferred (integration: background trigger on import, cache hit/miss, forced regeneration, the rate limit and `429`/`Retry-After`, failure isolation, workspace scoping, the "none yet" response).

### 7. Triggers: import-time and post-review — package: server/

- **Files:** `server/src/modules/pulls/routes.ts` (edit), `server/src/modules/reviews/run-executor.ts` (edit).
- **Skills:** `onion-architecture`, `fastify-best-practices`, `security`.
- **What to do:**

  **Import-time (AC-1)** — coordinator's decision, option A: the trigger point is `GET /pulls/:id` in `modules/pulls/routes.ts`. That is the only place `pr_files` is actually populated (`delete` + `insert` from `detail.files`), so before it there are simply no changed files to work from.
  - In the **successful-refresh branch** — after `await container.db.update(t.pullRequests).set({...})` and **before** `return { ...detail, id: pr.id }`.
  - In the **offline fallback branch** (the `catch` that serves persisted `files`/`commits`) — likewise, before the `return`.
  - The same form in both places — `await` only the **single enqueue INSERT**, wrapped best-effort:
    ```ts
    try {
      await container.brief.enqueueRecompute(workspaceId, pr.id);
    } catch { /* best-effort — the detail response is unaffected */ }
    ```
    **The detail response never waits on the brief computation** (AC-1): `enqueueRecompute` does one `jobs.enqueue` INSERT and returns; the resolve / state-key cache / in-flight / LLM / persist all run later inside the JobRunner (`compute`). Awaiting *only the enqueue* is the fix for the integration-lane defect where a fire-and-forget `requestRecompute` issued reads against a torn-down pool (`write CONNECTION_ENDED`) — no DB query for this feature may start after the request/run has released its resources. Idempotence still comes from the state key, now checked inside the job: unchanged state → no LLM call (AC-3); a new `head_sha` **or** diff-stats digest → recompute (AC-5, including the "diff refreshed, `head_sha` unchanged" trap). `src/app.ts` also drains `container.jobs.onIdle()` in an `onClose` hook so a queued brief job can never outlive shutdown.

  **Post-review (AC-7)** — in `ReviewRunExecutor.executeRuns` (`modules/reviews/run-executor.ts`), immediately **after** the line `const intentStep = await this.buildIntentStep(...)`:
  ```ts
  try {
    await this.container.brief.enqueueRecompute(workspaceId, pull.id, { force: true });
  } catch { /* best-effort — the review run completes regardless */ }
  ```
  `{ force: true }` is required here and does **not** contradict step 5: the state key is `head_sha` + diff-stats only and has **no intent component**, so when a review run makes an intent available without touching the diff the key is unchanged and a non-forced recompute would short-circuit — leaving the stored brief permanently without `"intent"` in `sources[]` and breaking AC-7. `force` bypasses only the cache check; it costs one extra LLM call per review run and cannot loop (review runs are not triggered by the brief). `ReviewRunExecutor` already holds a `Container` (documented baseline debt) — access goes through the public `container.brief`, not a new violation.
  - The edge case "a review run produces an intent while an import-time computation is still in flight" is handled by `compute`'s in-flight guard: the second job returns early, no deadlock, and the forced job's own run picks up the fresh intent.
- **Done when:** `cd server && pnpm typecheck`, `pnpm arch:check`, `pnpm arch:ratchet` are green; the full `.it.test` lane passes with **0 unhandled errors** (`reviews.it.test.ts` clean, `brief.it.test.ts` AC-7 test un-skipped and green); `pulls/routes.ts` contains exactly two `enqueueRecompute` calls (both branches); neither trigger calls `requestRecompute` (that stays the HTTP-action-only path).
- **Tests:** deferred.

### 8. Client data layer: the brief hook — package: client/

- **Files:** `client/src/lib/hooks/brief.ts` (new), `client/src/lib/hooks/index.ts` (edit — barrel), `client/src/lib/types.ts` (edit — re-export next to the existing `export type { PrBrief, SmartDiff }`).
- **Skills:** `frontend-architecture`, `react-best-practices`, `security`.
- **What to do** — modelled on `client/src/lib/hooks/blast.ts`:
  - Type-only import: `import type { PrWhyRiskBrief, PrWhyRiskBriefResponse, PrWhyRiskBriefRegenerateResponse } from "@devdigest/shared";` — a runtime import breaks the webpack bundle (client insight, 2026-08-19).
  - `usePrWhyRiskBrief(prId: string | null | undefined)`:
    ```ts
    useQuery({
      queryKey: ["pr-why-risk-brief", prId],
      queryFn: () => api.get<PrWhyRiskBriefResponse>(`/pulls/${prId}/brief`),
      enabled: !!prId,
      refetchInterval: BRIEF_POLL_MS,   // AC-37, coordinator's decision: option A
    })
    ```
    `BRIEF_POLL_MS` is a constant in this same file, valued **15 000–20 000 ms**. No SSE, no `runBus`: background polling is the deliberate choice. The "freshness" signal is a comparison of the last response's `pr_state_key` / `computed_at` against what is currently rendered; the comparison and the decision to swap belong to the component (step 11), not the hook.
  - `useRegeneratePrBrief(prId)` — a `useMutation` against `POST /pulls/${prId}/brief/regenerate`. **`onSuccess` does not invalidate the cache** — that would directly contradict AC-37 (content must not change under the reader); success only returns `{ status }`, which the card turns into an "update started" state.
  - `429`: the `ApiError` from `lib/api.ts` should carry `status` and, where possible, `Retry-After` — pass both through to the component as-is (AC-39: the server is authoritative; the client keeps no counter of its own). If `lib/api.ts` does not currently retain response headers, **do not rewrite `api.ts` more broadly than needed**: add exactly what is required to read `Retry-After`, and name that edit in the report.
  - Export both hooks through `lib/hooks/index.ts`.
- **Done when:** `cd client && pnpm typecheck && pnpm lint` are green; `grep -rn "fetch(" client/src/lib/hooks/brief.ts` returns nothing (everything goes through `api`); no runtime import from `@devdigest/shared`.
- **Tests:** deferred.

### 9. Shared line-addressing surface in the diff viewer — package: client/

- **Files (new):** `client/src/components/diff-viewer/targeting.ts`. **(edit):** `client/src/components/diff-viewer/DiffViewer/DiffViewer.tsx`, `FileCard/FileCard.tsx`, `CodeLine/CodeLine.tsx`, `styles.ts`, `index.ts`.
- **Skills:** `frontend-architecture`, `react-best-practices`, `security`.
- **What to do** — this is a **new shared surface**, not a reuse of the finding chip. The spec says so directly: today no diff line carries an addressable anchor, no URL parameter targets a file/line, and the finding chip navigates in the **opposite** direction (diff → findings tab). Since addressing is needed both by the Overview card and by Files Changed itself, the promotion rule puts it in the shared layer (`src/components/`), not inside the brief card.

  **`targeting.ts`** — an anti-corruption layer built exactly like the neighbouring `annotations.ts` (read its header: `src/components/` may not import from `src/app/**`, so the layer declares its own minimal types and the caller does the adapting):
  ```ts
  /** One addressed line, reduced to what the diff viewer needs. */
  export interface DiffTargetApi {
    path: string;
    line: number | null;
    /** Optional: lets the caller learn whether the line resolved. */
    onResolved?: (state: "anchored" | "unanchored") => void;
  }

  export type TargetState = "none" | "anchored" | "unanchored";

  export function resolveTarget(
    filePath: string,
    lines: Line[],
    target: DiffTargetApi | undefined,
  ): TargetState;
  ```
  `resolveTarget` uses **the same** line-membership criterion as `partitionMarks` in `annotations.ts`: the set of `ln.newNo` and `ln.oldNo` from the `parsePatch` result. `patch === null` (present in seed data — PR #482, all 4 files with `patch = NULL`) or a line outside every rendered hunk → `"unanchored"`.

  **`DiffViewer`** — a new **optional** prop `targeting?: DiffTargetApi`, exactly like the existing `commenting?` / `annotations?`. `undefined` changes no existing rendering — the same compatibility guarantee `annotations.ts` documents and a regression test in `DiffViewer.test.tsx` enforces.

  **`FileCard`** — when `targeting.path` matches `file.path`:
  - force the card open, even if the file is large and would otherwise collapse under `AUTO_EXPAND_MAX_LINES`;
  - `anchored` → scroll the target line into view and mark it visually (AC-28);
  - `unanchored` → scroll the file's card into view and show an "exact line unavailable" note in the **card footer**, next to the existing unanchored finding-chip block (AC-29 and its precedent). The tab is never left at an arbitrary scroll position.

  **`CodeLine`** — a new prop `isTarget?: boolean` → highlight from `styles.ts`; plus a stable `id` of the form `L{newNo}` within the file's card, so there is something to scroll to.

  **Effects:** the scroll runs in a `useEffect` keyed on `(targeting?.path, targeting?.line)` — synchronizing with an external system (DOM/scroll), the legitimate case. Do **not** introduce derived state via `useEffect`: `TargetState` is computed during render from props and `lines`.
- **Done when:** `cd client && pnpm typecheck && pnpm lint` are green; the existing `DiffViewer.test.tsx` (the "without the new props, rendering is unchanged" regression) passes **unmodified**; `grep -rn "from \"@/app\|from '../../app" client/src/components/diff-viewer/` returns nothing.
- **Tests:** deferred.

### 10. URL addressing and passing the target into Files Changed — package: client/

- **Files:** `client/src/lib/hooks/diff-target.ts` (new), `client/src/lib/hooks/index.ts` (edit), `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` (edit), `client/src/app/repos/[repoId]/pulls/[number]/_components/DiffTab/DiffTab.tsx` (edit).
- **Skills:** `frontend-architecture`, `next-best-practices`, `react-best-practices`, `security`.
- **What to do:**

  **`lib/hooks/diff-target.ts`** — `useDiffTarget()`: reads `?file=` and `?line=` through `useSearchParams` and returns a normalized target `{ path: string; line: number | null } | null` (a non-numeric `line` becomes `null`, not `NaN`). The hook **does not navigate itself** — and that is not a detail: `page.tsx` already carries `setParams(entries)` precisely because several consecutive `setParam` calls read a stale snapshot and overwrite each other (there is a comment about it there). The navigation is built by `page.tsx` in a single call:
  ```ts
  setParams([["tab", "diff"], ["file", path], ["line", String(line)], ["diffMode", null]])
  ```
  — one navigation, all other URL params preserved (AC-27). The file must stay self-contained: `src/lib/` does not import `src/app/**`.

  **`page.tsx`:**
  - read `file`/`line` (via `useDiffTarget`) and pass them into `DiffTab` as `target`;
  - add an `onOpenLine(path, line)` callback using the same batched `setParams`, and pass it into `OverviewTab` (for the brief card, step 11);
  - `KNOWN_TABS` does not change; unknown `?tab=` values keep falling back to `overview` as they do today.

  **`DiffTab`:**
  - accept `target` and pass it into `DiffViewer` as `targeting`;
  - in `diffMode === "smart"` the target line is not addressable — when opened with a target, switch to `normal`. That is already part of the same `setParams` above (`["diffMode", null]`), i.e. it mirrors what the existing `onOpenFinding` does.
- **Done when:** `cd client && pnpm typecheck && pnpm lint` are green; the existing `DiffTab.test.tsx` and `OverviewTab.test.tsx` pass unmodified; a Review Focus click performs **exactly one** `router.replace` (one `setParams`) — verified by reading the code, not by a test.
- **Tests:** deferred.

### 11. The Why + Risk Brief card on Overview — package: client/

- **Files (new):** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/WhyRiskBriefCard/{WhyRiskBriefCard.tsx, styles.ts, constants.ts, helpers.ts, index.ts}`. **(edit):** `OverviewTab/OverviewTab.tsx`, `client/messages/en/prReview.json`.
- **Skills:** `frontend-architecture`, `react-best-practices`, `security`.
- **What to do:**
  - **Card states — via early returns**, not nested ternaries:
    - request in flight and nothing rendered yet → skeleton placeholder (AC-31);
    - request failed → an error state with a retry action; the card does **not** disappear and does not render empty (AC-32);
    - `brief === null` → an explicit "not generated yet" state with a regenerate button (AC-33 — explicitly a state, because unlike intent the user has a way out of it).
  - **Content:** `what`, `why`, the `risk_level` indicator, the Review Focus block. `risks[]` is **not** rendered here (AC-24) — its only home is the Intent block (step 12).
  - **`risk_level`:** colour **plus** a non-colour cue — a text label or an icon (AC-26). The lookup is **total**: `RISK_LEVEL[level] ?? RISK_LEVEL.low` — the contract is not parsed on the client, so an out-of-enum value must not break rendering (client insight, 2026-08-19). The colour/label table lives in the card's `constants.ts`.
  - **Review Focus:** each entry is a `<button>` (not a clickable `div`), with an accessible name that **includes the file path** (non-functional "Accessibility"); clicking calls `onOpenLine(path, line)` from props (AC-27). Keyboard reachability comes for free from the right element — which is exactly why it must not be a `div`.
  - **Truncation (AC-35):** if `review_focus_total > review_focus.length`, show "showing X of Y" so the list does not read as exhaustive.
  - **Regenerate (AC-30 + AC-39):** two **distinct** disabled reasons, with different text:
    1. mutation in flight → "regenerating…" (AC-30);
    2. budget exhausted (`ApiError.status === 429`) → disabled plus the time remaining until the next slot, from `Retry-After` (AC-39). The client treats the server's `429` as authoritative and keeps **no** counter of its own.
    On completion the card refreshes its data (AC-30) — but without silently swapping the content, see the next bullet.
  - **"Brief updated" (AC-37):** when the background poll (step 8) returns a response whose `pr_state_key`/`computed_at` differ from the rendered brief, show an unobtrusive notice with an explicit refresh action. The on-screen content is **not** replaced until the reader activates it. Do the comparison during render from the hook's data and the "accepted" version held in state; do not build chains of `useEffect`.
  - **Render safety:** brief text is rendered as text only (JSX escaping). No `Markdown`, no `dangerouslySetInnerHTML` for any model-authored field. For a `Badge` carrying model text, use `style={{ whiteSpace: "normal" }}` (the sanctioned `nowrap` workaround, no `vendor/ui` fork).
  - **i18n:** all strings go into `client/messages/en/prReview.json` under a new `whyRiskBrief` key (next to the existing `intent`). The legacy namespace `messages/en/brief.json` (from the old `PrBrief`, with no consumer anywhere in the code) is **not** touched and **not** reused.
  - **`OverviewTab.tsx`:** place the card in the left column **above** the Description block; `onOpenLine` arrives as a prop from `page.tsx` (the page owns navigation, the component owns rendering, per `client/AGENTS.md`).
  - Keep the component within ~200 lines: extract the state sub-views (skeleton / error / empty / review-focus list) into their own PascalCase components in the same file or sibling files — **never** as `renderX()` factories.
- **Done when:** `cd client && pnpm typecheck && pnpm lint` are green; `grep -rn "dangerouslySetInnerHTML\|<Markdown" WhyRiskBriefCard/` returns nothing; no inline `style` outside `styles.ts` (other than the sanctioned `whiteSpace` override on `Badge`); `git status` shows no changes under `client/src/vendor/ui/`.
- **Tests:** deferred (client lane: card states, the two disabled reasons, URL construction on a Review Focus click, the "brief updated" notice instead of an in-place swap, truncation counts).

### 12. `risks[]` in the Intent block — package: client/

- **Files:** `client/src/app/repos/[repoId]/pulls/[number]/_components/OverviewTab/_components/IntentCard/IntentCard.tsx` (edit), its `styles.ts` (edit), `OverviewTab/OverviewTab.tsx` (edit — pass the props down), `client/messages/en/prReview.json` (edit).
- **Skills:** `frontend-architecture`, `react-best-practices`, `security`.
- **What to do:**
  - `IntentCard` accepts new **optional** props `risks?: BriefRisk[]` and `risksTotal?: number`. The data comes from the same hook in `OverviewTab` — the card fetches nothing itself (AC-34: the single access point is the hook in the hooks layer).
  - Render below the existing quote / In scope / Out of scope and **above** the confidence-badge footer (AC-25: "positioned below the existing intent quote, In scope and Out of scope sections").
  - Each risk: title plus a `path:line` reference. Both may be `null` (grounding nulls them out) → show only the title, with no "null:null" and no dangling separator.
  - Truncation (AC-35): if `risksTotal > risks.length`, show "showing X of Y".
  - **The `styles.ts` trap:** `display: flex` on a `<ul>` replaces `display: list-item` on its children and markers silently disappear — render the marker as a real element in JSX, exactly as `ScopeList` in this same file already does (client insight, 2026-08-19, recorded from this very component).
  - A `Badge` carrying model text → `style={{ whiteSpace: "normal" }}`.
  - **A consequence worth knowing:** `IntentCard` renders only when an intent exists, and intent only appears as a side effect of a review run. So until the first review, `risks[]` is visible nowhere. That is a direct consequence of AC-24 + AC-25 and **not** an implementation bug — recorded in *Risks*.
- **Done when:** `cd client && pnpm typecheck && pnpm lint` are green; `risks[]` is not rendered in `WhyRiskBriefCard` (grep the prop name); the existing `OverviewTab.test.tsx` passes, or — if it fails due to changed markup — the failure is **named in the report** with the exact test, and fixing it moves into the deferred test pass.
- **Tests:** deferred.

---

## Verification gates

Run inline: after the server group (steps 1–7), after the client group (steps 8–12), and the full set at the end.

- [ ] `node scripts/sync-shared.mjs --check` (cwd: repo root) — **immediately after step 1**, mandatory: out-of-sync copies make every downstream type error meaningless
- [ ] `cd server && pnpm typecheck`
- [ ] `cd server && pnpm arch:check`
- [ ] `cd server && pnpm arch:ratchet`
- [ ] `cd server && pnpm db:migrate` (after step 2; it does not run on boot)
- [ ] `cd client && pnpm typecheck`
- [ ] `cd client && pnpm lint` (`eslint --max-warnings 0`; there is no suppression baseline)

**Order** — per `gates.md`: `sync-shared --check` → typechecks → `arch:check` → `arch:ratchet` → client lint. Stop early only on a `sync-shared` failure.

**Package managers:** `server` and `client` use **pnpm 10**; `reviewer-core` and `e2e` use npm. Running the wrong one installs a second lockfile and is itself a finding. This plan does not touch `reviewer-core`/`e2e`.

### Deferred to a separate test pass

Not in this pass — but `pr-self-review` will require them before a PR is opened, and none of them may be marked PASS without actually running:

- [ ] `cd server && pnpm exec vitest run --exclude '**/*.it.test.ts'` — existing unit tests (regression)
- [ ] `cd server && pnpm exec vitest run .it.test` — **mandatory per `gates.md`**, because step 2 touches `server/src/db/**`; requires Docker (testcontainers)
- [ ] `cd client && pnpm test` — existing tests (regression)
- [ ] new tests per the spec's **Verification** section: server-unit (state key, grounding, caps, top-40, input without hunk bodies, blast consume-only), server-integration (import trigger, cache hit/miss, forced regen, 429/`Retry-After`, failure isolation, workspace scoping, "none yet"), client (card states, `risks[]` only in the Intent block, truncation counts, URL construction, "brief updated", the two disabled states), one `e2e/*.flow.json` (Overview → risk level → Review Focus click → Files Changed with the target line in view; plus the unanchored fallback against seed data with `patch = NULL`)
- [ ] integration tests go in **`server/test/`**, not in `src/modules/brief/` (`server/insights/INSIGHTS.md`, 2026-08-27), and must be named `*.it.test.ts` or they silently run in the unit lane

In this pass's final report, list these lanes as **not run**, never as PASS. A gate that was not run is not a gate that passed.

---

## Risks

- **Existing test suites are not run in this pass.** A regression in `OverviewTab.test.tsx`, `DiffViewer.test.tsx`, or `DiffTab.test.tsx` will only surface in the next pass or at `pr-self-review`. *Mitigation:* steps 9–12 explicitly require zero change to default behaviour (`targeting === undefined` ⇒ the old rendering, as the regression test in `DiffViewer.test.tsx` guarantees), so the risk is localized to three files. The implementer must list in the report every file whose existing test it may have touched.
- **Step 2 touches `server/src/db/**`, so the integration lane is mandatory before a PR — and it is deferred.** Accepted deliberately; record it in the report as "gate not exercised", never as PASS. Docker absent ⇒ `SKIPPED (<why>)`, not green.
- **AC-12a is implemented as a deliberately inert stub** (coordinator's decision, option A). Neither the GitHub adapter, nor `pr_files`, nor the `PrFile` contract stores the previous path of a renamed file — verified by grep: `previous_filename`/`previousFilename` are entirely absent from `server/src` and `client/src`. The `pathsByAlias` structure exists in `helpers.ts` and is consulted during grounding, but it has no data source, so the alias set is always empty and dual-path validation effectively never fires. `pr_files` / `PrFile` / the GitHub adapter are **not** extended in this pass. *Accepted because* closing that gap is a vendored-contract change plus another migration, which is a separate decision outside this plan's scope. Document the stub with a code comment so the next reader sees it is unfinished on purpose, not forgotten.
- **The blast input is absent for the whole of this pass** (coordinator's decision, option A). `blastSummary?` exists on `BriefComputeParams`, but no caller supplies it: `BlastService` computes blast on demand via BFS and caches it nowhere, and AC-18a forbids the brief from triggering that computation. Consequences: `endpointSet` is always empty, no risk ever cites an endpoint (the normal AC-18 path), and the endpoint-validation branch stays uncovered by real data until L04 is finished. *Accepted* as a direct reading of AC-18 + AC-18a, not as a workaround.
- **`risks[]` is invisible until a review run has happened.** AC-25 fixes the Intent block as the only place they render, and `IntentCard` only exists once an intent has been computed — i.e. after a review. Until then the brief shows `what`/`why`/`risk_level`/Review Focus, but no risks. *Accepted*, because the alternative would require changing AC-24/AC-25, which is a specification-level decision, not a planning one.
- **A route-level `config.rateLimit.keyGenerator` has not been used in this repo before:** the existing routes (`blast`, `conventions`, `reviews`, `settings`) use only `max`/`timeWindow`. *Mitigation:* if the installed `@fastify/rate-limit` version does not support a route-level `keyGenerator`, implement the budget inside the service (an in-memory window keyed on `prId`) and emit `AppError(..., 429)` with a `Retry-After` header by hand — the HTTP contract of AC-38 does not change, only where it is implemented. Name the chosen variant in the report.
- **The in-flight guard is in-memory, i.e. single-process.** `JobRunner` is in-process too (`PQueue`), so this is correct in the current architecture, but AC-8's deduplication would silently stop working across multiple API instances. *Mitigation:* a comment in `service.ts` naming that precondition explicitly.
- **Background polling every 15–20 s on an open PR** (AC-37, option A) means constant traffic to `GET /pulls/:id/brief` for as long as the tab is open. The read is cheap (a single PK SELECT, no LLM call, and it triggers no computation), so this is *accepted*; but if it ever becomes a problem, the right answer is SSE over the existing `runBus`, not blindly raising the interval.
- **The `GET /pulls/:id` trigger fires on every PR-detail open.** The only thing preventing wasted work is the state key: an unchanged state → no enqueue with an LLM call. If `derivePrStateKey` turns out to be unstable (e.g. non-deterministic sorting, or including a field that drifts), every PR open costs one LLM call. *Mitigation:* the sort inside `derivePrStateKey` is deterministic and will be covered by the very first unit test in the deferred pass; until then, careful reading of the function at review time.

## Open questions

None — all four were resolved before start (option A on each): AC-12a remains an inert stub; the blast input is always absent in this pass; the import trigger is `GET /pulls/:id` in both branches after `pr_files` is persisted; brief freshness is determined by background polling comparing `pr_state_key`/`computed_at`, without SSE. The consequences of each decision are carried in *Risks* and baked into the relevant steps.
