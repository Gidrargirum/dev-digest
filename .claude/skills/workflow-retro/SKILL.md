---
name: workflow-retro
description: Retrospective on a just-finished multi-agent pipeline run (e.g. /run-plan) — tokens, cache reads, tool calls, duration and parallelism, per agent and per nested subagent. Deep mode reads each subagent's own transcript from disk, because the orchestrator's own end-of-turn usage total does not include what its subagents spent. Produces concrete actions (dedupe repeated context, preload a shared file once, split an overloaded agent role, reduce concurrency) and appends a one-line trend entry to docs/retros/ledger.md. Invoke manually after a full pipeline finishes, or on /workflow-retro — never automatically as part of the pipeline itself.
---

# Workflow Retro

Answers one question: **where did this run's tokens and wall-clock actually
go, and what would change it next time?** Not a summary of what the pipeline
did — `implementer`'s Implementation Report and `plan-verifier`'s coverage
report already cover that. This is a cost/latency post-mortem.

Runs **manually only** — never wire this into `/run-plan` or any other
pipeline command itself. A retro that fires automatically on every run stops
getting read.

## Retro checklist

Copy this into your response and check items off as you go:

```
Workflow retro:
- [ ] 0. Scope — which run, quick or deep mode
- [ ] 1. Rebuild the run manifest — every phase, every agent call, its transcript reference
- [ ] 2. Collect metrics per agent (tokens, cache, tool calls, start/end)
- [ ] 3. Roll up per phase — totals, wall-clock, actual overlap vs nominal parallelism
- [ ] 4. Derive actions (references/metrics.md)
- [ ] 5. Report
- [ ] 6. Append one row to docs/retros/ledger.md
```

## 0. Scope

Default to **quick** mode. Switch to **deep** when the user asks for it
explicitly, or when quick mode's own numbers look implausible (e.g. the
visible total is small but the run clearly did a lot of subagent work) —
say so before switching, don't silently upgrade.

- **Quick** — uses only what's already visible in this conversation: the
  count and order of `Agent`/`Task`/`Workflow` calls made during the run,
  their labels/phases, and the orchestrator's own end-of-turn usage figures.
  Cheap, but **known to undercount** — say this explicitly in the report,
  every time, not just the first time.
- **Deep** — re-reads each subagent's own transcript from disk. See below
  for why this is the only way to get real per-subagent numbers.

## 1. Why deep mode exists

The orchestrator's own reported usage reflects tokens **it** generated —
not what a subagent it spawned consumed doing its own reading, tool calls,
and reasoning. Two concrete on-disk sources exist for that, depending on
how the run was orchestrated:

- **A `Workflow`-orchestrated run**: the Workflow tool's result carries a
  `runId` and a transcript directory containing `journal.jsonl` — one entry
  per `agent()` call with its actual usage.
- **A directly spawned subagent** (`Agent` tool — `implementer`,
  `architecture-reviewer`, `plan-verifier`, etc., or a `fork`): its tool
  result carries a transcript/output reference for that specific call.

**Capture these references live, as each call happens** — write them to a
scratch file (`{phase, agent, ref, started, finished}` per line) during the
pipeline run itself. Reconstructing this list after the fact from memory is
unreliable, especially once earlier turns have been summarized — a retro
that skips this step degrades to quick mode without saying so, which is the
one thing this skill must never do.

If a deep retro is requested but no manifest was captured live during the
run, say so plainly: report what quick mode can still show, mark every
per-subagent number as `unknown, not captured`, and recommend capturing the
manifest next time — do not estimate or interpolate a subagent's cost from
its role or from other runs.

## 2–4. Metrics and actions

See [references/metrics.md](references/metrics.md) — what to sum per
transcript, how to compute actual vs nominal parallelism, and the four
action categories with the thresholds that justify each one. Do not
recommend an action the data doesn't evidence.

## 5. Report format

```markdown
## Workflow Retro — <pipeline / command name>, <date>

### Mode
<quick | deep> — <one line: why, and quick mode's undercount caveat if quick>

### Per agent
| Phase | Agent | Calls | Tokens (in/out) | Cache read | Cache creation | Tool calls | Duration |
|---|---|---|---|---|---|---|---|

### Per phase
| Phase | Wall-clock | Declared parallel | Actual overlap | Note |
|---|---|---|---|---|

### Recommended actions
- <action type> — <file/agent/phase it targets> — <the number that justifies it>

### Not captured
- <agent/phase whose transcript reference was missing, and why the number is unknown>
```

## 6. Ledger

Append **one row** to `docs/retros/ledger.md` per retro run — see
[references/ledger-format.md](references/ledger-format.md) for the exact
columns. `Edit` to append; never `Write` over the file, and never reorder or
delete a prior row — the ledger's whole value is the trend across runs, and
a trend with gaps in it is still honest, a trend with rewritten history is
not.

## Non-negotiables

- Never guess a subagent's tokens when deep mode was requested and its
  transcript reference is missing — report `unknown`, don't interpolate.
- Quick mode always states its own undercount, in the report itself, not
  just in this skill file.
- An action recommendation always cites the specific number that produced
  it (a token total, an overlap ratio, a duplicate-context byte count) — a
  recommendation with no cited evidence is not reported.
- The ledger is append-only. Fixing a wrong prior row is a new dated
  correction line, not an edit to the old one.
