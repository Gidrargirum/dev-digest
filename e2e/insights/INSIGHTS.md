# e2e — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../AGENTS.md for layer rules.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-08-13** — A flow that clicks a row must `wait --text` for that row **first**. `wait --url
  /pulls` only means the route changed; the list is still fetching. Flows `04`/`05` clicked the
  seeded PR title straight after the URL wait and failed intermittently-looking-like-always, while
  `02` did the identical click and passed — the only difference was the preceding wait. Copy the
  `wait --text` → `find text ... click` pair from `02` whenever a flow enters the PR detail.

- **2026-08-02** — The seeded review in `server/src/db/seed.ts` has no `run_id` and no matching `agent_runs` row, so on a freshly seeded stack the Agent runs **timeline** is empty even though the review + its 2 findings render in the accordion below. A flow asserting anything per-run (score, findings breakdown, trace button) has nothing to hook onto — assert on the accordion instead, or on the PR list, which reads findings straight off the reviews.

- **2026-08-27** — Flow `10-smart-diff` failed in CI (always) but passed locally: it clicked the
  `find text "Hardcoded Stripe secret key…"` chip right after `wait --text "BOILERPLATE"`. The
  group HEADER renders synchronously, but the chip inside it depends on the **reviews fetch** — on a
  slow runner the click landed before the chip mounted (or before its React `onClick` attached), so
  `find … click` exited 0 on a no-op node and the next `wait --url tab=findings` timed out 30s
  later. Same class as the 2026-08-13 "wait --text for the row first" entry, one level deeper. Fix:
  `wait --load networkidle` + an explicit `wait --text` for the chip's own text, and click it via
  `find role button --name "Open finding: …"` (the `aria-label`) so agent-browser's actionability
  wait targets the real <button>, not a text node inside it.

## Tool & Library Notes

- **2026-08-13** — `agent-browser wait --text` matches **rendered** text, not DOM `textContent`.
  The PR-list column headers are `text-transform: uppercase` (`pulls/styles.ts` `headRow`), so the
  i18n string is `"Findings"` but the assertion must be `--text FINDINGS`. Any header, badge or
  button styled uppercase needs the same treatment; grep `textTransform` before writing the
  assertion. This cost a whole flow (`08`) that looked like a broken feature and was a casing bug.
- **2026-08-13** — Driving a `HoverCard` trigger with `find role button click` **closes** it.
  The trigger opens on `onMouseEnter`/`onFocus` and its `onClick` *toggles*: the driver focuses the
  element before clicking, so `open` is already `true` and the click hides it again. Use
  `find role button hover --name ...` instead — which is also how a user actually sees the popover.
  A flow comment claiming click is "more deterministic than hover" was wrong on exactly this point.

## Recurring Errors & Fixes

- **2026-08-13** — `../scripts/e2e.sh` dies at the last step with `sh: tsx: command not found`
  on a fresh clone. The script installs deps for `server/`, `client/` (helper at
  `scripts/e2e.sh:108`) and `reviewer-core/` (line 117), but **not for `e2e/` itself** — line
  163 is a bare `(cd e2e && npm test)`. The error names `tsx`, not the missing install, so it
  reads like a PATH problem; it isn't. Fix: `cd e2e && npm install` once. Everything before it
  (Postgres on :5433, migrate, seed, API on :3101, web on :3100) has already succeeded by
  then, so the whole stack gets torn down over a missing `node_modules`.

## Session Notes

## Open Questions
