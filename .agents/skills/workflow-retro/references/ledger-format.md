# Ledger format — docs/retros/ledger.md

One row per retro run, newest at the bottom (chronological, matching this
repo's other append-only logs). Never reorder, never delete a row — a
correction is a new row that says what it corrects.

## Columns

| Date | Pipeline | Mode | Total tokens (in/out) | Cache read | Wall-clock | Top action |
|---|---|---|---|---|---|---|

- **Date** — `YYYY-MM-DD`.
- **Pipeline** — what ran, e.g. `/run-plan` or a named ad-hoc pipeline.
- **Mode** — `quick` or `deep`. A trend line mixing both is still useful,
  but say which is which — don't let a quick-mode row imply completeness a
  deep-mode row actually has.
- **Total tokens (in/out)** — sum across every captured agent call in the
  run (`unknown` counted as 0, but see *Not captured* below).
- **Cache read** — sum of `cache_read_input_tokens` across the run; this is
  usually the single biggest lever the retro's actions target.
- **Wall-clock** — start of phase 1 to end of the last phase.
- **Top action** — the single highest-impact recommendation from that run's
  report, one line. Link to the full report if it was saved anywhere;
  otherwise a one-line summary is enough — the ledger is for the trend, not
  the detail.

If any figure in a row rests on a run with missing transcript references
(quick mode, or a deep mode with gaps), add a trailing `*` and a one-line
footnote under that row naming what wasn't captured — a silently-optimistic
number defeats the point of tracking a trend.
