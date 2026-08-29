# Enforcement — `pnpm arch:check`

The rings are validated statically by
[dependency-cruiser](https://github.com/sverweij/dependency-cruiser) 17, which is
already a `server/` dependency. Config: `server/.dependency-cruiser.cjs`.

```sh
cd server
pnpm arch:check        # the gate: exits 1 on any NEW violation
pnpm arch:violations   # every violation, known ones included, with explanations
pnpm arch:baseline     # regenerate the baseline — read the rules below first
```

`arch:check` cruises `src` **and** `../reviewer-core/src`, so the domain-purity
rule is checked across the package boundary.

---

## The rules

| Rule | Severity | Guards |
|---|---|---|
| `domain-is-pure` | error | `reviewer-core` → `server/src` (except `vendor/shared`) |
| `contracts-depend-on-nothing` | error | `vendor/shared` → modules/adapters/db/platform |
| `service-not-in-db` | error | `service.ts` → `db/schema`, `db/client` |
| `service-not-in-adapters` | warn | `service.ts` → a concrete adapter |
| `entry-not-in-repository` | error | `routes.ts` → `repository.ts` |
| `fastify-stays-at-the-edge` | error | `fastify` imported outside `routes.ts` |
| `repository-owns-persistence` | error | `db/schema` imported outside a repository |
| `infra-does-not-import-modules` | error | `adapters/**`, `platform/**` → `modules/**` (container.ts exempt) |
| `no-cross-module-imports` | warn | `modules/a` → `modules/b` |
| `no-circular` | error | any dependency cycle |
| `no-orphans` | warn | unreachable module |

`platform/container.ts` is exempt from `infra-does-not-import-modules` because it
is the composition root — entry ring, not infrastructure — and naming concrete
classes is exactly its job.

`warn` does not fail the build. It marks a boundary that is real but where the
repo has not yet decided how to pay it down — not a rule to ignore.

---

## The baseline is a ratchet

`.dependency-cruiser-known-violations.json` holds the **12 remaining pre-existing
violations** (down from 17). `--ignore-known` lets them pass, so the gate is green
today while still blocking anything new.

Known debt, as of the current baseline:

- **8 × `repository-owns-persistence`** — routes and helpers importing
  `db/schema.ts` directly (`workspace`, `settings`, `pulls`, `polling` routes;
  `reviews/run-executor.ts`, `reviews/diff-loader.ts`, `repos/helpers.ts`,
  `settings/feature-models.ts`). Four of those modules have no `service.ts` and
  no `repository.ts` at all — the application ring is simply missing there.
- **2 × `service-not-in-adapters`** — `repo-intel/service.ts` → `codeindex/extract`,
  `astgrep`. `astgrep` has no port at all.
- **1 × `no-cross-module-imports`** — `repos/service.ts` → `repo-intel/constants.ts`.
- **1 × `no-orphans`** — `platform/model-router.ts`. Scaffolding for a later
  lesson (its `TaskKind` names `intent`/`conformance`), not dead code — do not
  delete it to make the warning go away.

Already paid down, and worth reading as worked examples:

- **5 × `no-circular`** — gone. Four were `repo-intel/service.ts ↔
  platform/container.ts`: the service took the whole `Container`, and since the
  container also constructed it, the ring closed on itself. It now takes a
  `RepoIntelDeps` port bundle. The fifth, `agents/helpers.ts ↔
  agents/repository.ts`, was helpers importing row types from the repository —
  they belong in `db/rows.ts`, which exists for exactly that.

The count may go **down**, never up.

### Never regenerate the baseline to make a red build green

`pnpm arch:baseline` is legitimate in exactly one case: you **fixed** violations
and want the file to shrink. Then the diff must contain only removals.

If `arch:check` is red, the answer is to fix the import, not to bless it. A PR
whose baseline diff contains **added** entries should be rejected on sight — that
is the ratchet being unwound, and it is invisible unless someone reads the JSON.

---

## When `arch:check` fails

The reporter names the rule and the exact edge:

```
error service-not-in-db: src/modules/pulls/service.ts → src/db/schema.ts
```

Work through this order:

1. **Read the rule comment.** Each rule in `.dependency-cruiser.cjs` carries a
   `comment` explaining the intent and the intended fix. `pnpm arch:violations`
   (`err-long`) prints it.
2. **Move the code inward or outward** — this fixes most cases:
   - service touching Drizzle → move the query into `repository.ts`;
   - service naming a concrete adapter → introduce a port in
     `vendor/shared/adapters.ts`, wire it in the container;
   - route calling a repository → add a service method;
   - cycle through `container.ts` → make the service take ports in its
     constructor instead of the `Container`.
3. **Only then consider the rule wrong.** It happens — a rule is a hypothesis about
   the design. Change it deliberately, in its own commit, with the reason in the
   `comment` field. Do not weaken a rule in the same commit as the feature that
   tripped it; that is how a boundary quietly disappears.

---

## Wiring it into CI

Run it alongside `typecheck` — it is fast (~450 dependencies) and needs no Docker,
no DB and no keys:

```sh
cd server && pnpm typecheck && pnpm arch:check
```

Unlike the vitest lanes, `arch:check` **is** a committed npm script, so CI can call
it by name. If your clone has `server/package.json` under `skip-worktree`
(`git ls-files -v package.json` → `S`; the flag is local and never committed),
edits to it won't commit — call `pnpm exec depcruise …` directly instead.

---

## Visualising the graph

Useful when a boundary argument is hard to settle in words:

```sh
cd server
pnpm exec depcruise src --config .dependency-cruiser.cjs \
  --output-type dot | dot -T svg > /tmp/arch.svg
```

Requires Graphviz. `--output-type archi` gives a ring-level rollup rather than a
per-file graph, which is usually the more readable of the two.
