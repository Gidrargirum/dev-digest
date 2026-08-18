# Agents

Custom subagents for this repo. Each is a Markdown file with YAML frontmatter
in `.claude/agents/`, checked into version control and shared with the team.

A subagent runs in a **clean context**: it sees its own system prompt (the file
body), the task it was handed, and the `CLAUDE.md` hierarchy — not this
conversation's history. Only its final text comes back. So every agent here
declares a deterministic output format, and every input it needs must be in the
prompt it receives.

## The set

| Agent | Model | Tools | Preloaded skills | Does | Does not |
|---|---|---|---|---|---|
| [researcher](researcher.md) | sonnet | `Read, Grep, Glob, Bash, WebFetch, WebSearch, ToolSearch` | — | Answers one factual question with cited evidence — repo research, external research, or both | Write code, plan, decide |
| [planner](planner.md) | opus | `Read, Grep, Glob, Bash, Skill` (+ `permissionMode: plan`) | all 18 | Turns a task into a Development Plan bound to this repo's constraints | Touch files, review, research the web |
| [implementer](implementer.md) | sonnet | `Read, Edit, Write, Bash, Grep, Glob, Skill` | all 18 | Executes an approved plan across packages, runs the existing gates | Design, review, commit, open a PR |
| [ui-test-writer](ui-test-writer.md) | sonnet | `Read, Edit, Write, Bash, Grep, Glob, Skill` | 1 | Writes and runs client (vitest/RTL) and e2e (flow.json) tests | Touch server/reviewer-core tests, fix production code, plan, review |
| [api-test-writer](api-test-writer.md) | sonnet | `Read, Edit, Write, Bash, Grep, Glob, Skill` | 3 | Writes and runs server-unit, server-integration and reviewer-core tests | Touch client/e2e tests, fix production code, plan, review |
| [architecture-reviewer](architecture-reviewer.md) | opus | `Read, Grep, Glob, Bash, Skill` (+ `permissionMode: plan`) | 2 | Reviews Onion/frontend-architecture ring placement and dependency direction; findings only | Write/edit, fix, propose a fix, replace `pr-self-review` |
| [plan-verifier](plan-verifier.md) | opus | `Read, Grep, Glob, Bash` (+ `permissionMode: plan`) | — | Checks a Development Plan's requirement coverage against the actual diff | Write/edit, judge code quality, re-plan, trust a self-report as evidence |
| [doc-writer](doc-writer.md) | sonnet | `Read, Write, Edit, Grep, Glob, Skill` | 1 | Documents already-built functionality, routes it to `docs/`/`specs/`/`<package>/docs/`, adds Mermaid diagrams | Design unbuilt features, write code, review, write to `insights/` |

`planner` and `implementer` preload an **identical** skill set — the full
catalog in [`.claude/skills/`](../skills/README.md). Symmetry is the point: the
plan's skills table and the implementation's skill selection are drawn from the
same loaded knowledge, so neither can cite a rule the other has not seen.

The five newer agents are deliberately **not** symmetric with each other: each
preloads only what it applies on *every* run — full preload of all 18 skills
costs ~29k tokens, and the rest of the catalog stays reachable through the
`Skill` tool regardless; `routing.md` still decides which skills a given
change actually earns.

Read-only agents have no `Write`/`Edit` **by design**, and their bodies forbid
routing around it via `Bash` (`cat > file`). Architecture review is now in
this set (`architecture-reviewer`); security review is still not — it is the
`security` skill, which `routing.md` hangs on every changed source file, and
it stays outside this set. `implementer` still only records concerns, never
verdicts — `architecture-reviewer` is the one that hands down a verdict.

## The two test writers

Two agents, not one, because the lanes split by package *and* by tooling:
`ui-test-writer` works in vitest/jsdom/RTL and declarative e2e `flow.json`;
`api-test-writer` works in Fastify `inject()` and testcontainers Postgres.
Splitting keeps each preload narrow — 1 skill and 3, instead of one agent
preloading all 5.

