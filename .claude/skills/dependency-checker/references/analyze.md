# Analyze — classification, sizing, prioritization

## Classification

Every declared dependency gets three tags.

### Type

| Type | Signal | Should live in |
|---|---|---|
| `runtime` | imported by code that runs in prod (`src/`, not `*.test.ts`) | `dependencies` |
| `build` | tsx, tsc, esbuild, bundler, drizzle-kit, codegen | `devDependencies` |
| `test` | vitest, testcontainers, RTL, playwright/agent-browser, fixtures | `devDependencies` |
| `types` | `@types/*`, pure `.d.ts` packages | `devDependencies` |
| `lint` | eslint + plugins, prettier, dependency-cruiser | `devDependencies` |
| `cli-tool` | invoked only from `scripts/` or `package.json` scripts | `devDependencies` |

Flag any `runtime` dependency sitting in `devDependencies` (breaks prod install)
and any pure `build`/`test`/`types` in `dependencies` (ships dead weight).

### Layer served

- **server / reviewer-core**: which Onion ring uses it — `contracts`, `domain`,
  `application`, `infrastructure`, `entry`. A DB/LLM/git/fs package used above
  `infrastructure` is an architecture smell — cross-reference the
  `onion-architecture` skill, do not re-derive its rules here.
- **client**: which feature folder, or `shared`.
- **tooling**: `tooling` — not tied to a ring.

### Reason for existence

One line, concrete: *"pgvector similarity search in the review-context repo"*,
not *"database stuff"*. If you cannot state the reason from the code, the
dependency is a **removal candidate** pending confirmation.

### Flags

| Flag | Meaning |
|---|---|
| `unused` | declared, no import anywhere |
| `phantom` | imported, not declared — works only by hoisting luck |
| `dupe-diverging` | same package, different major/minor in ≥2 local packages |
| `dupe-aligned` | same package+version in ≥2 packages — dedupe opportunity only if a workspace is ever adopted |
| `heavy-for-purpose` | install > 1 MB doing a job a <30-line helper or a smaller package could do |
| `misplaced` | wrong bucket (runtime in devDeps or vice versa) |
| `stale-major` | ≥1 major behind latest and the gap carries known cost |

## Sizing

Numbers to compute, all from `collect.md` output:

1. **Per-package `node_modules` total** (MB).
2. **Top 10 heaviest top-level installs** per package: `name | size MB | type | reason`.
3. **Shared vs unique**: for each `(name, version)` pair, count how many local
   `node_modules` trees contain it. Sum the sizes of shared pairs = "duplicated
   on disk across packages" (real cost of the no-workspace setup). Report it as
   one headline number.
4. **Removal saving** per candidate:
   - *certain*: the package's own `du` size.
   - *up to*: own size + size of `node_modules/.pnpm` entries not referenced by
     any other retained package. Label it "up to", never assert it.

## Prioritization

Score each actionable finding on two axes, High/Med/Low:

- **Impact** — bytes freed, or risk removed (a phantom dep is a latent break),
  or version-skew pain.
- **Ease** — `unused` removal and `misplaced` bucket-move are trivial;
  `heavy-for-purpose` replacement needs code + tests; a `stale-major` bump may
  cascade.

Rank order:

1. High impact · High ease — do now (unused runtime deps, phantom deps, misplaced runtime-in-dev).
2. High impact · Med/Low ease — plan it (heavy-for-purpose swaps, big stale majors).
3. Med impact · High ease — batch it (devDeps cleanup, `@types` for removed packages).
4. Low impact — note only, no action unless touched anyway.

`dupe-diverging` is always at least Med impact: divergent versions of the same
tool across packages cause "works in server, fails in client" bugs. Recommend a
single target version, name it.

Each finding in the report:

```
<name> — <package(s)> — <size> — <type>/<flag>
  Why: <one line>
  Action: drop | replace with <x> | dedupe to <version> | move to devDependencies | keep (rationale)
  Risk: <what could break, how to check>
```
