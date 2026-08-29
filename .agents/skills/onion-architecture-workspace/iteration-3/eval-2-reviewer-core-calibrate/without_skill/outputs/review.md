# Architecture review — `reviewer-core/src/review/calibrate.ts`

**Verdict: not acceptable in the domain ring as written.**

The file takes its data through parameters and typechecks in isolation, but it breaks
several of `reviewer-core/`'s stated conventions (`reviewer-core/AGENTS.md` → *Non-default
conventions*, *Gotchas*) and the onion rule that the domain performs no I/O and its unit
tests are hermetic and deterministic.

---

## 1. Reads an environment variable (`process.env.CALIBRATE_DEBUG`) — line 19

The domain does no ambient I/O. `AGENTS.md`: *"Tests have no keys and no network"* and the
package is *"hermetic units with a stubbed provider; no keys needed"*. Reading `process.env`
makes behaviour depend on the ambient process environment, which the domain must never do.

**Fix:** delete the `debug` flag. If a caller genuinely needs calibration diagnostics, they
must be an explicit function parameter (a boolean, or better an injected sink), never an env
read — but see #2, the diagnostic itself is also disallowed.

## 2. Writes to stderr (`console.error`) — line 27

This is an I/O side effect. `AGENTS.md`: *"The only side effect is a call to the injected
`LLMProvider`"* and *"Progress goes through `onEvent`"*. A domain function may not write to
the console; that also makes output non-hermetic and pollutes test runs.

**Fix:** remove the logging. If per-finding calibration detail must escape, return it as
data (part of the function's return value) and let the caller log it.

## 3. Non-deterministic: `Math.random()` jitter — line 25

`Math.random()` makes `confidence`, the `sort` order, and the kept/dropped split
non-deterministic. The domain's unit tests must be deterministic; this function cannot be
asserted against a fixed expectation. Multiplying calibrated confidence by random noise is
also not defensible on its own terms.

**Fix:** remove the `jitter` factor entirely: `confidence = Math.min(1, f.confidence * decay)`.

## 4. Reads the wall clock: `Date.now()` — line 18

`Date.now()` is ambient input. The decay computation depends on "now", so the result varies
by run and cannot be tested deterministically. `AGENTS.md`: *"If you need data, add a field
… and let the caller resolve it."* Time is exactly such data.

**Fix:** add a `now: number` parameter (the caller passes `Date.now()`), and compute
`decay` from that.

## 5. Invents a prompt slot and mutates the prompt contract — lines 35–41

`calibrateFindings` reaches into prompt assembly, which is a separate concern owned by
`src/prompt.ts`. Three problems:

- **`calibrationNote` is not a field on `PromptParts`** (`src/prompt.ts` lines 39–81). The
  contract has an explicit, documented set of optional slots; this adds an undeclared one.
  Against the real `PromptParts` this object literal does not even typecheck (excess
  property). Prompt slots are added in `prompt.ts` with an explicit optional field plus a
  render gate — not bolted on from a review-stage function.
- **It violates the optional-slot contract.** `AGENTS.md`: *"An optional prompt slot that
  isn't passed simply isn't rendered … feature off → prompt byte-identical to before the
  feature."* Here the note is injected unconditionally whenever `findings.length > 0`, so
  turning calibration on changes the prompt bytes for essentially every review.
- **Layering.** A findings-calibration pass should not be re-shaping the prompt output
  artifact at all.

**Fix:** drop the prompt manipulation. Return the note as its own value, e.g.
`{ findings: kept, note: string | null }`, and let the caller (in `server/`, or `run.ts`)
decide whether and how to feed a follow-up pass. If a follow-up prompt genuinely needs a
calibration slot, add an optional field to `PromptParts` in `prompt.ts` with the standard
"omitted when absent" gate.

---

## Not flagged (acceptable)

- Taking `findings`, `prompt`, and `priorSeenAt` as resolved parameters — correct; matches
  *"Inputs are resolved strings/values, not identifiers"*.
- `import type { PromptParts } from '../prompt.js'` — domain-to-domain, fine.
- The decay / floor / sort logic itself is pure and fine once #3 and #4 are removed.

## Summary of required changes

| # | Rule broken | Fix |
|---|---|---|
| 1 | `process.env` read | remove `debug` flag |
| 2 | `console.error` I/O | remove logging / return as data |
| 3 | `Math.random()` non-determinism | drop jitter |
| 4 | `Date.now()` ambient clock | add `now: number` parameter |
| 5 | undeclared prompt slot + byte-identical contract + layering | return note as data; don't touch `PromptParts` |
