# pr-self-review — skill documentation

Documentation *about* the skill. The skill itself is [SKILL.md](SKILL.md).

## Focus

One decision: **may this branch become a pull request?** Everything else —
which skills to consult, which gates to run, how to phrase the report — exists
to serve that decision.

## What it covers

- Mapping a local diff onto the repo's skill catalog, deterministically.
- Running the existing quality gates for the touched packages only.
- Classifying findings against a closed list of ten blocking rules.
- Producing one binary verdict, and enforcing it through a `PreToolUse` hook.
- Drafting the PR body once the branch passes.

## What it does not cover

- **Bug hunting** — that is `/code-review`. This skill checks conformance to
  repo rules, not correctness of logic.
- **Teaching** — it does not explain how to write a Fastify route or a React
  component. It routes to the skills that do.
- **The GitHub side** — no review comments, no PR approval, no merge queue.
  It stops at "the PR may be opened".

## Files

| File | Contents |
|---|---|
| [SKILL.md](SKILL.md) | the 8-phase run, the modes, the non-negotiables |
| [routing.md](routing.md) | glob → skill matrix, diff hygiene, scale limits |
| [blocking-rules.md](blocking-rules.md) | B1–B10, each with its source; and what is deliberately *not* blocking |
| [gates.md](gates.md) | which script runs when, in what order, and how to read a skip |
| [severity.md](severity.md) | the scale, the finding schema, dedup, `--json` shape |
| [safe-fixes.md](safe-fixes.md) | the closed `--fix` list and the refusals |
| [report-template.md](report-template.md) | report, verdict, override, receipt, PR body |

## Relationship to other skills

It **consumes** them. `onion-architecture`, `frontend-architecture`,
`react-best-practices`, `security` and the rest hold the knowledge; this skill
decides which of them a given diff has earned and collects their answers.

The dependency runs one way: a skill in the catalog never needs to know this one
exists. Adding a skill means adding a row to `routing.md` — and the phase-0
self-check reports it if you forget.

Closest neighbour is `engineering-insights`: both are procedural, both run at a
fixed point in the workflow, both are allowed to conclude "nothing to do". The
difference is what happens on a finding — `engineering-insights` writes a note,
this one stops the release.

## Design notes

**Why a receipt instead of just running the skill in the hook.** Hooks are
deterministic shell, not models. The review needs judgment; the gate needs
speed and predictability. Splitting them means `gh pr create` is checked in
milliseconds against work that took minutes.

**Why the fingerprint includes untracked files.** "New module, never
`git add`ed" is the most common way a change escapes a diff-based check. A
receipt that ignored untracked files would pass a branch nobody reviewed.

**Why CRITICAL is a closed list.** An open-ended "is this serious?" prompt
produces a different threshold every run, and a gate with a drifting threshold
gets disabled. Ten named rules, each traceable to a line in an `AGENTS.md` or a
config, can be argued with — which is the point.

**Why CRITICALs are verified by refutation.** A false CRITICAL blocks a person
from shipping; a missed HIGH costs a review comment. Asymmetric cost,
one-sided check.

**Why the override is public.** A bypass that leaves no trace is a bypass that
becomes routine. Writing the reason into the PR body makes it cost something.

## Known trade-offs

- **The web UI escapes the hook.** `gh pr create` is gated; opening a PR from
  github.com is not. Closing that needs a `pre-push` hook, which was deliberately
  left out of v1 — it fires on every push, including work-in-progress ones.
- **Full runs are minutes, not seconds.** Mitigated by the docs-only fast path,
  per-package gating, parallel fan-out, and the receipt acting as a cache.
- **Scale limits are heuristic.** 40 files / 3000 lines per slice is a guess that
  will need tuning. It is loud rather than accurate on purpose.
- **`--fix` cannot repair a client-side contract edit.** The server copy is
  canonical, so syncing would delete the change. Reported, never auto-fixed.

## Version history

- **1.0.0** — initial. 8 phases, 10 blocking rules, `PreToolUse` hook + receipt,
  `--fix` / `--json` / `--override` modes.

## Sources

- **Root and per-package `AGENTS.md`** — the conventions B1–B10 are derived from.
- **`TESTING.md`** — the five test lanes and the `*.it.test.ts` rule.
- **`server/.dependency-cruiser.cjs`**, `server/scripts/arch-ratchet.mjs` — the
  onion rules and the baseline ratchet.
- **`scripts/sync-shared.mjs`**, `.github/workflows/guards.yml` — the vendored
  contract invariant.
- `react-best-practices/SKILL.md`, `frontend-architecture/anti-patterns.md` — the
  CRITICAL/HIGH/MEDIUM scale this skill reuses rather than reinvents.
