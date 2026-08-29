# Architecture review — `reviewer-core/src/review/calibrate.ts`

**Verdict: not acceptable in the domain ring as written.**

"No `fs`, no `fetch`, no import from `server/`" is necessary but not sufficient.
The domain ring (`reviewer-core/`) must be *pure*: `diff → prompt → LLM → findings`,
with the injected `LLMProvider` call as its **only** side effect, and its output must
be a deterministic function of its inputs (hermetic tests run with no keys, no
network, and a stubbed provider). This file breaks that on several counts, and it
also does not type-check against the real contracts.

---

## 1. Reads `process.env` — purity violation (SKILL.md rule 3, anti-patterns #9)

```ts
const verbose = process.env.CALIBRATE_VERBOSE === '1';
```

`anti-patterns.md#9` names this exactly: "Any `fs`, `fetch`, DB or **env read** in
the domain ring." `stack-rules.md` (`reviewer-core` section): "No import may perform
I/O. Need data? Add a field to `ReviewInput`." Environment is outside-world state;
the domain ring may not reach for it.

**Fix:** remove it, or pass `verbose` (or a `debug`/logger) in as a parameter that
the caller resolves in `server/`.

## 2. Writes to `console.error` — an unsanctioned side effect

```ts
if (verbose) console.error(`[calibrate] ${f.fingerprint} ...`);
```

The domain's only permitted side effect is the injected `LLMProvider` call. Writing
to stderr is I/O and makes the function non-referentially-transparent.

**Fix:** drop the logging, or accept an injected logger port and call that. Logging
belongs to infrastructure/entry.

## 3. `Math.random()` — non-deterministic domain output

```ts
const jitter = 1 + (Math.random() - 0.5) * 0.02;
const confidence = Math.min(1, f.confidence * decay * jitter);
```

`decision-tree.md`: "Does this code touch the outside world — DB, network,
filesystem, **clock, env**?" Ambient non-determinism is in the same category. A
random multiplier means the same `findings` produce different `confidence` values
(and therefore different `kept`/dropped sets and a different `calibrationNote`) on
every call — hermetic unit tests can't assert on it, and run traces stop being
reproducible.

**Fix:** remove the jitter. If deliberate perturbation is genuinely required, take a
seeded RNG (or the jitter values) as a parameter so the caller owns the entropy
source.

## 4. `Date.now()` — clock read in the domain ring

```ts
const now = Date.now();
const decay = seen ? Math.pow(0.5, (now - seen) / RECENCY_HALF_LIFE_MS) : 1;
```

Same rule as #3: the clock is the outside world. The decay math itself is fine
domain logic — but `now` must be supplied.

**Fix:** add a `now: number` parameter (the caller passes `Date.now()`), consistent
with "Need data? Add a field to the input."

## 5. Imports `PromptParts` from `@devdigest/shared` — wrong source, and it does not exist there

```ts
import type { Finding, PromptParts } from '@devdigest/shared';
```

`PromptParts` is **not** a contract. It is defined in `reviewer-core/src/prompt.ts`
and re-exported from `reviewer-core/src/index.ts`. `vendor/shared` holds Zod
contracts and port interfaces only. This import will not resolve.

**Fix:** `import type { PromptParts } from '../prompt.js';` and keep
`import type { Finding } from '@devdigest/shared';`.

## 6. Mutates the `PromptParts` contract with an undeclared slot

```ts
prompt: { ...prompt, calibrationNote: note },
```

`PromptParts` has a fixed, documented set of optional slots (`skills`, `memory`,
`specs`, `repoMap`, `callers`, `prDescription`, `intent`, …). `calibrationNote` is
not one of them, so this is an excess-property type error; even past that,
`assemblePrompt` never renders it, so it silently does nothing.
`stack-rules.md`: "Optional prompt slots that are not passed are not rendered …
This is a contract." A calibration helper is also the wrong place to be extending
the prompt schema — `prompt.ts` owns `PromptParts`.

**Fix:** if a calibration note really needs to reach a follow-up prompt, add the
slot to `PromptParts` **and** to `assemblePrompt`'s rendering (guarded "rendered iff
non-empty", like the others), as a deliberate contract change. Otherwise return the
note as a plain value and let the caller decide what to do with it — don't fold it
into `PromptParts`.

## 7. `f.fingerprint` — not a field on `Finding`

The real `Finding` contract (`vendor/shared/contracts/findings.ts`) has `id`, not
`fingerprint`. `f.fingerprint` (and the `priorSeenAt` keying) will not type-check.

**Fix:** key on `f.id`, or if a stable cross-run fingerprint is a real need, compute
it from `Finding` fields in a pure helper and document it — but the property
accessed must exist on the contract.

---

## Not flagged (acceptable)

- **Taking `priorSeenAt: Record<string, number>` as a parameter** — correct: a
  resolved map handed in by the caller, matching "inputs are resolved values, not
  identifiers." The domain does no lookup itself.
- **The confidence-floor drop (`>= 0.4`) and re-sort** — that is domain policy and
  belongs here.
- **File location `reviewer-core/src/review/`** — the right ring/folder for a pure
  calibration pass, once #1–#4 are removed.

## Suggested signature after fixes

```ts
export function calibrateFindings(
  findings: Finding[],
  priorSeenAt: Record<string, number>,
  now: number,
): { findings: Finding[]; calibrationNote: string } {
```

Drop `prompt` from the parameters and the return unless slot #6 is done properly;
return the note as a value.
