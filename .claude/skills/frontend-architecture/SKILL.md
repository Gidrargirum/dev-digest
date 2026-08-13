---
name: frontend-architecture
description: "Frontend code architecture and organization — deciding WHERE code belongs, not how to write it. Use when creating a new file or folder, adding a feature, splitting a component that grew too big, extracting a util/hook/constant, deciding between feature-scoped and shared, naming files, drawing module boundaries, or reviewing a PR for structural drift. Covers folder structure (feature-based, FSD, layered), colocation vs promotion, utils/helpers/lib/services, where business logic lives, constants and config placement, barrel files, and Next.js App Router layout. Trigger terms: project structure, folder structure, where to put, file organization, module boundaries, feature folder, shared vs feature, architecture, code organization, barrel file, utils folder."
metadata:
  version: 1.0.0
  tags: architecture, code-organization, project-structure, react, nextjs, frontend
---

# Frontend Architecture & Code Organization

Answers one question: **where does this code belong?**

Not *how to write* a component (see `react-best-practices`), not *how Next.js works*
(see `next-best-practices`) — only placement, boundaries, and structure.

| File | Read when |
|---|---|
| [decision-tree.md](decision-tree.md) | placing a specific artifact — component, hook, util, constant, type, API call |
| [nextjs.md](nextjs.md) | the project uses Next.js App Router |
| [anti-patterns.md](anti-patterns.md) | reviewing a PR or auditing an existing structure |
| [references/](references/) | you need the source behind a rule, or the trade-off's other side |

---

## The four rules that decide everything

Everything below follows from these. When a case is not covered, reason from them.

### 1. Colocation — code lives next to its only consumer

Place code as close to where it's relevant as possible. Things that change together
sit together. A helper used only by `PaymentForm` belongs beside `PaymentForm`, not in
a global `utils/`.

Do **not** promote code to a shared location because it "might be reused". That is how
`utils/` becomes a dump of orphaned, untested functions.

### 2. Promotion — shared status is earned by a second consumer

- **1 consumer** → colocated with it.
- **2+ consumers in the same feature** → feature-level folder.
- **2+ features** → shared/global layer.

Promotion is a refactor triggered by a real second use, never a prediction. Demotion is
also legal: if a shared util loses all but one consumer, move it back down.

### 3. Direction — dependencies point one way

`shared → features → app`

- A feature **never** imports from another feature. Composition happens one layer up.
- Shared code **never** imports feature code.
- Deleting a feature folder must not break anything outside it. If it does, the boundary
  is drawn wrong.

Cross-feature reuse means the shared part belongs in the shared layer — not that features
may reach into each other.

### 4. Depth — max 3–4 nested folders

Flat until it hurts. Split a folder when it exceeds ~50 files or mixes unrelated concerns,
not before. Do not build a folder hierarchy for an app that does not exist yet.

---

## Choosing a structure

Pick by team size and domain complexity. Do not spend more than ~5 minutes on this at
project start — the promotion rule will reshape it correctly as the app grows.

| Structure | Use when | Cost |
|---|---|---|
| **Flat** (`components/`, `hooks/`, `utils/`) | < ~15 files, prototype, single-purpose tool | breaks down fast; every folder becomes a dump |
| **Feature-based** (bulletproof-react) | **default for most apps** | needs discipline about the direction rule |
| **Feature-Sliced Design (FSD)** | large team, many domains, need enforced boundaries | 7 layers + public-API ceremony; overkill for small apps |
| **Clean Architecture layers** | complex business rules that outlive the UI framework | heavy indirection; wrong for CRUD UIs |

### Feature-based baseline

```
src/
├── app/            # routing, providers, root composition — imports features
├── components/     # shared UI ONLY (no feature logic inside)
├── config/         # env exports, global constants, validated config
├── features/
│   └── <feature>/  # api/ components/ hooks/ stores/ types/ utils/ — only what's needed
├── hooks/          # shared hooks
├── lib/            # preconfigured third-party wrappers (http client, i18n, analytics)
├── stores/         # global state
├── testing/        # test utils, mocks, factories
├── types/          # shared types
└── utils/          # shared pure helpers
```

A feature folder contains **only the subfolders it actually needs**. Do not scaffold
empty `types/`, `utils/`, `stores/` in every feature.

### FSD, in one paragraph

Layers (`app → pages → widgets → features → entities → shared`) may import only from
layers **strictly below**; slices within one layer may not import each other; each slice
exposes a public API. Segments are named by technical purpose — `ui`, `api`, `model`,
`lib`, `config` — never `components`/`hooks`. Adopt it when boundary violations are a
recurring, real problem; otherwise the ceremony costs more than it saves.

---

## Where logic lives

Three tiers, in order of preference:

1. **Pure functions** (`utils/`, `services/`, `model/`) — conditionals, calculations,
   formatting, validation, mapping. No React. Testable without a renderer. **Default here.**
