---
name: pr-self-review
description: "Self-review of all local changes before opening a GitHub pull request. Use before `gh pr create`, before pushing a feature branch, when the user asks to open or create a PR, or on `/pr-self-review`. Maps the changed files in the local diff onto this repo's skill catalog — UI skills run on client files, onion-architecture on server and reviewer-core files — runs the mechanical gates, and emits one BLOCKED/PASS verdict. A single CRITICAL finding forbids merging. Trigger terms: open a PR, create pull request, gh pr create, before push, self review, pre-PR check, review my changes, merge gate, чи можна мержити, перевір зміни перед PR."
metadata:
  version: 1.0.0
  tags: review, pr, gate, quality, blocking, pre-merge
---

# PR Self Review — the pre-PR gate

Answers one question: **may this branch become a pull request?**

Not a bug hunt (that is `/code-review`), not a linter, not a style opinion.
This checks one thing: do the changes obey **this repo's own rules** — the ones
written in the skills, the `AGENTS.md` files, and `.dependency-cruiser.cjs`.

The verdict is binary and it is enforced: one CRITICAL finding and the PR does
not get opened. A `PreToolUse` hook holds `gh pr create` until a fresh receipt
says PASS.

| File | Read when |
|---|---|
| [routing.md](routing.md) | mapping changed paths onto skills — the glob → skill matrix |
| [blocking-rules.md](blocking-rules.md) | deciding whether a finding is CRITICAL — the 10 blocking rules |
| [gates.md](gates.md) | running the mechanical gates, or one of them failed |
| [severity.md](severity.md) | classifying a finding, or emitting `--json` |
| [safe-fixes.md](safe-fixes.md) | running `--fix` — what may and may not be auto-repaired |
| [report-template.md](report-template.md) | writing the report, the verdict block, or the PR body |

## Modes

| Invocation | Does |
|---|---|
| `/pr-self-review` | full run, report to chat, writes the receipt |
| `/pr-self-review --fix` | same, then applies the safe fixes and **re-runs the gates** |
| `/pr-self-review --json` | same run, machine-readable file instead of a chat report |
| `/pr-self-review --override "<reason>"` | receipt `OVERRIDE` + a mandatory ⚠️ block in the PR body |

---

## The run

Copy this checklist into your response and check items off as you go:

```
PR self-review:
- [ ] 0. Preflight — git state, base branch, routing self-check
- [ ] 1. Collect the diff and classify it into slices
- [ ] 2. Mechanical gates (touched packages only)
- [ ] 3. Fan out one subagent per (skill × slice), in parallel
- [ ] 4. Reduce — dedupe and merge findings
- [ ] 5. Verify every CRITICAL adversarially
- [ ] 6. Verdict + receipt
- [ ] 7. PR body draft (PASS/OVERRIDE only)
```

Phases 2 and 3 both produce findings; phase 2 is cheap and deterministic, so it
runs first and its failures are already CRITICAL before any model looks at code.

### 0. Preflight

- Not a git repo, or `HEAD` is the base branch itself → stop, say so, do nothing.
- Empty diff → verdict `NO CHANGES`. Do not run gates, do not spawn subagents.
- **Routing self-check**: compare `ls -d .claude/skills/*/` against the skills
  named in [routing.md](routing.md). A skill on disk with no routing rule will
  never run and nobody will ever notice — report it as HIGH. (`.claude/skills/README.md`
  rotted exactly this way; the table is guarded by `scripts/check-skills-lock.mjs`
  only for the *locked* skills.)

### 1. Diff

Detect the base, never hardcode it:

```sh
BASE_BRANCH=$(git symbolic-ref --quiet --short refs/remotes/origin/HEAD 2>/dev/null | sed 's|^origin/||')
BASE_BRANCH=${BASE_BRANCH:-main}
BASE=$(git merge-base "$BASE_BRANCH" HEAD)

git diff --name-status -M "$BASE"          # M/A/D/R — commits + working tree
git diff --stat "$BASE"
git ls-files --others --exclude-standard   # untracked — a whole new module
                                           # nobody ran `git add` on
```

