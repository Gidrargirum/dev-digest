# Architecture review — `reviewer-core/src/review/calibrate.ts`

**Verdict: not acceptable in the domain ring as written.**

The file typechecks and takes its data through parameters, but it performs
ambient I/O and non-deterministic work inside the pure domain package, and it
invents a prompt slot that does not exist. Four rule breaks, one of them
critical.

---

## 1. CRITICAL — environment read in the domain ring

```ts
const debug = process.env.CALIBRATE_DEBUG === '1';
```

Breaks **SKILL.md rule 3 (Purity)**, decision-tree ("Does this code touch the
outside world — DB, network, filesystem, **clock, env**?" → Yes → infrastructure),
anti-patterns #9 ("Any `fs`, `fetch`, DB or **env read** in the domain ring"),
and `reviewer-core/CLAUDE.md` ("No import may perform I/O… env read"). It also
breaks hermetic tests, which run with no keys and no env set up.

**Fix:** remove the env read. If a debug channel is genuinely wanted, take it as
a resolved input — `calibrateFindings(findings, prompt, priorSeenAt, opts?: { debug?: boolean })`
— and let the caller (`server/`) read the env var. Inputs are resolved values,
not identifiers the core resolves itself.

## 2. CRITICAL — `console.error` side effect in the domain ring

```ts
if (debug) console.error(`[calibrate] ${f.id} ${f.confidence} -> ${confidence}`);
```

The engine's only permitted side effect is the injected `LLMProvider` call
(SKILL.md rule 3; `reviewer-core/CLAUDE.md`). Progress/diagnostics in this
package go through the injected `onEvent` sink (see `ReviewInput.onEvent` in
`src/review/run.ts` and the CLAUDE.md "Progress goes through `onEvent`" rule) —
never straight to stderr.

**Fix:** drop the `console.error`. If per-finding trace output is needed, emit it
through an injected event callback passed in by the caller.

## 3. CRITICAL — non-deterministic domain logic (`Math.random`, `Date.now`)

```ts
const now = Date.now();
const jitter = 1 + (Math.random() - 0.5) * 0.02;
```

`Date.now()` is a clock read — the decision tree lists "clock" alongside env and
network as the outside world. `Math.random()` makes the calibration output
irreproducible: the same findings + same `priorSeenAt` yield a different
`confidence`, a different sort order, and potentially a different kept/dropped
set on every call. That is untestable in the hermetic unit lane and violates the
"pure review logic" bar for the domain ring.

**Fix:**
- Take the current time as a parameter: `now: number` (caller resolves, same as
  skills/memory/specs are resolved strings). This matches how `priorSeenAt` is
  already passed in — good — so `now` should come the same way.
- Remove the `jitter` term entirely. Random perturbation of a confidence score
  has no place in a deterministic engine; if tie-breaking is the goal, use a
  stable key (e.g. `f.id`) in the comparator.

## 4. WARNING — phantom prompt slot; breaks the "feature off → prompt byte-identical" contract

```ts
next = { ...prompt, calibrationNote: `Calibration: kept ${kept.length}/…` };
```

`PromptParts` (`src/prompt.ts`) has no `calibrationNote` field, and
`assemblePrompt` renders no such section. This compiles only because a spread
suppresses excess-property checks; the property is then dead data that never
reaches the model. `reviewer-core/CLAUDE.md`: "An optional prompt slot that
isn't passed simply isn't rendered. That is a contract." Adding a slot that is
*set but never rendered* is the inverse failure — a silent no-op that looks like
a feature.

**Fix:** decide what this is meant to do.
- If calibration feedback should reach a follow-up prompt: add a real optional
  field to `PromptParts`, render it in `assemblePrompt` behind an
  `if (parts.calibrationNote?.trim())` guard so the prompt stays byte-identical
  when absent, mirror it in the `PromptAssembly` record, and update
  `reviewer-core/specs/`. That is a contract change, not a drop-in file.
- If it is not actually needed: return `{ findings: kept }` only and drop the
  `prompt` round-trip.

## 5. NOTE — pipeline integration is out of scope of this file but will break a "do not touch" rule

`run.ts` has a fixed step order — `assemble → LLM → reduce → ground` — and
`reviewer-core/CLAUDE.md` lists it under "Do not touch": "Grounding is always
last and always runs." A pass that re-sorts findings and drops them below a
`CONFIDENCE_FLOOR` is a second filtering gate. Wherever it gets wired in, it must
not land after grounding, and the reduce→calibrate→ground ordering needs a spec
update in `reviewer-core/specs/` before it is added to `run.ts`. Not a defect in
this file, but it means the file cannot be merged on its own.

---

## What is fine

- Data comes in through parameters; no `fs`, no `fetch`, no import from
  `server/`. `priorSeenAt` as a resolved `Record<string, number>` is exactly the
  right shape — the caller resolves the "seen at" history, the core just does the
  math.
- `Finding.confidence` (0–1) and `Finding.id` are real contract fields, so the
  arithmetic is well-typed.
- The decay/floor logic itself is pure and belongs in the domain ring — only the
  ambient reads and the fake prompt slot disqualify it.

## Minimal path to acceptable

1. Delete the `process.env` read and the `console.error`.
2. Delete the `jitter` term; add `now: number` as a parameter.
3. Either add a real, rendered `calibrationNote` slot to `PromptParts` (+ spec)
   or stop returning a mutated `prompt`.
4. Land the `run.ts` wiring and the step-order spec change in the same PR.
