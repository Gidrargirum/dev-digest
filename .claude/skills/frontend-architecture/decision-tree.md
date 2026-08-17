# Placement Decision Tree

Concrete procedures for "where does this go?". Assumes the four rules in
[SKILL.md](SKILL.md): colocation, promotion, direction, depth.

Notation used below: `<feature>` = `src/features/<name>/`, `shared` = the top-level
`components/ | hooks/ | utils/ | lib/ | types/` layer.

---

## 0. The universal question

Before anything else, answer: **who consumes this?**

```
one file            → same file (bottom of it, or top for constants)
one feature         → <feature>/<segment>/
two or more features → shared layer
two or more apps    → a package (monorepo) or an internal library
```

If the answer is "nobody yet, but soon" — colocate. Promotion is cheap; un-promoting an
abstraction that got shaped by a hypothetical second consumer is not.

---

## 1. A component

```
Is it used by exactly one component?
├─ yes → same file, below the parent (if small)
│         or <parent-dir>/<child-name>.tsx (if it has its own state/props surface)
└─ no
   ├─ used within one feature       → <feature>/components/
   ├─ used by 2+ features
   │  ├─ contains feature logic?    → STOP: split it. UI part → shared; logic → stays in the feature
   │  └─ pure UI (no domain knowledge) → components/
   └─ used by 2+ apps               → packages/ui/
```

**Splitting an oversized component.** Split by *responsibility*, not by line count.
Three ways to find the seam:

- **Programming** — same instinct as extracting a function: one cohesive job.
- **CSS** — what would you write a class selector for?
- **Design** — how are the layers grouped in the mockup?
- **Data** — a component often maps to one node of the data model.

Signals it needs splitting:

| Signal | Action |
|---|---|
| render-helper functions defined inside the component | extract each into its own component |
| too many props (roughly 6+) | split, or invert to composition via `children`/slots |
| the props of one subtree never overlap with another's | two components, not one |
| a `switch`/ternary chain choosing large JSX blocks | one component per branch |
| you need a comment to explain a JSX section | that section is a component |

**Signals it should NOT be split:** the parts always change together; the child would need
5 props to say what one inline block says; the only motivation is file length.

**Wrapping third-party components.** Import a third-party UI component through your own
thin wrapper in `components/` or `lib/`. That gives one place to adapt its API and one
place to replace it.

---

## 2. A hook

```
Does it call other hooks?
├─ no → it is a plain function. Go to §3.
└─ yes
   ├─ used by one component        → same file as the component, or <component-dir>/use-x.ts
   ├─ used within one feature      → <feature>/hooks/
   └─ used by 2+ features          → hooks/
```

Extract a hook when: Effect logic is duplicated, or the effect has a nameable reusable
purpose, or stateful logic must be shared.

Do **not** extract when: it is small duplication (fine), or it would be a generic wrapper
over `useEffect` (`useMount`, `useUpdateEffect`) — those hide intent instead of naming it.

Name it after the *use case*, not the mechanism: `useChatRoom`, `useMediaQuery`,
`useImpressionLog`. If the name is hard to find, the logic is still too coupled to the
component — leave it inline.

Remember hooks share **logic**, not **state**. Two components calling `useCart()` get two
independent states. Shared state needs lifting or a store.

---

## 3. A plain function (util / helper / service)

```
Does it touch the outside world (network, storage, SDK, browser API)?
├─ yes
│  ├─ domain operation (fetch/mutate this app's data) → <feature>/api/ or services/
│  └─ generic integration/wrapper (http client, analytics) → lib/<name>/
└─ no (pure)
   ├─ used by one component/module → same file, ABOVE the component (never inside its body)
   ├─ used within one feature      → <feature>/utils/
   └─ used by 2+ features          → utils/  — or better, lib/<domain>/ if a cluster forms
```

**When three or more related helpers accumulate**, stop adding to `utils/` and make a named
module: `lib/currency/{format.ts, parse.ts, index.ts, currency.test.ts}`. A named module
gets tests and an owner; a generic bucket gets neither.

Helper functions always live **outside** the component body — a function redefined on every
render is both a placement mistake and a perf one.

---

## 4. A constant

```
How many places read it?
├─ one file          → top of that file, above the component
├─ one feature       → <feature>/constants.ts
├─ app-wide          → config/ (grouped by concern: routes.ts, limits.ts, query-keys.ts)
└─ environment-specific → env var, read and validated in ONE place, re-exported from config/
```

Extract a literal into a constant when it appears twice, or when its meaning is not obvious
from the call site (`86_400_000` → `ONE_DAY_MS`). A single self-explanatory literal used
once (`padding: 8`) does not need a constant.

Naming: `UPPER_SNAKE_CASE` for values; `PascalCase` for the enum/union type name.
Prefer a union of string literals or a `const` object over a TS `enum` unless you need its
runtime behavior — enums generate runtime code and behave oddly under `isolatedModules`.

**Never** read raw env vars from components. One module reads `process.env`, validates it,
and exports typed values.

---

## 5. A type

```
Who names this type?
├─ props of one component            → same file as the component
├─ shape used across one feature     → <feature>/types.ts
├─ contract between modules/layers   → the boundary's types.ts (owned by the provider side)
├─ domain entity used app-wide       → types/
└─ derived from a validation schema  → infer it; do not hand-write a twin
```

API response types belong with the API layer that produces them (`<feature>/api/types.ts`),
not with the component that happens to render them first.

---

## 6. State

```
Is it derivable from existing props/state?
├─ yes → do NOT store it. Compute during render.
└─ no
   ├─ one component               → useState there
   ├─ a few nearby components     → lift to the closest common parent
   ├─ a whole feature subtree     → feature store or context provider at the feature root
   ├─ genuinely app-wide (auth, theme, locale) → global store / provider in app/
   └─ owned by the server         → server-state library. Do NOT copy it into another store.
```

Structural principles for the state you do keep: group related state; make illegal states
unrepresentable (one `status` instead of several booleans); store ids rather than duplicated
objects; flatten deep nesting.

Context is dependency injection, not a state manager: split providers by concern and render
them as deep in the tree as possible.

---

## 7. A test

Colocate: `x.ts` → `x.test.ts` next to it. Feature tests live inside the feature.
Only cross-cutting infrastructure (setup files, mock servers, factories) goes to `testing/`.

Test the pure functions and the hooks; treat thin orchestration layers as integration
surface, not unit-test targets.

---

## 8. An asset

Feature-specific images/icons → `<feature>/assets/`. Global brand assets → `assets/`
(or the framework's static dir). Icons used everywhere → a single icon module, imported
per-icon, never through a barrel of thousands of re-exports.

---

## 9. New feature — folder scaffold

Create only what the feature needs today:

```
features/<name>/
├── api/          # requests + response types for this feature
├── components/   # UI owned by this feature
├── hooks/        # feature-scoped hooks
├── utils/        # feature-scoped pure helpers
├── types.ts      # shapes crossing this feature's boundary
├── constants.ts
└── stores/       # only if the feature has non-trivial local state
```

Then check the direction rule: does this feature import from another feature? If yes, the
shared part belongs in the shared layer, or the two features are actually one.