Hygiene before routing — the rules are in [routing.md](routing.md#hygiene):
untracked files **are** reviewed; `D` is not reviewed but the *deletion* is
checked; `R` without content change only gets naming rules; lockfiles, generated
migrations and binaries are listed but not reviewed; oversized slices are
truncated **loudly**, never silently.

Then classify every path into slices per the matrix.

### 2. Gates

[gates.md](gates.md). Only for touched packages — never run client tests on a
server-only branch. Every gate failure is CRITICAL and needs no verification in
phase 5: a red `tsc` is not an opinion.

Check [gates.md's *Gate cache*](gates.md#gate-cache--do-not-re-run-what-already-ran-on-this-worktree)
first — if `implementer` (or an earlier run of this skill) already ran a gate
on this exact fingerprint, cite the cached result instead of re-running it.
Update `.claude/pr-self-review/gates-receipt.json` with whatever you end up
actually running, real or cached, so it stays the current source of truth for
the next agent.

### 3. Fan-out

For each (skill × non-empty slice) pair from the matrix, spawn **one subagent,
all in parallel**, capped at ~8 concurrent. Each subagent gets:

- the skill to load (its `SKILL.md`, plus its `anti-patterns.md` if it has one);
- the file list for its slice and the diff hunks for those files;
- the finding schema from [severity.md](severity.md);
- the instruction: *report findings, do not propose or apply edits*.

A subagent that finds nothing returns an empty list. That is the common case.

### 4. Reduce

Dedupe on `(file, line, rule)`. Two skills reporting the same line merge into
one finding that names both. Sort by severity, then by file.

### 5. Verify every CRITICAL

Each candidate CRITICAL goes to one subagent whose job is to **refute** it —
"default to refuted unless you can point at the exact line that breaks the
rule". A refuted CRITICAL drops to HIGH and stops blocking.

This is not ceremony. A false CRITICAL blocks a human being from shipping; a
missed HIGH costs a review comment. The cost is asymmetric, so the check is
one-sided.

Gate failures from phase 2 skip this — they are already mechanical facts.

### 6. Verdict and receipt

Report per [report-template.md](report-template.md), then write the receipt:

```sh
node .claude/hooks/pr-self-review-gate.mjs --fingerprint   # → "<head> <worktreeHash>"
```

Use **that command's output** for the receipt — it is the same function the hook
uses to detect staleness, so the two can never disagree. Write
`.claude/pr-self-review/receipt.json` (git-ignored).

### 7. PR body

Only on PASS or OVERRIDE. Write `.claude/pr-self-review/pr-body.md` from the
classified diff, the gate results and the touched test lanes, per
[report-template.md](report-template.md#pr-body). `gh pr create --body-file
.claude/pr-self-review/pr-body.md` then picks it up.

---

## Non-negotiables

- **On BLOCKED, do not open the PR.** Do not run `gh pr create`, do not suggest
  `--no-verify`, do not offer to edit the hook or the receipt by hand. The only
  legal exit is fixing the finding or `--override`, and an override is always
  public — it goes into the PR body.
- **Never hand-write the receipt.** It comes from `--fingerprint`, or it is worthless.
- **Never widen scope.** This skill reports; it edits nothing except in `--fix`,
  and there only what [safe-fixes.md](safe-fixes.md) lists.
- **Never truncate silently.** If a slice was too big to review whole, the report
  says how many files were skipped. "Reviewed 40/78" is useful; a clean-looking
  PASS over an unread diff is the worst failure this skill can have.
- **A gate that cannot run is not a gate that passed.** Docker missing, deps not
  installed, script erroring → report it as `SKIPPED` and treat the run as
  incomplete, never as green.
