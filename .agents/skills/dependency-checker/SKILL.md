---
name: dependency-checker
description: "Audits the dependencies of this repo and every package in it — builds a dependency graph, sizes each package on disk (du + package.json), classifies it by type and reason for being there, then produces a prioritized list of what to cut, replace, dedupe or leave alone with concrete advice. Use on `/dependency-checker`, or when the user asks for a dependency audit, a bundle/size review, `why is node_modules so big`, `which deps can we drop`, `dependency graph`, `аналіз залежностей`, `розмір пакетів`, `що можна викинути`. Reports in the same format as the other skills in `.Codex/skills/`."
allowed-tools: Read, Grep, Glob, Bash, Write
metadata:
  version: 1.1.0
  tags: dependencies, audit, size, graph, prioritization, tooling
---

# Dependency Checker — the dependency audit

Answers one question: **which dependencies is this repo carrying, what does each
one cost, and what should change?**

Not a security audit (`npm audit` / the `security` skill own CVEs), not a
license scan, not a lockfile-integrity check. This skill maps what is installed,
weighs it, and hands developers a ranked action list.

## Repo shape this skill must respect

- **No workspace.** Each package (`server/`, `client/`, `reviewer-core/`,
  `e2e/`, `mcp/`, `evals/`) has its own `package.json`, its own `node_modules`,
  and — for most — its own `pnpm-lock.yaml`. Discover packages, never hardcode
  the list: `find . -maxdepth 2 -name package.json -not -path '*/node_modules/*'`.
- **No root `package.json`.** "Root tooling" = the dev-tooling dependencies
  shared in spirit across packages (typescript, vitest, eslint, tsx, drizzle-kit,
  dependency-cruiser) plus anything under `scripts/` and `.Codex/hooks/`. Report
  it as its own synthetic group, flagging where the same tool sits at different
  versions in different packages.
- `@devdigest/shared` is **vendored**, not installed — two copies under
  `server/src/vendor/shared` and `client/src/vendor/shared`. It is a dependency
  in the architectural sense; note it in the graph, exclude it from size math.
  **Confirm the copies exist** by `Glob`-ing `**/vendor/shared/**` before you
  report them present or missing — a `tsconfig.json` path alias is not proof the
  target is there, and "phantom vendored package" is a serious claim to get
  wrong.

| File | Read when |
|---|---|
| [references/collect.md](references/collect.md) | gathering the raw data — the exact commands per package |
| [references/analyze.md](references/analyze.md) | classifying a dependency, sizing it, deciding its priority — the rubric |
| [references/report-template.md](references/report-template.md) | writing the report, the graph, the tables, the action list |

## Modes

| Invocation | Does |
|---|---|
| `/dependency-checker` | full audit across every discovered package, report to chat |
| `/dependency-checker <package>` | one package only (e.g. `client`), same report scoped to it |
| `/dependency-checker --json` | same run, machine-readable file to scratchpad instead of a chat report |

---

## The run

Copy this checklist into your response and check items off as you go:

```
Dependency audit:
- [ ] 0. Discover — every package.json, its node_modules, its lockfile
- [ ] 1. Collect — declared deps, installed sizes, transitive fan-out, versions
- [ ] 2. Graph — package → package edges and notable external hubs
- [ ] 3. Classify — type / layer / reason-for-existence per dependency
- [ ] 4. Size — per package, per top-N dependency, shared vs unique
- [ ] 5. Prioritize — rank findings by (cost × removability), attach advice
- [ ] 6. Report — graph + tables + ranked action list
```

### 0. Discover

List every `package.json` (excluding `node_modules`). For each, record: package
name, path, whether `node_modules/` exists, whether a `pnpm-lock.yaml` sits
beside it. A package with no `node_modules` → its sizes are `not installed`,
never `0`; say so and fall back to lockfile counts for fan-out only.

