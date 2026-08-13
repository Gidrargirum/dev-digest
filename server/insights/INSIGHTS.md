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

## Recurring Errors & Fixes

## Session Notes

## Open Questions
