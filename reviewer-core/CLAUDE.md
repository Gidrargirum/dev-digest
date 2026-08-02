# reviewer-core/ — the pure review engine

diff → prompt → LLM → grounded findings. **Zero I/O**: no DB, no GitHub, no
filesystem. The only side effect is a call to the injected `LLMProvider`.
Anything needing I/O stays in the caller (`server/`).

## Stack

Plain TypeScript 5.7 · Zod 3 (contracts + JSON Schema for structured output) ·
the `openai` SDK (only as an OpenAI-compatible client for OpenRouter) · vitest 2.

## Commands

```sh
npm test          # hermetic units with a stubbed provider; no keys needed
npm run typecheck # this is also the build — the package emits no JS
```

## Map

- `src/index.ts` — the package's public API; anything not exported here is private.
- `src/prompt.ts` — `assemblePrompt`, `wrapUntrusted`, `INJECTION_GUARD`.
- `src/grounding.ts` — the mechanical citation gate.
- `src/review/run.ts` — orchestration: mode selection, chunks, reduce, grounding.
- `src/review/reduce.ts` — merging partial Reviews, slicing a file's diff.
- `src/llm/structured.ts` — Zod → JSON Schema, `parseWithRepair`.
- `src/llm/openrouter.ts` — the single OpenAI-compatible provider in this package.
- `src/output/to-review.ts` — conversion to a GitHub review payload (for L06).

## Read when

Read [README.md](./README.md) when you need the pipeline overview or the list of public exports.
Read [docs/](./docs/README.md) when digging into a mechanism: prompt assembly, grounding, structured output, map-reduce.
Read [specs/](./specs/README.md) when changing a signature, the step order, or an engine guarantee.
Read [insights/](./insights/README.md) when editing `prompt.ts` or `grounding.ts` — most "obvious improvements" were already tried.

## Non-default conventions

- No import may perform I/O. If you need data, add a field to `ReviewInput` and
  let the caller resolve it.
- Inputs are **resolved strings**, not identifiers: skill bodies, not slugs;
  memory texts, not ids. Resolution is the caller's job.
- An optional prompt slot that isn't passed simply isn't rendered. That is a
  contract: feature off → prompt byte-identical to before the feature.
- Grounding is mandatory and non-removable: a finding without a real diff line is
  dropped, and `score` is recomputed from survivors. The model's self-reported
  score is ignored.
- Prompt-injection defense is exactly one `INJECTION_GUARD`. Denylists, regexes,
  and keyword scanning of untrusted text are forbidden — they catch one phrasing
  out of a thousand.
- Progress goes through `onEvent`; cancellation through `checkCancelled`, which
  throws. The package does not know the cancellation error type — the caller owns it.

## Gotchas

- This package is consumed **as source** via a tsconfig path alias, not as an npm
  package. A change here hits `server/` immediately, with no build step.
- `build` is `tsc --noEmit`. If you're waiting for `dist/`, it will never appear.
- Tests have no keys and no network. A new test that wants network is a signal the
  logic ended up in the wrong package.

## Do not touch

- `INJECTION_GUARD` — never weaken it and never make it conditional.
- The step order in `run.ts`: assemble → LLM → reduce → ground. Grounding is
  always last and always runs.