A package with **no `pnpm-lock.yaml` of its own** is a reproducibility risk in a
no-workspace repo — raise it as its own finding (tier P2/P3), naming the
packages, distinct from the ones that have a lockfile.

### 1. Collect

Per package, run the commands in [references/collect.md](references/collect.md):
declared `dependencies` / `devDependencies` / `peerDependencies` from
`package.json`; on-disk size of each top-level `node_modules/*` entry via `du`;
total `node_modules` size; transitive package count from the lockfile; installed
version vs the range declared.

**When `Bash` is unavailable** (a restricted session — no `du`, `find`, `node -e`):
still deliver the audit. Discover packages by `Glob`-ing `**/package.json` (minus
`node_modules`), `Read` each one, derive the internal graph from every
`tsconfig.json` `paths`, and find unused / phantom deps with `Grep` over `src/`.
Mark every size cell **`not measured`**, set the report's `Partial:` line to say
sizing needs a `du` pass, and skip only the size-ranking parts of steps 4–5. A
graph-and-classification audit with no byte counts still beats no audit.
Disk sizes supplied to you in the prompt (e.g. pre-collected `du -sk` output)
count as measured — use them.

### 2. Graph

Two layers, both in [references/report-template.md](references/report-template.md):
- **Internal** — which local package depends on which (path aliases in
  `tsconfig.json` count as edges even though they are not in `package.json`),
  plus the vendored `@devdigest/shared` copies.
- **External hubs** — the handful of heavy or widely-shared third-party packages
  (e.g. a bundler, `typescript`, `@types/*`, an LLM SDK) that many packages pull.
  Not the full tree — the nodes a developer would actually act on.

### 3. Classify

Per [references/analyze.md](references/analyze.md): every declared dependency gets
a **type** (runtime / build / test / types / lint / cli-tool), a **layer** it
serves (which Onion ring or client feature, or "tooling"), and a
**reason-for-existence** in one line. Flag: unused (declared, not imported),
phantom (imported, not declared), duplicated across packages at diverging
versions, heavy-for-purpose (big package doing a small job).

### 4. Size

Build the numbers [references/analyze.md](references/analyze.md#sizing) defines:
per-package `node_modules` total; the top 10 heaviest top-level installs per
package; how much is shared (same name+version in ≥2 packages) vs unique; the
"if removed" saving estimate for each removal candidate (its own size only —
transitive savings are noted as "up to", never asserted).

### 5. Prioritize

Rank every actionable finding by **impact × ease**, per the matrix in
[references/analyze.md](references/analyze.md#prioritization). Each finding
carries: what, where, size, why it is flagged, the recommended action
(drop / replace-with / dedupe-to-version / move-to-devDeps / keep), and the
risk of doing it. No finding without a concrete next step.

### 6. Report

Per [references/report-template.md](references/report-template.md): the graph
first, then the per-package size tables, then the single ranked action list.
`--json` writes the same content as structured data to the scratchpad.

---

## Non-negotiables

- **Discovery, never a hardcoded package list.** `evals/` exists and AGENTS.md
  still says "five packages" — trust `find`, not the docs.
- **`du` on `node_modules`, not guesses.** If a package is not installed, the
  size is `not installed`; if `du` could not be run at all, every size is
  `not measured` — either way the report's `Partial:` line says so. A
  confident-looking table over an uninstalled or unmeasured tree is the worst
  failure here.
- **Transitive savings are "up to", never asserted.** Removing a package frees
  its own bytes for certain; its unique sub-tree only *maybe*.
- **Every finding ends in an action.** "lodash is big" is not a finding;
  "lodash (4.9 MB, server, used for `groupBy` only) → replace with a 6-line
  helper, low risk" is.
- **No edits.** This skill measures and advises; it changes no `package.json`,
  runs no `pnpm remove`. The developer acts on the list.
- **Scope to one package when asked.** `/dependency-checker client` audits
  `client/` and its graph edges only — no server tables.
