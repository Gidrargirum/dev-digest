# reviewer-core — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../CLAUDE.md for layer rules.

## What Works

## What Doesn't Work

- **2026-08-02** — Lowering `DEFAULT_MAP_THRESHOLD_LINES` alone does not force
  map-reduce mode: `selectMode`'s `'auto'` branch requires
  `totalLines > threshold` **and** `diff.files.length > 1`. A PR touching a
  single file never map-reduces, no matter how large the diff or how low the
  threshold is set. `reviewer-core/src/review/run.ts:120`

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
