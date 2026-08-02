# server/ — Fastify API + Postgres

HTTP, persistence, and all I/O for reviews. Pure review logic does **not**
belong here — it lives in `reviewer-core/`; this layer only gathers context
and persists results.

## Stack

Fastify 5 · Drizzle ORM 0.38 + `postgres` 3 (Postgres + pgvector) ·
`fastify-type-provider-zod` (one Zod schema = validation + serialization) ·
`fastify-sse-v2` · pino · Octokit 4 · simple-git · `@ast-grep/napi` ·
dependency-cruiser · vitest 2 + testcontainers.

## Commands

```sh
pnpm dev                  # :3001 (assumes the DB is already migrated)
pnpm db:migrate           # after every schema change — NOT run on boot
pnpm db:seed              # idempotent demo data
pnpm exec vitest run --exclude '**/*.it.test.ts'   # unit, no Docker
pnpm exec vitest run .it.test                      # integration, needs Docker
pnpm typecheck
```

## Map

- `src/app.ts` — Fastify assembly: plugins → error handler → modules.
- `src/platform/` — DI container, config, JobRunner, SSE bus, errors.
- `src/adapters/` — outbound ports (llm · github · git · codeindex · secrets ·
  tokenizer · depgraph) plus `mocks.ts` for tests.
- `src/modules/<name>/` — one feature: `routes.ts` → `service.ts` → `repository.ts`.
- `src/modules/index.ts` — the static module registry.
- `src/db/schema/` — schema domains; `schema.ts` is the barrel over them.
- `src/vendor/shared/` — vendored Zod contracts (`@devdigest/shared`).

## Read when

Read [README.md](./README.md) when you need the layer overview, the API map, or the env-var table.
Read [docs/](./docs/README.md) when digging into a mechanism: review pipeline, DI, repo-intel, jobs/SSE.
Read [specs/](./specs/README.md) when changing a public route contract or a persistence invariant.
Read [insights/](./insights/README.md) when optimizing or changing behaviour that has already been measured.
Read [../TESTING.md](../TESTING.md) when adding a test and unsure which lane it lands in.

## Non-default conventions

- A new module is a `modules/<name>/` folder plus one import in
  `modules/index.ts`. We do not autoload from the filesystem.
- Reach the outside world only through a container port (`container.llm()`,
  `container.github()`, …). In tests substitute via `ContainerOverrides` rather
  than mocking modules.
- Secrets are read only through `SecretsProvider` (`~/.devdigest/secrets.json`).
  Do not add keys to `AppConfig` or the DB. `GITHUB_TOKEN` is canonical,
  `GITHUB_PAT` is a fallback.
- Validate with the route schema (`schema.body` / `schema.params`), not with
  `.parse()` inside the handler.
- An integration test (anything importing `test/helpers/pg.ts`) **must** be named
  `*.it.test.ts`, or it silently runs in the unit lane.
- repo-intel degrades instead of throwing: arrays → `[]`, objects →
  `degraded: true`. Wrap prompt enrichment in try/catch and simply omit the section.

## Gotchas

- `relation ... does not exist` → you forgot `pnpm db:migrate` (it does not run on boot).
- A run stuck in `running` → the process died earlier; boot reaps stale runs, so
  restart the API.
- No repo map in the prompt → the repo is not indexed yet. Not an error — this is
  the designed degradation.
- `pnpm test:unit` may not exist: `package.json` is under `git skip-worktree` and
  the local variant diverges from the committed one. Call `pnpm exec vitest run …`.

## Do not touch

- `clones/` — runtime data (cloned repos), git-ignored, touched by no test suite.
- `src/vendor/shared/` — vendored contract; the client holds a **second copy** and
  the two have already diverged. Edit here and edit there, deliberately, together.
- `package.json` — under `skip-worktree`; a change will not land in a commit the
  way you expect.