2. **Custom hooks** — application logic: state, effects, event orchestration, wiring
   pure functions to the UI.
3. **Components** — rendering and event wiring only.

Rules:

- Extract a hook when Effect logic is duplicated or has a nameable reusable purpose —
  not for every small duplication. Some duplication is fine.
- A function that calls no hooks is a **plain function**, not a hook: `getSorted()`, not `useSorted()`.
- If you cannot name the hook clearly, it is too coupled to the component to extract yet.
- Container/Presentational as a *component pair* is obsolete — custom hooks replace it.
  The underlying split (how it looks / how it works) still holds.
- Server state (React Query & co.) is not client state. Do not copy fetched data into
  another store.

## utils vs helpers vs lib vs services

Ambiguous industry-wide, so pick one convention and write it in the project's `AGENTS.md`.
The workable split:

| Folder | Contents | Test |
|---|---|---|
| `utils/` | small, generic, stateless: formatting, id generation, parsing | "helps organize logic" |
| `lib/` | mini-packages and integrations with the outside world; configured third-party wrappers | "talks to the outside world" |
| `services/` | domain operations: fetching, mutating, business workflows | "does the app's actual work" |
| `helpers/` | project-specific one-offs | avoid — usually means `utils/` or a feature util |

Prefer **named domain modules** over a generic bucket: `lib/datetime/`, `lib/currency/` —
each with its own tests — instead of a 40-function `utils/index.ts`.

## Constants and config

| Scope | Placement |
|---|---|
| used in one file | top of that file, above the component |
| used across one feature | `<feature>/constants.ts` |
| used app-wide | `config/` |
| secrets | env vars, read in exactly one layer (server/data-access) — never scattered |

- `UPPER_SNAKE_CASE` for constant values; `PascalCase` for enum/union type names.
- Replace magic numbers and repeated string literals with named constants — that is the
  point, not the folder they sit in.
- Validate app config at **build/boot time** (e.g. a Zod schema over `process.env`) so a
  bad environment fails immediately, not on the page that happens to read it.

## Types

- Types used by one module live in that module — colocated, next to the code they describe.
- Types crossing a module boundary live in that boundary's `types.ts`.
- App-wide domain types live in `types/`.
- When a schema library is in use, the schema is the source of truth and the type is
  inferred from it — do not maintain a hand-written twin.

## Naming

Consistency beats the specific choice. Decide once, enforce with a linter.

- **Files & folders**: `kebab-case` everywhere (`user-profile.tsx`, `use-online-status.ts`).
  Avoids case-sensitivity conflicts across OSes and removes per-file-type decisions.
- **Exported components**: `PascalCase` regardless of file name.
- **Hooks**: `use` + capital letter — enforced by React's linter.
- **Folders**: singular (`customer/`); plural only for files that bundle many definitions
  (`types.ts`, `hooks.ts`).
- **Prefer named exports** — they keep import names consistent and greppable.

## Barrel files (`index.ts`) — a real trade-off, not a rule

**Cost:** importing one symbol pulls the whole barrel; tree-shaking does not apply in dev;
slower builds, IDE autocomplete, and `tsc`; circular-dependency risk. Measured impact is
large (hundreds of ms per barrel-heavy package; bundle chunks several times bigger).

**Benefit:** a module's public API — the mechanism that makes "import only through the
front door" enforceable.

Decide by project:

- **Small/medium app, no enforced boundaries** → skip barrels, import files directly.
- **Enforced module boundaries (FSD, monorepo packages)** → keep **one** barrel per
  module boundary, never per folder, and never re-export a whole tree through the root.

Never: nested barrels that re-export barrels; a root `src/index.ts` re-exporting everything.

## Enforcement

Rules that are not linted are suggestions. Encode the direction rule:

- `import/no-restricted-paths` — zone-based; forbids `features/a → features/b` and
  `shared → features`.
- `eslint-plugin-boundaries` — declares element types and allowed dependencies, plus
  entry-point restrictions.
- `no-restricted-imports` — the cheap version for a few specific paths.
- Nx `@nx/enforce-module-boundaries` — tag-based, for monorepos.
- File-name casing: `eslint-plugin-check-file`.

Add the rule the same day the convention is agreed, not after the third violation.

---

## Applying this to an existing codebase

Do not restructure wholesale. Structural refactors are expensive and rarely finish.

1. Fix the **direction rule** first — cross-feature imports and shared→feature imports are
   real coupling bugs. Lint them and fix the violations.
2. Apply the new convention to **new code only**; migrate old code when you touch it.
3. Move files when a real second consumer appears (promotion), not in a big-bang pass.
4. Record the chosen convention in the project's `AGENTS.md` / `CLAUDE.md` so it survives.

When the user asks for a full restructure anyway, deliver it — but say which parts are
mechanical (safe) and which change module boundaries (need review).