Staying in sync is not automatic. Six sentences — the "never `docker compose
down -v`" warning, "don't fix production code to pass a test", the response-
language paragraph, the `### Blocked — needs production change` heading, the
`insights/INSIGHTS.md` prohibition, and the `gh pr create`/`git push`/commit/
rebase prohibition — are required to appear **verbatim, character for
character** in both bodies. This is checked by a grep gate (see
`pr-self-review`'s *Verification gates*), not by convention alone.

## Artifacts

| Agent | Input | Output |
|---|---|---|
| `researcher` | A concrete question with a scope; otherwise it interviews you | Report: Conclusions · Evidence · References · Could not determine |
| `planner` | A concrete task; otherwise it interviews you | `# Development Plan` — Scope · Constraints · Skills the implementer must invoke · Steps · Verification gates · Risks · Open questions |
| `implementer` | A Development Plan (or equally explicit steps); refuses without one | `# Implementation Report` — Steps completed · Skills invoked · Gates · Deviations · Not done · Concerns for review |
| `ui-test-writer` | A concrete component/page/flow and its expected behavior | `## Test Report` — Tests written · Commands run · Red → green · Blocked — needs production change · Not covered |
| `api-test-writer` | A concrete route/service/repository/adapter/reviewer-core target and its expected behavior | `## Test Report` — same sections as `ui-test-writer` |
| `architecture-reviewer` | A diff range, branch, or file set | `## Architecture Review` — Verdict · Mechanical gates · Findings · Ring placement notes · Not reviewed |
| `plan-verifier` | A plan's text plus a way to see the diff; an Implementation Report is optional and not evidence | `## Plan Verification` — Verdict · Requirement coverage · Gaps · Out of scope changes · Gates re-run · Could not verify |
| `doc-writer` | A subject and an audience — usually a finished plan or Implementation Report | `## Documentation Report` — Written · Index updates · Proposed AGENTS.md pointer · Diagrams · Open questions |

The plan travels **as text through the main session**: `planner` returns it,
you hand it to `implementer`. It is not persisted to a file, so the plan must
be self-contained — `implementer` cannot see where it came from.

## What these agents are built on

**Repo sources** — the rules these agents enforce are not invented here,
they are pointers:

- [`.claude/skills/pr-self-review/routing.md`](../skills/pr-self-review/routing.md)
  — the shared bridge. `planner` routes the paths it *expects* to change and
  emits a skills table; `implementer` re-routes the paths it *actually*
  changed (`git status --porcelain`) and reports where the two diverge. The
  plan is a forecast, the diff is the fact, and one matrix judges both — which
  is what stops a skill from being skipped because nobody predicted the file.
  Compliance is still self-reported here; the mechanical check is
  `pr-self-review` re-routing the real diff at PR time, enforced by the
  `PreToolUse` hook on `gh pr create`.
- `<package>/AGENTS.md` — per-package non-default conventions (Onion rings,
  container ports, component folder layout, `*.it.test.ts` naming).
- Root [`CLAUDE.md`](../../CLAUDE.md) — repo-wide rules, the do-not-touch list
  (`docker compose down -v`, `vendor/**`, `clones/**`), the session protocol.
- `specs/` — contracts and invariants that must keep holding.
- `<package>/insights/INSIGHTS.md` — `planner` reads *What Doesn't Work* /
  *Recurring Errors* so a plan does not repeat a measured failure;
  `implementer` is forbidden to write there (that is `engineering-insights`,
  at end of session).
- [`TESTING.md`](../../TESTING.md) — which lane a new test belongs to.
- [`researcher.md`](researcher.md) — the house style both bodies follow: Role →
  interview mode → response language → workflow → output template → discipline.
- [`.claude/skills/pr-self-review/severity.md`](../skills/pr-self-review/severity.md)
  — the CRITICAL/HIGH/MEDIUM scale and the finding schema, reused as-is by
  `architecture-reviewer` and `plan-verifier` instead of inventing a second one.
- [`.claude/skills/pr-self-review/blocking-rules.md`](../skills/pr-self-review/blocking-rules.md)
  — B10 "repo wiring broken", now carrying a bullet for an agent whose
  `skills:` names a skill absent from `.claude/skills/`.
- [`docs/README.md`](../../docs/README.md), [`specs/README.md`](../../specs/README.md),
  [`insights/README.md`](../../insights/README.md) — the document-type routing
  `doc-writer` follows to decide where a write-up belongs.
- `.dependency-cruiser.cjs` and its ratchet baseline — the mechanical
  architecture gate `architecture-reviewer` runs and refuses to widen.
- `.claude/agents/**` now has its own row in
  [`routing.md`](../skills/pr-self-review/routing.md) and lands in the
  `config` slice — a change to any agent file goes through the same
  pre-PR routing as source code, even though no skill fires on it.

**External sources** — practices these two follow, from Anthropic's docs:

- [Subagents](https://code.claude.com/docs/en/sub-agents) — only `name` and
  `description` are required; `description` drives automatic delegation, hence
  the long "use when / do NOT use" wording. Omitting `tools` inherits *every*
  tool, so both agents list theirs explicitly; the doc's own example of a good
  restrictive set is read-only `Read, Grep, Glob, Bash`. Context isolation
  (clean context, only the final summary returns) is why the output formats are
  fixed. The planner/implementer split — read-only planner with
  `permissionMode: plan`, write-capable implementer, plan passed as a summary
  through the main conversation — is the documented pattern.
- Same page, *System Prompt Recommendations* — the body layout: role statement →
  numbered workflow → checklist → output format → constraints.
- [Skills](https://code.claude.com/docs/en/skills) — `planner` and
  `implementer` preload the **same full catalog** via `skills:`, so both reason
  from an identical vocabulary and a plan cannot cite a rule the implementer
  has not read. Preloading injects each skill's *full body* at startup (~29k
  tokens for the 18) — the deliberate trade of context budget for symmetry.
  Unlisted skills stay reachable through the `Skill` tool regardless, and
  `routing.md` still decides which ones a given change actually earns.
- [Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices)
  — third-person descriptions, no vague ones, progressive disclosure.
- [Effective context engineering for AI agents](https://www.anthropic.com/engineering/effective-context-engineering-for-ai-agents)
  (2025-09-29) — why specialized agents with clean context windows beat one
  agent holding all state.
- Same *Subagents* page — read-only allowlist `Read, Grep, Glob, Bash`; the
  recommended body structure (role → when to invoke → process → focus areas
  → output format); "a reviewer running in a fresh subagent context sees
  only the diff and the criteria you give it… Report gaps, not style
  preferences"; the warning against over-reporting ("A reviewer prompted to
  find gaps will usually report some, even when the work is sound"); "have
  Claude show evidence rather than asserting success"; a subagent's summary
  return is short (~1-2k tokens), hence the fixed, short output formats;
  "Design focused subagents: each subagent should excel at one specific
  task" — the argument for two separate test-writer agents rather than one;
  "Give Claude a check it can run: tests, a build… iterates until the check
  passes" — why the test writers get `Bash`; and the direct model for
  `plan-verifier`: "Use a subagent to review the diff against PLAN.md.
  Check that every requirement is implemented, the listed edge cases have
  tests, and nothing outside the task's scope changed. Report gaps, not
  style preferences."
- Industry practice, **not** an Anthropic position: Diátaxis (the four
  documentation types; "don't mix types on one page") underlies
  `doc-writer`; the Requirements Traceability Matrix and the
  verification-vs-validation distinction underlie `plan-verifier`; fitness
  functions (dependency-cruiser is exactly one), ADR/MADR, and C4 give
  context to `architecture-reviewer`; community TDD-agent practice ("don't
  move to green until the failure is confirmed", "fix the implementation,
  not the test", never mock the object under test) and the Airwallex case
  study of specialized test agents plus a separate Test Debugging Agent
  inform the two test writers — flagged here as **community practice, not
  an Anthropic position**. No official Anthropic mechanism for flaky tests
  was found, so this set has none either.
- Not backed by any external source — this repo's own design decisions: a
  formal severity scale specifically for architecture review (reusing
  `severity.md`); the `implemented`/`partial`/`missing`/`diverged`/
  `out-of-scope` verdict states; **the "findings only, no fix" rule for
  `architecture-reviewer` is a deliberate departure from Anthropic's own
  `security-reviewer` example, which recommends proposing a concrete fix —
  the `fix` field exists in `severity.md`'s schema but this agent
  deliberately does not use it** (see its `# No fixes — findings only`
  section); terms like arc42, "docs as code", "single source of truth" are
  not used here as formal frameworks.

## Adding an agent

Match the house style above. Give it a `description` specific enough to route
on and a tool set narrow enough to make the wrong action impossible, name its
output format explicitly, and add a row to **both** tables here. Keep
`skills:` minimal — preload only what the agent applies on every run — and
remember that `.claude/agents/**` now routes into the `config` slice.
