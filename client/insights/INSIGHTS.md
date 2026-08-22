# client — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../AGENTS.md for layer rules.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-08-02** — A component shared across unrelated route trees lives in `client/src/components/<kebab-case-name>/` with a single `<PascalCaseName>.tsx` + `index.ts` barrel (e.g. `components/mermaid-diagram/MermaidDiagram.tsx`, `components/repo-not-found/RepoNotFound.tsx`) — lighter than the full `Name.tsx/styles.ts/constants.ts/helpers.ts/index.ts` layout `client/AGENTS.md` documents for route-colocated `_components/`.
- **2026-08-19** — `styles.ts` files hold plain `CSSProperties` objects, so pseudo-elements are unavailable: a `::marker` / `::before` bullet has to be rendered as a real element in JSX. The trap that pairs with it — `display: flex` on a `<ul>` replaces its children's `display: list-item`, so `list-style` markers silently disappear. There is no CSS error; the list just renders as unbulleted paragraphs (hit in `IntentCard`, where the design called for `·` markers).

## Tool & Library Notes

- **2026-08-02** — `@testing-library/user-event` is **not** a dependency of `client/` — importing it fails vitest at transform time ("Failed to resolve import"). Drive hover/focus/keyboard interactions with `fireEvent` from `@testing-library/react` (`fireEvent.mouseEnter` / `mouseLeave` / `focus` / `keyDown`) instead.
- **2026-08-13** — ESLint 9 flat config: rules wrapped in `tseslint.config(...)` work fine, but `next build` cannot see through the wrapper and prints "The Next.js plugin was not detected in your ESLint configuration" on every build even though `@next/eslint-plugin-next` **is** registered. The plugin isn't broken and the rules do run — only Next's detection heuristic fails. Since linting is already its own step (`pnpm lint`, plus a job in `client.yml`), the fix is `eslint: { ignoreDuringBuilds: true }` in `next.config.mjs`; do not restructure the flat config to satisfy the heuristic.
- **2026-08-19** — `client/` may import only **types** from `@devdigest/shared`; a runtime import pulls `vendor/shared/index.ts` into the webpack bundle, whose `./contracts/*.js` re-exports Next cannot resolve. So a Zod contract can never be `parse()`d on the client, and a schema's `.default()`s therefore never run here — a response field that is defaulted in the contract still arrives `undefined` if the server omitted it. Validate at the server's read boundary instead (`server/src/modules/intent/repository.ts` parses `PrIntentRecord` for exactly this reason) and keep client lookups over wire enums total (`TABLE[value] ?? TABLE.fallback`).
- **2026-08-19** — `Badge` (`vendor/ui/primitives/Badge.tsx`) ships `white-space: nowrap`, which suits a short label and overflows its container for anything model-written (risk areas, finding titles). `vendor/ui` is do-not-touch, but `Badge` spreads its `style` prop **last**, so `style={{ whiteSpace: "normal" }}` is the sanctioned override — no fork, no wrapper.
- **2026-08-19** — The `SearchableSelect` trigger (`vendor/ui/kit/SearchableSelect.tsx`) is a bare clickable `<div>`: no role, no accessible name, so RTL cannot reach it via `getByRole`. Do not index into `getAllByText` (the same string often also appears in the field's label tag) and do not edit `vendor/ui` — put `role="group"` + `aria-label` on the surrounding row in your own component and scope the query with `within()`.
## Recurring Errors & Fixes

## Session Notes

## Open Questions
