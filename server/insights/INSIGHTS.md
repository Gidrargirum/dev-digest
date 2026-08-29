# server — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../AGENTS.md for layer rules.

## What Works

- Onion ring boundaries are enforced by `pnpm arch:check`
  (`server/.dependency-cruiser.cjs`), which cruises `src` **and**
  `../reviewer-core/src` so domain purity is checked across the package border.
  It needs no Docker, DB or keys and runs in ~1s over 450 dependencies, so it
  belongs next to `pnpm typecheck` in CI, not in a slow lane.
- The gate is green over 17 pre-existing violations via
  `.dependency-cruiser-known-violations.json` + `--ignore-known` (a ratchet, per
  the lastminute.com pattern). This is what makes enforcement adoptable on an
  existing codebase: the count may fall, never rise. A PR whose baseline diff
  contains **added** entries is unwinding the ratchet — invisible unless someone
  opens the JSON, so check that diff explicitly in review.

## What Doesn't Work

## Codebase Patterns

- The documented layer debt, as measured by `pnpm arch:violations` (2026-08-13):
  8 × routes/helpers importing `db/schema.ts` directly, 4 × `no-circular` from
  `service.ts ↔ platform/container.ts`, 2 × `repo-intel/service.ts` reaching into
  concrete adapters, 1 × `repos/service.ts` → `repo-intel/constants.ts`. The
  cycles all have the same root cause: services taking `Container` instead of the
  ports they actually use, which points the application ring at the composition
  root.
- **2026-08-13, same day** — that count is now **12**, and `no-circular` is empty.
  What actually mattered: taking `Container` is only a *cycle* when the container
  also **constructs** the service. `repo-intel` was the sole such case (`container.ts`
  imports `RepoIntelService`), and converting just it to a `RepoIntelDeps` port
  bundle cleared 4 of the 5 cycles in one change. `repos`/`agents`/`reviews` still
  take `Container`, but they are built in `routes.ts`, so they never closed a
  loop — their debt is testability, not a broken ring. Do not assume "service takes
  Container" and "cycle" are the same finding; check who calls `new`.
- The 5th cycle (`agents/helpers.ts ↔ agents/repository.ts`) was not DI at all —
  helpers imported row *types* from the repository. `src/db/rows.ts` exists for
  exactly this and its header says so; the repository already re-exports from it.
- A rule scoped `from: ^src/(adapters|platform)/` to `^src/modules/` fires 5× on
  `platform/container.ts` alone. The composition root is entry ring, not
  infrastructure — exempt it by path or the rule is unlandable.
- **2026-08-29** — Any new execution path that calls `reviewPullRequest`
  (e.g. `modules/eval/batch-executor.ts`) must resolve and pass the agent's
  linked `skills` (resolved skill bodies), the same way
  `reviews/run-executor.ts`'s `buildSkillBodies` does — passing only
  `systemPrompt` silently runs the review without the agent's configured
  skills; nothing errors or warns, it just quietly changes what got reviewed.

## Tool & Library Notes

- dependency-cruiser resolves `@devdigest/shared` through `server/tsconfig.json`
  paths, so imports from `reviewer-core/` land on `server/src/vendor/shared` and a
  naive "domain may not import server" rule fires on every core file. The fix is
  `to: { path: '^src', pathNot: '^src/vendor/shared' }` — `vendor/shared` is the
  innermost ring (contracts + port interfaces), so the core importing it is
  correct, not a violation.
- `dependency-cruiser` was already a `server/` dependency (17.4.3) long before any
  architecture gate existed — it ships as the runtime engine behind
  `src/adapters/depgraph/` for repo-intel. Adding `arch:check` cost no new
  dependency.
- `skip-worktree` is per-clone state in `.git/index` and is **never committed**, so
  a doc asserting "`server/package.json` is under skip-worktree" (root `AGENTS.md`,
  `server/AGENTS.md` ×2, `TESTING.md`, 3 CI workflow comments) cannot be true
  repo-wide by construction — it describes one machine. Verify per clone with
  `git ls-files -v package.json`: `S` = skipped, `H` = normal. This clone reads
  `H` and the working tree matches `HEAD`, so edits to it commit normally.
- CI's habit of calling `pnpm exec vitest run …` instead of `pnpm test:unit` is
  **still correct**, but not for the reason its comments give: `test:unit` /
  `test:integration` have never existed in `server/package.json` in any commit
  (`git log -S'test:unit'` is empty). Same for e2e calling `pnpm exec tsx
  src/server.ts` — the committed `start` is `node dist/server.js`, which is the
  wrong entrypoint for a dev-mode API regardless of any git flag. Fix the
  rationale, keep the commands.
- **2026-08-13** — `pnpm db:generate` turns **interactive** when one table gains
  and loses columns in the same generation: drizzle-kit cannot tell an add from a
  rename and prompts `Is <col> created or renamed from another column?`, which
  hangs any non-TTY run. Split it into two passes — generate the additions with
  the doomed column still in the schema file, then delete it and generate again.
  Two migrations, zero prompts, and neither file is hand-edited (hand-editing a
  generated migration is itself a review finding).
