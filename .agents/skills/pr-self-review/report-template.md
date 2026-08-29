# Report, verdict, receipt, PR body

## The report

One block, to chat. Gates before findings — a red gate explains most of what
follows it.

```
## PR Self Review — BLOCKED ⛔

Base: main (merge-base a1b2c3d) · 14 files · +420 −38
Slices: server-backend(6) · client-ui(5) · contracts(2) · docs(1)
Not reviewed: pnpm-lock.yaml, server/src/db/migrations/0007_add_cost.sql (generated)

Gates
  ✅ contracts in sync        ❌ server arch:check (1 new violation)
  ✅ server typecheck         ✅ server arch:ratchet
  ✅ server unit (19 files)   ⚠️ server integration — SKIPPED (no Docker)
  ⏭️ client — not touched

Findings                                    CRITICAL 2 · HIGH 3 · MEDIUM 4

⛔ CRITICAL
1. server/src/modules/agents/service.ts:41 — onion-architecture · B2
   Service imports db/schema directly, bypassing the repository.
   > import { agents } from '../../db/schema'
   Fix: move the query behind AgentRepository and inject it.

2. client/src/vendor/shared/review.ts:12 — vendor-parity · B1
   Field added to the client mirror only; the canonical server copy is unchanged.
   > + costUsd: z.number().optional(),
   Fix: apply the same change to server/src/vendor/shared/review.ts — the client
   copy is the mirror, so `--fix` cannot resolve this direction for you.

⚠️ HIGH (3) — expand on request
· client/src/app/repos/page.tsx:28 — frontend-architecture · page.tsx holds feature state
· server/src/modules/runs/service.ts:77 — onion-architecture · cross-module import
· .claude/skills/mermaid-diagram — routing · skill has no rule in routing.md

ℹ️ MEDIUM (4) — expand on request

Verdict: MERGE FORBIDDEN — 2 critical finding(s).
This run was incomplete: the integration lane never ran.
Fix the findings and re-run /pr-self-review.
```

Rules for writing it:

- HIGH and MEDIUM collapse to one line each. Nobody reads twelve paragraphs
  before a blocked merge; the two CRITICALs are the message.
- Every CRITICAL carries its evidence line. No evidence, no CRITICAL.
- `Not reviewed:` and the truncation lines are never omitted to save space.
- If the run was incomplete, the verdict block says so — even on PASS.

## Verdicts

| Verdict | When |
|---|---|
| `PASS ✅` | no CRITICAL |
| `BLOCKED ⛔` | ≥ 1 CRITICAL surviving verification |
| `OVERRIDE ⚠️` | CRITICAL present, `--override "<reason>"` given |
| `NO CHANGES` | empty diff |

On BLOCKED: do not open the PR, do not offer a workaround, do not suggest
editing the hook or the receipt. Say what is broken and stop.

## Override

`--override "<reason>"` is the only bypass, and it is never quiet:

- the receipt records `"verdict": "OVERRIDE"` and the reason;
- the PR body **must** begin with the block below — this is not optional
  decoration, it is the price of the bypass:

```markdown
> ⚠️ **Self-review overridden** — <reason>
>
> Ignored blocking findings:
> - `server/src/modules/agents/service.ts:41` — B2, service imports db/schema
```

An override with no reason is not an override. Ask for one.

## Receipt

`.claude/pr-self-review/receipt.json`, git-ignored:

```json
{
  "head": "e4f5g6h…",
  "worktreeHash": "4d5e6f…",
  "verdict": "PASS",
  "critical": 0,
  "incomplete": false,
  "override": null,
  "at": "2026-08-13T12:40:00Z"
}
```

`head` and `worktreeHash` come from `node .claude/hooks/pr-self-review-gate.mjs
--fingerprint` — the hook's own function. Never hand-write them: a receipt that
does not match what the hook computes either blocks a clean branch or, worse,
passes a stale one.

## PR body

Only on PASS or OVERRIDE. Write `.claude/pr-self-review/pr-body.md`, then:

```sh
gh pr create --title "<title>" --body-file .claude/pr-self-review/pr-body.md
```

Shape — the override block first if there is one, then:

```markdown
## What changed

<2–4 sentences: the intent, not a file listing. The diff is already visible.>

## Where

- **server** — the run-cost path: `service.ts` now resolves pricing before persisting
- **client** — cost badge on the PR list and the trace drawer
- **contracts** — `costUsd` added to `ReviewRun` (both vendored copies)

## Checks

Self-review: PASS · gates green (server typecheck, arch:check, arch:ratchet,
unit 19 files · client typecheck, lint, tests)
Test lanes touched: server-unit, client
```

Keep it factual and short. The "Where" section comes straight from the slice
classification and the "Checks" line from the gate results — both are already
computed, so this phase invents nothing. Never claim a lane ran when it was
skipped.
