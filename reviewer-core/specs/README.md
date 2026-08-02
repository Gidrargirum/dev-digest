# reviewer-core/specs/ — the engine contract

What the engine guarantees its callers. These are the strictest requirements in
the repo: both the studio and the future CI runner depend on them.

| Specification | About |
|---|---|
| _(empty)_ | — |

## What belongs here

- `reviewPullRequest` invariants: zero I/O, deterministic score, mandatory
  grounding, cancellation behaviour.
- The `ReviewInput` / `ReviewOutcome` contract: which slots are optional and what
  their absence means (the section simply isn't rendered).
- Requirements on the externally injected `LLMProvider`.

Read **before any** change to signatures or to the order of pipeline steps.