- **2026-08-13** — `MockGitClient.readFile` returns `''` for an unknown path
  instead of throwing (`src/adapters/mocks.ts`). Code that distinguishes "file
  absent" from "file present but empty" via try/catch therefore takes the wrong
  branch under test while behaving correctly against `SimpleGitClient`, which
  does throw `ENOENT`. Treat empty content as absent at the call site rather than
  relying on the throw.
- **2026-08-13** — `RipgrepCodeIndex.grep` passes the pattern positionally, and
  ripgrep parses flags in **any** argv position: a pattern of `--pre=<cmd>` makes
  rg execute that command once per scanned file. `spawn` without `shell: true`
  stops shell metacharacters, not flag smuggling — the separator `--` before the
  positionals is what stops it (added 2026-08-13). Any adapter that forwards a
  caller-supplied string as a positional argument needs the same treatment, and
  callers passing model-authored patterns should reject a leading `-` as well.

- **2026-08-19** — `RunLogger` (`src/platform/run-logger.ts`) has no `warn`; the
  methods are `event/info/tool/result/error/step`. `.step()` is also the wrong
  wrapper for a best-effort stage: on throw it emits an `error`-kind event **and
  re-throws**, so the Live Log paints the whole run as failed for a step the run
  actually survived. Wrap the optional work in your own try/catch and report the
  failure with `runLog.info(...)` — the pattern `buildCallersDigest` /
  `buildRepoMapDigest` / the intent step in `reviews/run-executor.ts` already use.
- **2026-08-28** — A body-less Fastify `POST` reaches the
  `fastify-type-provider-zod` body validator as `null`, so a route that supports
  both no payload and an object payload (for example `modules/brief/routes.ts`)
  must declare its body schema with `.nullish()`: `.optional()` alone rejects the
  no-payload form with the app's validation `422`.
- **2026-08-28** — `agent_runs.status = 'done'` is a completion boundary for
  pollers: once they observe it, they immediately request the run trace. Persist
  `run_traces` before publishing `done` in `reviews/run-executor.ts`; the inverse
  order creates a real race where a completed run temporarily has no trace.
- **2026-08-29** — `.dependency-cruiser.cjs`'s `service-not-in-adapters` rule
  only matches files literally named `service.ts`
  (`from: { path: 'src/modules/[^/]+/service\.ts$' }`) — a same-module file
  with a different name (e.g. `batch-executor.ts`, `reviews/diff-loader.ts`)
  that imports `adapters/**` directly is invisible to `arch:check`/
  `arch:ratchet`, not even a `warn`. Two files now rely on this gap; treat it
  as a real enforcement hole to check by eye, not a rule you can trust to
  catch adapter leakage outside `service.ts`.
- **2026-08-29** — Every Zod route-schema validation failure maps to HTTP
  `422` app-wide (`src/app.ts`'s global error handler), never `400` — this
  applies uniformly, not just the body-less-POST case noted above. A spec/AC
  that says "reject with 400" for a malformed request body is wrong for this
  codebase; write the assertion (and the AC) as `422`.

## Recurring Errors & Fixes

- **2026-08-13** — An integration test that injects `ContainerOverrides.repoIntel`
  must stub `registerIndexJobHandlers` as a no-op, not just the methods under
  test. `modules/repo-intel/routes.ts` calls it at plugin load, so a partial stub
  fails every route in the app with `container.repoIntel.registerIndexJobHandlers
  is not a function` at `buildApp` time — the failure names repo-intel and points
  at boot, which reads like an app bug rather than a test-double gap.

- **2026-08-27** — `arch:check`/`arch:ratchet` only cruise `src` (+ `../reviewer-core/src`), not `server/test/` — every existing `*.it.test.ts` lives in `server/test/` for exactly this reason. A test file placed inside `src/modules/<name>/` instead (e.g. because a Development Plan named that path literally) trips real, new violations the moment it needs a DB row type or a sibling module's port: `repository-owns-persistence` on `import * as schema from '../../db/schema.js'`, and `no-cross-module-imports` on importing another module's `service.ts`/`repository.ts` to build a fake. Fix is to move the file to `server/test/` (adjusting relative imports), not to bless the violation in the ratchet baseline. If the test only needs a row *type* (not the schema module itself), add it to `src/db/rows.ts` instead — that file is explicitly exempt from `repository-owns-persistence` and already exists so cross-cutting consumers can reference a row shape without importing `db/schema.ts`.

- **2026-08-29** — `src/db/seed.ts`'s PR #482 review was originally inserted
  with no `agentId` (agents are seeded later in the same `seed()`). Any
  client feature that gates on `review.agent_id` being truthy (e.g.
  `FindingsPanel`'s `Turn into eval case` button) is then unreachable through
  the seeded UI/e2e path regardless of triage state — not a bug in the
  feature, a gap in the seed. Fixed with a post-agent-creation idempotent
  `UPDATE reviews SET agent_id = ... WHERE pr_id = ...` backfill. Check this
  whenever a new feature reads `agent_id` off a seeded review.
- **2026-08-29** — A repository method that finds "latest related row per
  parent" via a join keyed off the *related* table (e.g. `evalBatches` →
  latest per `agent_id`) silently drops every parent with zero related rows
  — an agent with no eval batches never appeared in the dashboard list. When
  a spec requires listing every parent regardless of whether related data
  exists, query parents and related rows separately and merge in memory (or
  use a `LEFT JOIN`), not a join anchored on the child table.

## Session Notes

## Open Questions
