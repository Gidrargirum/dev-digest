# `modules/blast` — Blast Radius

A read-only impact map for a PR's diff: which symbols were declared in the
changed files, who imports or calls them, and which HTTP endpoints (and cron
jobs) might be affected — up to two hops of the reverse import graph. No LLM
call anywhere in this module; every fact comes from the repo-intel index.
Normative spec: `specs/blast-radius.md`.

## Route

- `GET /pulls/:id/blast` → `PrBlastResponse` (`@devdigest/shared`).
  - `:id` not found, or found in a **different** workspace → `404`
    (`NotFoundError`) — the two causes are indistinguishable by design (see
    `BlastRepository.resolvePr`).
  - PR found, but `repoIntel.getBlastRadius` reports `degraded: true` (repo
    never indexed, index failed, …) → `200`, `status: 'degraded'`,
    `blast: null`, non-empty `reason`.
  - PR found and a reverse-import hop was width-capped (200-file fan-out) →
    `200`, `status: 'partial'`, `blast` populated with what was computed.
  - Otherwise → `200`, `status: 'ok'`, `reason: null`.

## Layering

- `repository.ts` (infra) — two workspace-scoped Drizzle reads: resolve `:id`
  to a PR row + `repo_id` (tenancy enforced in the query itself, joining
  `pull_requests` → `repos`), and the PR's changed file paths (`pr_files`).
- `service.ts` (application) — takes `BlastRepository` + `RepoIntel`
  (`container.repoIntel`), never the `Container`. Resolves the PR, fetches
  changed files, calls `repoIntel.getBlastRadius`, and hands the result to
  `mapBlastResult`.
- `helpers.ts` — the pure `BlastResult` → `PrBlastResponse` mapping: groups
  `callers` by `viaSymbol` into `downstream[]`, attributes
  `endpoints_affected`/`crons_affected` per symbol from the `factsByFile` of
  that symbol's caller files, and derives `status`/`reason`/`counts` from the
  `degraded`/`hopCapped` signals `RepoIntelService.getBlastRadius` already
  carries.
- `routes.ts` (entry) — `GET /pulls/:id/blast`, `schema.params: IdParams`.

This module does **not** import `modules/repo-intel/repository.ts`,
`service.ts`, or even `types.ts` — `types.ts` (this module's own) declares a
local `BlastRadiusSource` mirroring the slice of `RepoIntel` it needs, which
`container.repoIntel` satisfies structurally. Only the composition root
(`platform/container.ts`) ever imports both types and wires them together
(`get blast()`).

## Tests

- `service.test.ts` (unit) — the `BlastResult` → `PrBlastResponse` mapping
  and the three status branches, against a stub `BlastRadiusSource`.
- `test/blast.it.test.ts` (integration, real Postgres) — the HTTP route and
  tenancy contract, with `ContainerOverrides.repoIntel` stubbed. Lives under
  `server/test/` rather than colocated, like every other `*.it.test.ts` in
  this repo: `repository-owns-persistence` (`.dependency-cruiser.cjs`)
  forbids anything under `src/modules/` other than `repository.ts` from
  importing `db/schema`, which an integration test's fixture setup needs.
