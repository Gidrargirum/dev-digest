# Eval — onion-architecture

One fixture: a self-contained mini-repo under `fixtures/`, laid out the way
`server/src/` really is (`adapters/`, `contracts/`, `platform/`, plus a feature
module `widgets/`). It is a single PR that adds a **Widgets** feature — a small
catalogue whose free-text tags are suggested by an LLM on create.

Every file typechecks in spirit; `pnpm arch:check` has **not** been run. The
violations are planted with **no comment hinting at them** — only ordinary doc
comments a developer would actually write.

## The task (identical prompt, run twice)

> Review this PR for Onion architecture / ring-boundary violations. The changed
> files are in `evals/fixtures/`:
> `contracts/widgets.ts`, `adapters/llm/openai-tagger.ts`, `platform/container.ts`
> (excerpt), `platform/errors.ts` (context only), and the feature module
> `widgets/` (`routes.ts`, `service.ts`, `repository.ts`).
> For each problem: name the exact ring rule it breaks and say which file the
> fix goes in. Do not pad the list with speculative issues; if a file is fine,
> leave it alone.

Run it **with the skill** (the agent reads `SKILL.md` + `decision-tree.md` +
`stack-rules.md` + `anti-patterns.md`) and **without** (same prompt, same repo
access, but told not to read anything under `.claude/skills/`). Both configs may
read the real `server/` and `reviewer-core/` for context.

## Grading

Score each review against `expected-findings.json`:

- **findings** — each has an `id`, the `rule` it must be tied to, the `file` the
  fix belongs in, and `must_name` phrases. A finding counts as caught only if the
  review identifies the problem **and** attributes it to the right rule / fix
  location — not merely mentions the symptom.
- **must_not_flag** — code that looks suspicious but is correct per the skill.
  Flagging any of these as a violation is a failure (the skill must not make the
  reviewer invent problems).
- A review may raise **one** clearly-wrong extra finding before it counts against
  precision.

Pass rate = `caught / total_findings`, with a separate `false_positives` count
from `must_not_flag`.

## History

- **iter 1–3** lived as `evals.json` + one dir per scenario. Findings:
  unaided Claude with repo access already catches almost everything; the one
  finding it reliably misses is **business policy encoded in repository SQL**
  (anti-pattern 4). See `../../onion-architecture-workspace/` for the runs.
- **iter 4 (this layout)** consolidates into a single lab-style mini-repo so the
  eval ships cleanly inside the skill and one review pass exercises every ring.
  Validation run (`../../onion-architecture-workspace/iteration-4/`): with-skill
  **9/10**, baseline **6.5/10** (Δ +0.25), 0 false positives either side. Skill-only
  catches: the Container-injection cycle, policy-in-repository, the transport
  envelope in a contract, and attributing the row-type leak to the repository
  ring rather than to `service.get()`.
