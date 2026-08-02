# e2e — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../CLAUDE.md for layer rules.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-08-02** — The seeded review in `server/src/db/seed.ts` has no `run_id` and no matching `agent_runs` row, so on a freshly seeded stack the Agent runs **timeline** is empty even though the review + its 2 findings render in the accordion below. A flow asserting anything per-run (score, findings breakdown, trace button) has nothing to hook onto — assert on the accordion instead, or on the PR list, which reads findings straight off the reviews.

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
