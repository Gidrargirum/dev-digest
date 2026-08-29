# Review — `reviewer-core/src/review/calibrate.ts`

**Verdict: not acceptable in the domain ring as written.**

The signature is shaped correctly — all data (`findings`, `prompt`,
`priorSeenAt`) arrives through parameters, no `fs`/`fetch`/`server` import — but
the body performs ambient I/O, reads the environment, and is non-deterministic.
`reviewer-core/` is the pure domain package: "Zero I/O … the only side effect is
a call to the injected `LLMProvider`", and its tests are hermetic (no keys, no
network, no env). This file breaks that on several counts.

---

## Violations

### 1. Reads `process.env` (line 17)

```ts
const verbose = process.env.CALIBRATE_VERBOSE === '1';
```

The domain must not read the environment. `reviewer-core/CLAUDE.md`: tests run
"with no keys and no env"; configuration enters through parameters, not
`process.env`. This makes behaviour depend on ambient state the caller cannot see
or control.

**Fix:** delete it. If a caller genuinely needs a calibration trace, pass an
explicit `onAdjust?: (fingerprint, before, after) => void` callback parameter (or
reuse the existing `onEvent` progress channel) and let `server/` decide whether
to log.

### 2. Writes to `console.error` (line 25)

```ts
if (verbose) console.error(`[calibrate] ${f.fingerprint} ${f.confidence} -> ${confidence}`);
```

Console output is I/O and a side effect the package contract forbids ("The only
side effect is a call to the injected `LLMProvider`"). Progress/diagnostics in
this package go through the injected `onEvent` channel, never `console`.

**Fix:** remove; route through an injected callback as in (1).

### 3. Non-deterministic: `Math.random()` (line 23)

```ts
const jitter = 1 + (Math.random() - 0.5) * 0.02;
```

The domain's tests are hermetic and must be reproducible. A random perturbation
of `confidence` makes `calibrateFindings` return different output for identical
input, so it cannot be unit-tested without stubbing a global. (It is also
questionable on the merits — randomly nudging model confidence up or down has no
stated justification — but the architectural problem is the hidden entropy
source.)

**Fix:** drop the jitter entirely. If deterministic tie-breaking noise is truly
wanted, inject a `rng: () => number` parameter so the caller (and tests) supply
it.

### 4. Reads the ambient clock: `Date.now()` (line 16)

```ts
const now = Date.now();
```

`Date.now()` is an un-injected, non-deterministic input — the same impurity class
as `process.env`. It makes the recency-decay branch untestable without faking
timers, and it is a hidden dependency the signature doesn't declare.

**Fix:** add an explicit `now: number` (or `nowMs: number`) parameter; the
caller in `server/` passes `Date.now()`. This matches the package rule that
inputs are resolved values passed in, not resolved inside the domain.

### 5. Invents an uncontracted prompt slot: `calibrationNote` (line 35)

```ts
prompt: { ...prompt, calibrationNote: note },
```

`PromptParts` (defined in `reviewer-core/src/prompt.ts`) has no `calibrationNote`
field, so this does not type-check under the package's strict config. More
importantly, prompt slots are a governed contract: a new slot must be threaded
through `PromptParts`, rendered by `assemblePrompt`, and mirrored in
`PromptAssembly` (and the vendored `@devdigest/shared` copies). Bolting an
ad-hoc field onto the prompt object from a side module is layering drift — the
field is silently dropped because `assemblePrompt` never reads it, and it
violates the "prompt slot that isn't rendered doesn't exist" contract.

**Fix:** decide what the note is for. If it belongs in the LLM prompt, add
`calibrationNote?: string` to `PromptParts` and render it in `assemblePrompt`
(trusted text, no `wrapUntrusted`), deliberately, with the spec/contract update
that implies. If it is just metadata for a follow-up pass, return it as a
separate field of the result object rather than mutating `prompt`.

### 6. Wrong import source for `PromptParts` (line 2)

```ts
import type { Finding, PromptParts } from '@devdigest/shared';
```

`PromptParts` is not a shared contract — it is declared and exported by
`reviewer-core/src/prompt.ts` (`src/index.ts` re-exports it from `./prompt.js`).
Only `Finding` comes from `@devdigest/shared`.

**Fix:**

```ts
import type { Finding } from '@devdigest/shared';
import type { PromptParts } from '../prompt.js';
```

### 7. `Finding` has no `fingerprint` field (lines 21, 22, 25, 31 via `f.fingerprint`)

The shared `Finding` contract (`contracts/findings.ts`) has `id`, `severity`,
`category`, `title`, `file`, `start_line`, `end_line`, `rationale`,
`suggestion`, `confidence`, `kind`, … — no `fingerprint`. `priorSeenAt` is
keyed by `f.fingerprint`, which is `undefined` for every finding, so the decay
branch is dead code and the file does not type-check.

**Fix:** key on `f.id` if that is the intended identity, or — if a stable
cross-run fingerprint is a real requirement — add it to the `Finding` contract
deliberately (both vendored copies) before consuming it here.

---

## What is fine

- Parameter-only data flow; no filesystem, network, or `server/` import.
- The pure transform itself — map → recompute `confidence` → `sort` → `filter` —
  is legitimate domain logic and belongs in `reviewer-core/`.

Once items 1–4 are removed/injected, 5 is either contracted or moved out of the
prompt object, and 6–7 are corrected, the function is acceptable in the domain
ring.
