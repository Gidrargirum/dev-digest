---
description: Executes an already-approved Development Plan — implement → architecture-review fix-loop → plan verification. Run spec-creator and implementation-planner manually first.
argument-hint: <paste the approved Development Plan, or "the plan above">
---

# /run-plan — execute an approved plan

Starts from an **already-approved** `implementation-planner` Development
Plan. `spec-creator` and `implementation-planner` are not part of this
command — run them manually, review their output yourself, and only invoke
`/run-plan` once the plan is final. No test-writer agent runs here either:
`implementer` adds the tests the plan names itself (see Discipline).

The plan is not persisted to a file (per `.claude/agents/README.md`) — it
travels as text. `$ARGUMENTS` must contain the plan itself, or clearly
refer to it ("the plan above") if it's already in this conversation.

If `$ARGUMENTS` contains no plan and none is identifiable in the
conversation, stop and ask for one rather than guessing scope.

## Phase 1 — Implement (`implementer`)

One `implementer` call for its whole step group — never one call per step.

**Free checkpoint:** read its *Not done* / *Deviations* / *Concerns for
review*. Anything load-bearing in *Not done* — stop, surface it to the
user, do not spend Phase 2 reviewing a diff known to be incomplete.

## Phase 2 — Architecture review, with a fix-loop

```
attempt = 1
loop:
  run architecture-reviewer on the current diff
  if verdict == CLEAN, or only MEDIUM rows remain: break
  if attempt > 3: stop the loop, surface the open CRITICAL/HIGH rows to
    the user instead of looping forever
  hand all CRITICAL/HIGH rows from this pass to implementer's Fix mode,
    one call for the whole batch
  attempt += 1
```

Re-run `architecture-reviewer` fresh each iteration — never trust a prior
pass's findings against code `implementer` has since touched.

## Phase 3 — Plan verification (`plan-verifier`)

Run last, after the Phase 2 loop exits — its `Tests` coverage rows need
the final diff. Hand it the plan's full text; the Phase 1 Implementation
Report is context, never evidence.

`GAPS` → one extra round: route to `implementer` (missing/partial/diverged
step) or back to the user (planning problem, needs `implementation-planner`
re-run manually). Don't loop this one unbounded.

## Phase 4 — Wrap-up

- Tell the user the branch is ready for `/pr-self-review` — don't run it
  yourself, don't run `gh pr create`.
- Mention `workflow-retro` is available for a cost/latency post-mortem on
  this run — don't invoke it yourself, it runs manually by design.
- Invoke `engineering-insights` unconditionally before ending, per
  `CLAUDE.md`'s session protocol.

## Discipline

- Never paraphrase the plan or a findings table before handing it to the
  next agent — each is a clean context.
- The Phase 2 cap (3) and Phase 3 cap (1) are defaults — honor an explicit
  user request for more, but say so rather than silently looping past them.
- Tests: the plan's own `Tests:` column is `implementer`'s job in Phase 1.
  If cost pressure eases later and a dedicated `api-test-writer`/
  `ui-test-writer` pass is wanted again, that's a deliberate manual call,
  not something this command adds back on its own.
- If any agent enters interview mode (asks a blocking question), relay it
  to the user verbatim and wait.
