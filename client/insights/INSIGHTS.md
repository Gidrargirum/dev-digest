# client — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../AGENTS.md for layer rules.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-08-02** — A component shared across unrelated route trees lives in `client/src/components/<kebab-case-name>/` with a single `<PascalCaseName>.tsx` + `index.ts` barrel (e.g. `components/mermaid-diagram/MermaidDiagram.tsx`, `components/repo-not-found/RepoNotFound.tsx`) — lighter than the full `Name.tsx/styles.ts/constants.ts/helpers.ts/index.ts` layout `client/AGENTS.md` documents for route-colocated `_components/`.

## Tool & Library Notes

- **2026-08-02** — `@testing-library/user-event` is **not** a dependency of `client/` — importing it fails vitest at transform time ("Failed to resolve import"). Drive hover/focus/keyboard interactions with `fireEvent` from `@testing-library/react` (`fireEvent.mouseEnter` / `mouseLeave` / `focus` / `keyDown`) instead.
- **2026-08-13** — ESLint 9 flat config: rules wrapped in `tseslint.config(...)` work fine, but `next build` cannot see through the wrapper and prints "The Next.js plugin was not detected in your ESLint configuration" on every build even though `@next/eslint-plugin-next` **is** registered. The plugin isn't broken and the rules do run — only Next's detection heuristic fails. Since linting is already its own step (`pnpm lint`, plus a job in `client.yml`), the fix is `eslint: { ignoreDuringBuilds: true }` in `next.config.mjs`; do not restructure the flat config to satisfy the heuristic.
## Recurring Errors & Fixes

## Session Notes

## Open Questions
