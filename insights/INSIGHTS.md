# DevDigest — engineering insights (cross-package)

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../CLAUDE.md for the session protocol.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-08-02** — A field added to `PrMeta` (`server/src/vendor/shared/contracts/platform.ts` + client copy) that's populated by only one endpoint must be `.nullish()`, not `.nullable()`. `PrMeta` is also built by the GitHub import adapter (`server/src/adapters/github/octokit.ts`), test mocks (`server/src/adapters/mocks.ts`), and the PR-detail route — none of these set list-only fields like `score` or `cost_usd`, so `.nullable()` fails `pnpm typecheck` in all three.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
