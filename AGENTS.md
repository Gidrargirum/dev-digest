# DevDigest — repository map

Local-first AI pull-request review: import a PR → run an agent → get grounded
findings.

This is the **course starter template**, deliberately minimal: lessons L01–L08
add features back one at a time. Don't build them preemptively — if something
looks "missing" (cost badge, skills, memory, multi-agent, CI export), it is
almost always a later lesson, not a bug.

## Stack

Fastify 5 · Drizzle + Postgres/pgvector · Next.js 15 + React 19 ·
TanStack Query 5 · Zod 3 · TypeScript 5.7 · vitest 2 · agent-browser.
Node ≥ 22, pnpm ≥ 10, Docker (for Postgres only).

## Packages

Five independent packages, **no workspace**: each has its own `package.json`
and lockfile; cross-package code is shared through tsconfig path aliases to
source, not through published npm packages.

| Package | Role | Rules | Overview |
|---|---|---|---|
| `server/` | Fastify API + Postgres, :3001 | [AGENTS.md](./server/AGENTS.md) | [README](./server/README.md) |
| `client/` | Next.js studio, :3000 | [AGENTS.md](./client/AGENTS.md) | [README](./client/README.md) |
| `reviewer-core/` | pure review engine | [AGENTS.md](./reviewer-core/AGENTS.md) | [README](./reviewer-core/README.md) |
| `e2e/` | browser flows | [AGENTS.md](./e2e/AGENTS.md) | [README](./e2e/README.md) |
| `mcp/` | local MCP server (stdio) | [AGENTS.md](./mcp/AGENTS.md) | [README](./mcp/README.md) |

`@devdigest/shared` — Zod contracts, **vendored as two copies**
(`server/src/vendor/shared`, `client/src/vendor/shared`). The copies have
already diverged; editing one without the other silently breaks types.

## Commands

```sh
./scripts/dev.sh              # everything from zero: Postgres + migrate + seed + API + web
./scripts/e2e.sh              # browser flows on an isolated stack
cd server && pnpm db:migrate  # after a schema change — NOT run on boot
pnpm typecheck                # per package, separately
```

Tests are one suite per package; there is no top-level runner. Per-package
commands live in that package's `AGENTS.md`.

## Read when

Read [README.md](./README.md) when you need the product overview, the architecture diagram, or the L01–L08 lesson table.
Read [TESTING.md](./TESTING.md) when adding a test, changing CI, or unsure which lane a test lands in.
Read [docs/](./docs/README.md) when you need to understand a mechanism that crosses package boundaries.
Read [specs/](./specs/README.md) when changing a cross-package contract or accepting a lesson feature.
Read [insights/](./insights/README.md) when about to optimize something that has already been measured.
Read `<package>/AGENTS.md` when working inside a package — its layer conventions live there.

## Session protocol

Before opening a pull request, invoke the `pr-self-review` skill. It routes the
diff onto the relevant skills, runs the gates for the touched packages, and
blocks on a critical finding; a `PreToolUse` hook holds `gh pr create` until it
has passed.

At the end of every session, invoke the `engineering-insights` skill
unconditionally — don't wait for it to seem "worth it". The skill decides
internally whether anything qualifies; a clean "nothing to record" exit is
the expected outcome for most sessions, not a failure to comply with.

## Repo-wide rules

- Per-module conventions live in `<package>/AGENTS.md` and are **not duplicated
  here**.
- Documentation is linked, never restated: `README`/`docs/` are the source of truth.
- No `@import` in any `AGENTS.md` — pointer links only, read on demand. Cap each
  file at 100 lines.
- An `AGENTS.md` is a map, not a manual: stack, commands, where things live,
  non-default conventions, gotchas, do-not-touch. Explanations belong in `docs/`.
- Doc folder split: `docs/` — how it works · `specs/` — what must hold ·
  `insights/` — what we learned (dated write-ups).

## Gotchas

- `relation ... does not exist` → migrations not applied: `cd server && pnpm db:migrate`.
- Secrets live neither in env nor in the DB: `SecretsProvider` →
  `~/.devdigest/secrets.json` (mode `0600`), `process.env` only as a fallback.
- `REPO_INTEL_ENABLED` defaults to `true`, but the repo map reaches the prompt
  only after indexing; an unindexed repo silently degrades to diff-only.

## Do not touch

- **`docker compose down -v`** — deletes the `devdigest_pgdata` volume with every
  imported repo and review. For a clean stack use `./scripts/e2e.sh`.
- `server/clones/**` — runtime data, git-ignored, touched by no test suite.
- `server/package.json` — editable, but check `git ls-files -v package.json` first
  (`S` = `skip-worktree`, edits won't commit · `H` = normal; the flag is local,
  never committed). CI calls `pnpm exec vitest run …` directly because the lane
  split has no npm script, not because of this flag.
- `CLAUDE.md` in every package dir — a symlink to the adjacent `AGENTS.md`, kept
  only because Claude Code reads `CLAUDE.md`, not `AGENTS.md`. Edit `AGENTS.md`;
  never replace the symlink with a copy.
