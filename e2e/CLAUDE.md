# e2e/ — deterministic browser flows

The main user journeys through the real stack (web + API + seeded DB). No
Playwright, no LLM, no keys. Component tests do not belong here — they live in
`client/`.

## Stack

Vercel **agent-browser** (Rust + CDP CLI) · tsx as the runner (`run.ts`) ·
flows are plain JSON. No runtime dependencies.

## Commands

```sh
npm i -g agent-browser && agent-browser install   # once
../scripts/e2e.sh    # PREFERRED: isolated stack (:5433/:3101/:3100)
npm test             # against your own stack — only if the DB was just seeded
```

## Map

- `run.ts` — the runner: `{BASE}` substitution, sequential commands, assertions.
- `specs/*.flow.json` — **executable** flows (not documentation).
- `lib/assert.ts` — checks over a command's stdout.
- `test-results/` — failure screenshots, git-ignored.

## Read when

Read [README.md](./README.md) when you need the flow format, the flow list, or the env knobs.
Read [docs/](./docs/README.md) when digging into a mechanism: flow format, hermetic stack, debugging failures.
Read [insights/](./insights/README.md) when a run is flaky — the cause has probably been found before.
Read [the root specs/](../specs/README.md) when you need written e2e specifications (this package deliberately has none).

## Non-default conventions

- Locators must be deterministic: `--url`, `--text`, `find role|text|label`. The
  AI `chat` command is forbidden — it makes runs non-deterministic.
- `wait --text` / `wait --url` **are** the assertions: a non-zero exit fails the
  step. There is no separate assertion language.
- Flows run against seeded data only (`acme/payments-api`, PR #482, the seeded
  agents). Nothing may trigger a model call.
- A new flow is `NN-name.flow.json` with the next number; numbering sets the run
  order and shows up in CI logs.

## Gotchas

- Flows 02/04/05 follow the redirect to the **first** repo, so they assume the
  seeded repo is the only one. Your dev DB usually breaks that. Hence
  `../scripts/e2e.sh` rather than `npm test`.
- "A step hangs and times out" is almost never slowness — it's a locator whose
  target disappeared (copy changed). Raising `E2E_STEP_TIMEOUT` will not fix it.
- `specs/` here is not prose documentation; do not put `.md` files in it.

## Do not touch

- Your dev DB: never run flows against it "to save time".
- `docker compose down -v` — destroys the `devdigest_pgdata` volume along with
  every imported repo and review. The hermetic stack resets itself.
