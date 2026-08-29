# Structural Anti-Patterns

Review catalog. Each entry: the symptom, why it costs, and the fix. Scope is **placement
and boundaries** — logic-level anti-patterns (derived state, effect misuse, memo abuse)
belong to `react-best-practices`.

Severity: **CRITICAL** — real coupling/security bug · **HIGH** — will not scale ·
**MEDIUM** — maintainability and consistency.

---

## Boundaries

### Cross-feature imports — CRITICAL

`features/checkout/` imports from `features/catalog/`.

Every such edge welds two features together: neither can be deleted, moved, or owned
independently, and circular imports become a matter of time.

**Fix:** move the shared part to the shared layer, or compose both features one layer up
(in `app/`/the route). If neither is possible, the two "features" are one feature.
**Enforce:** `import/no-restricted-paths` zones or `eslint-plugin-boundaries`.

### Shared code importing feature code — CRITICAL

`components/data-table.tsx` imports `features/orders/types`.

The dependency arrow is now reversed: the shared layer cannot be reused without dragging a
feature along.

**Fix:** invert — the component takes generic props/generics; the feature supplies the
concrete shapes.

### Deleting a feature folder breaks unrelated pages — CRITICAL

The boundary is decorative. Something outside reaches into the feature's internals.

**Fix:** find the inbound imports; promote what is genuinely shared, keep the rest private.
Use this as the acceptance test for every new feature folder.

### Reaching into module internals — HIGH

`import { x } from '@/features/billing/components/internal/table-row'`

Any file becomes public API, so nothing inside can be renamed safely.

**Fix:** import through the module's declared entry point. If the project has no public-API
convention, this is fine — but then do not claim to have module boundaries.

---

## Folder structure

### Premature architecture — HIGH

Seven layers, DI container, and repositories for a five-screen CRUD app.

Indirection has a permanent cost and pays off only where the complexity it hides is real.

**Fix:** start feature-based and flat; adopt heavier structure when a concrete pain appears
(boundary violations, multi-team ownership, business rules with real invariants).

### The god folder — HIGH

`components/` (or `utils/`, `hooks/`) with 80+ unrelated files.

Nobody can find anything; duplicates get written because searching is harder than rewriting.

**Fix:** split by feature first, then by concern. Roughly 50 files in one flat folder is the
signal to split — not earlier.

### Deep nesting — MEDIUM

`src/features/orders/components/table/row/cell/index.tsx`

Imports become unreadable and every move is a mass rename.

**Fix:** cap at 3–4 levels. Deeper usually means the intermediate folders are named after
implementation detail rather than ownership.

### Empty scaffolded folders — MEDIUM

Every feature ships `api/ components/ hooks/ stores/ types/ utils/`, four of them empty.

Noise that trains readers to ignore the structure.

**Fix:** create a folder when the second file needs it.

### Speculative promotion — MEDIUM

A helper with one caller lives in the global `utils/` "because it may be reused".

Shared code is harder to change (unknown blast radius) and this one bought nothing for it.

**Fix:** colocate; promote on the second real consumer.

---

## Naming

### Mixed casing — MEDIUM

`UserProfile.tsx` beside `use-auth.ts` beside `apiClient.ts`.

Forces a per-file decision and breaks on case-insensitive filesystems.

**Fix:** one convention project-wide, enforced by `eslint-plugin-check-file`. Recommended:
kebab-case files, PascalCase exports.

### Folders named after mechanism, not purpose — MEDIUM

Inside a feature: `components/`, `hooks/`, `contexts/`, `reducers/` — a technical taxonomy
that scatters one workflow across five folders.

**Fix:** name segments by role (`ui`, `api`, `model`, `lib`) or keep the feature flat until
it needs subdivision.

### `helpers.ts` / `misc.ts` / `common.ts` — MEDIUM

A name that says "unclassified" guarantees the file grows unbounded and gets duplicated.

**Fix:** name by domain (`format-currency.ts`, `lib/datetime/`). If you cannot name it,
you do not yet know where it belongs — leave it colocated.

---

## Logic placement

### Business logic inside components — HIGH

Pricing rules, permission checks, or data reshaping written inline in JSX or a component body.

Untestable without a renderer, unreusable outside React, and re-executed on every render.

**Fix:** pure functions in the feature's util/service layer; the component calls them.

### Helper functions defined inside the component body — HIGH

Recreated every render and invisible to anything outside the file.

**Fix:** hoist above the component (or into a module) unless it genuinely closes over
render-scoped values.

### Fat orchestration entry points — HIGH

A route/page/action file that fetches, validates, transforms, and renders.

**Fix:** entry points stay thin — resolve input, call a service, compose UI.

### `useXxx` that calls no hooks — MEDIUM

Signals React state where there is none, and drags a plain function into React's rules.

**Fix:** rename to a plain function.

### Generic lifecycle hooks — MEDIUM

`useMount`, `useUpdateEffect`, `useEffectOnce` — wrappers over `useEffect` that hide intent
without adding meaning.

**Fix:** name the *use case* (`useChatRoom`, `useImpressionLog`) or keep the effect inline.

### Server data copied into a client store — HIGH

Fetched data mirrored into a global store and manually kept in sync.

Two sources of truth; the sync code becomes the bug surface.

**Fix:** let the async-state layer own server data; keep only genuine UI state locally.

---

## Constants, config, secrets

### Magic values scattered across files — MEDIUM

The same `"pending"` / `86_400_000` / `20` written in six places.

**Fix:** one named constant at the narrowest scope that covers all consumers.

### Global `constants.ts` with everything in it — MEDIUM

A 300-line grab bag imported by half the app; every change touches every consumer.

**Fix:** split by concern (`config/routes.ts`, `config/limits.ts`) and push feature-only
constants back into the feature.

### `process.env` read all over the app — CRITICAL

Undiscoverable configuration surface; on frameworks that inline public vars it becomes a
silent leak or a silent empty string.

**Fix:** exactly one module reads env, validates it against a schema at boot, and exports
typed values.

### Secrets reachable from client code — CRITICAL

A module that touches an API key imported (even transitively) by a client component.

**Fix:** `server-only` on the module; keep the data-access layer as the only consumer of
secrets.

---

## Imports and modules

### Barrel of barrels — HIGH

`src/index.ts` re-exporting `features/index.ts` re-exporting each feature.

Any import pulls a large graph: slow dev server, broken tree-shaking, circular dependencies.

**Fix:** at most one barrel per module boundary; never a root-level one. Import files
directly when the project does not enforce module boundaries.

### Deep relative paths — MEDIUM

`../../../../shared/utils/format`

Unreadable, and breaks on every move.

**Fix:** a path alias (`@/*` → `src/*`).

### Conventions with no lint rule — HIGH

The rules exist in a doc; the codebase drifts within weeks.

**Fix:** encode the direction rule and file-casing rule in ESLint the day they are agreed.

---

## Quick review pass

Given a diff, check in this order — cheapest signal first:

1. New file in a shared folder with **one** consumer → should be colocated.
2. Import crossing a feature boundary → coupling bug.
3. `page`/`route`/action file that grew logic → extract a service.
4. Component over ~5–7 props or with inline render helpers → split or compose.
5. Repeated literal or `process.env` outside its layer → constant/config.
6. New folder that is empty or 4+ levels deep → flatten.
7. New `index.ts` that only re-exports → is it a real module boundary?
