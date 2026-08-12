# client — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../CLAUDE.md for layer rules.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-08-02** — A component shared across unrelated route trees lives in `client/src/components/<kebab-case-name>/` with a single `<PascalCaseName>.tsx` + `index.ts` barrel (e.g. `components/mermaid-diagram/MermaidDiagram.tsx`, `components/repo-not-found/RepoNotFound.tsx`) — lighter than the full `Name.tsx/styles.ts/constants.ts/helpers.ts/index.ts` layout `client/CLAUDE.md` documents for route-colocated `_components/`.

## Tool & Library Notes

- **2026-08-02** — `@testing-library/user-event` is **not** a dependency of `client/` — importing it fails vitest at transform time ("Failed to resolve import"). Drive hover/focus/keyboard interactions with `fireEvent` from `@testing-library/react` (`fireEvent.mouseEnter` / `mouseLeave` / `focus` / `keyDown`) instead.

## Recurring Errors & Fixes

## Session Notes

## Open Questions
