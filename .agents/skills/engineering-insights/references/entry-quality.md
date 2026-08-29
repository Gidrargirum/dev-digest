# Entry quality

## The cold-read test

An entry must be actionable **cold**: an agent that has never seen this
session reads it and knows exactly what to do or avoid, without having to
re-investigate.

**Test before writing:** "would this be obvious to anyone reading the code?"
If yes, don't write it. A statement that just restates what the code already
says is noise, not an insight.

**Second filter:** an entry with no file name, symbol, command, or config key
in it is almost always too generic. Either tie it to something concrete or
drop it.

## Good vs. bad

| ❌ Too vague | ✅ Actionable cold |
|---|---|
| "Promises can be tricky." | "`Promise.all()` on the ingest pipeline times out after 30 items — use `Promise.allSettled()` batched at 10 for this module." |
| "Be careful with async." | "Checkout-flow state always goes through Zustand (`cartStore.ts`) — 3 components share the cart, so local state silently desyncs." |
| "Watch out for env vars." | "`DIRECT_DATABASE_URL` with `?pool=true` breaks `psql` — that param is Prisma-only." |
| "Tests can be flaky." | "e2e flow `04-pr-findings` times out when the seeded repo isn't the only one in the DB — always run via `./scripts/e2e.sh`, never against a shared dev DB." |

## Examples calibrated to this repo

Use these as a reference for the level of specificity expected here, not as
literal entries to copy:

- "The grounding gate in `reviewer-core/src/grounding.ts` drops any finding
  whose cited line doesn't exist in the diff — a finding that references the
  right file but the wrong line number silently disappears, not errors."
- "`repo-intel` degrades instead of throwing: array methods return `[]`,
  object methods return `{ degraded: true }`. A `try/catch` around a
  `repoIntel.*` call is masking a bug, not handling one — check `degraded`
  instead."
- "A DB-backed test that imports `test/helpers/pg.ts` but is named
  `*.test.ts` (not `*.it.test.ts`) silently runs in the unit lane and fails
  with a confusing connection error in CI, not locally."
- "`server/src/vendor/shared` and `client/src/vendor/shared` are two
  independent copies of the same contract — editing one without the other
  compiles fine and breaks at runtime."

## Style

One line per entry, imperative or declarative, present tense. State the
fact/rule first, the reason second. Don't narrate how you found it ("I
noticed that…", "after some debugging…") — that's session color, not the
insight.
