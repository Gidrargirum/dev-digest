# Metrics and action heuristics

## Per-transcript metrics

For each subagent transcript (or `journal.jsonl` entry) collected in the run
manifest, sum across every assistant message in that transcript:

- `input_tokens`, `output_tokens`
- `cache_creation_input_tokens`, `cache_read_input_tokens`
- tool-call count — number of `tool_use` blocks
- duration — first message timestamp to last message timestamp

Roll these up two ways: per agent role (all `implementer` calls together,
all `architecture-reviewer` calls together, …) and per phase (everything
that ran under one pipeline phase, regardless of role).

## Actual vs nominal parallelism

A phase that issued N calls "in parallel" (e.g. the Phase 4 fix-loop
handing a batch of findings to one `implementer` call, or Phase 4b running
`api-test-writer`/`ui-test-writer` side by side) is only actually
concurrent if their `[started, finished]` windows overlap. Compute the
overlap ratio: `overlap time / span of the whole batch`. A batch whose
calls ran back-to-back with near-zero overlap was serialized somewhere
(a concurrency cap, a dependency between calls that wasn't supposed to
exist) — that is itself a finding, independent of the four action
categories below.

## The four action categories

Report an action only when the number below actually crosses the
threshold — these are defaults, adjust them out loud if the run's scale
makes them obviously wrong (e.g. a two-agent run has no meaningful
"median" to compare against).

### 1. Remove duplicated context

**Trigger**: the same block of ≥ ~500 tokens (a full plan, a full spec, an
entire file) appears verbatim in the prompts of ≥ 2 subagent calls within
the run, where one call could instead have referenced a path the other
already established, or where a narrower excerpt would have done.

**Action**: name the two (or more) calls, the duplicated block, and
recommend passing a reference/path instead of re-pasting full text — or
trimming to the slice that call actually needed.

### 2. Preload a shared file

**Trigger**: the same file (e.g. `AGENTS.md`, `gates.md`, a spec) was
independently `Read` by ≥ 3 subagents within one phase, each paying its own
input-token cost for identical content.

**Action**: recommend the orchestrator read it once and pass the relevant
excerpt into each subagent's prompt, instead of letting every clean-context
subagent re-read the whole file. Note the tradeoff explicitly: this only
saves tokens if the excerpt is smaller than each subagent's own full read
would have been — don't recommend it if the file is small enough that the
saving is noise.

### 3. Split an overloaded role

**Trigger**: one agent call's total (input + output + cache) tokens, or its
tool-call count, is more than ~2x the run's per-call median for that
phase — a sign a single call absorbed work that belonged in more than one
step.

**Action**: name the call and what it did; recommend splitting it into
narrower calls (e.g. `implementer`'s Fix mode getting handed CRITICAL and
HIGH findings across three unrelated files in one call — split by file or
by rule instead).

### 4. Reduce concurrency

**Trigger**: a "parallel" batch (see *Actual vs nominal parallelism* above)
shows either (a) an overlap ratio below ~30% — the concurrency bought
nothing, wall-clock was serial anyway — or (b) high overlap but a combined
cache-read cost that dwarfs what running the same calls serially would have
cost (each concurrent call pays its own cache-read instead of sharing one
warm cache).

**Action**: name the batch and the phase; recommend running it serially, or
lowering how many calls are issued at once, and cite the overlap ratio or
the cache-read total that justifies it.
