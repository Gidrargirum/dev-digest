# Findings severity breakdown

Per-severity finding counters on the Pull Requests list and on the Agent runs
timeline, each with a hover popover listing the findings behind the numbers.
Spans `@devdigest/shared`, `server/` and `client/`.

## Contract

- `FindingsBreakdown` (`contracts/findings.ts`) **must** carry all three
  severities as integers: `critical`, `warning`, `suggestion`. A severity with
  no findings is `0` — it **may not** be omitted from the object.
- `PrMeta.findings_breakdown` is **list-only** (`GET /repos/:id/pulls`). Other
  endpoints returning a PR (e.g. `GET /pulls/:id`) **may not** be expected to
  populate it.
- `findings_breakdown` **must** be `null` when the PR has nothing to count —
  never a zeroed object. "Nothing to count" covers all of: never reviewed,
  reviewed clean, every finding dismissed.
- Both vendored copies of the contract (`server/src/vendor/shared`,
  `client/src/vendor/shared`) **must** be edited together.

## Counting rules

These rules **must** hold identically on the server (PR list aggregation) and on
the client (`countBySeverity`, used by the Agent runs timeline), so the two
screens can never disagree:

1. Counts span **every** review of the PR, not just the latest one — unlike
   `PrMeta.score`, which is latest-review only.
2. Only reviews with `kind = 'review'` are counted. A consolidated `'summary'`
   review **may not** contribute, or its findings would be counted twice.
3. Findings with `dismissed_at IS NOT NULL` **must** be excluded. Accepted
   findings (`accepted_at`) **must** still be counted.
4. Severities outside `CRITICAL | WARNING | SUGGESTION` **must** be ignored
   rather than rejected — `findings.severity` is free text in the database.

## UI

- The PR list column order **must** be: `SCORE → FINDINGS → STATUS`.
- A severity with a count of `0` **must not** be rendered. When nothing at all
  is countable, the cell renders an em dash and **must not** be hoverable.
- Every counter **must** carry its severity icon; colour **may not** be the only
  carrier of meaning (WCAG AA).
- The popover **must** list at most 5 findings, sorted `CRITICAL → WARNING →
  SUGGESTION`, and **must** disclose the remainder as `+N more`. Each entry
  shows severity, title, category, `file:line`, confidence and a truncated
  rationale.
- On the PR list, finding details **must** be fetched only once a popover opens
  (via `GET /pulls/:id/reviews`); the list response **may not** carry them.
- The popover trigger **must not** navigate the PR row it sits in, and **must**
  be reachable by keyboard (focus opens it, `Escape` closes it).
- On the Agent runs timeline, a run whose review is not loaded (failed,
  cancelled, deleted review) **must** fall back to the denormalized
  `RunSummary.findings_count`.

## Acceptance

- A PR with two runs finding 2 CRITICAL, 2 WARNING, 2 SUGGESTION between them,
  one of them later dismissed, shows the dismissed one nowhere — neither in the
  list column nor in either popover.
- Dismissing a finding on the PR detail page lowers the list counter after the
  PR list query refetches.
- The sum of the timeline's per-run counters equals the PR list column for the
  same PR.
