# Skills

Reusable AI skills that provide specialized knowledge and workflows. Canonical location is `.claude/skills/` with a symlink at `.cursor/skills/ → ../.claude/skills` for Cursor compatibility. Shared with the team via version control.

## Catalog

| Skill | Scope | Description |
|-------|-------|-------------|
| [fastify-best-practices](fastify-best-practices/SKILL.md) | Backend | Fastify routes, plugins, JSON-schema validation, error handling |
| [drizzle-orm-patterns](drizzle-orm-patterns/SKILL.md) | Backend | Drizzle schema, queries, relations, transactions, migrations |
| [postgresql-table-design](postgresql-table-design/SKILL.md) | Backend | Postgres schema design, data types, indexing, constraints |
| [onion-architecture](onion-architecture/SKILL.md) | Backend | Which ring code belongs in: rings, ports and adapters, DI container, `arch:check` |
| [frontend-architecture](frontend-architecture/SKILL.md) | Frontend | Where code belongs: folder structure, module boundaries, logic/constants placement, naming ([docs](frontend-architecture/README.md)) |
| [next-best-practices](next-best-practices/SKILL.md) | Frontend | Next.js App Router, RSC boundaries, data fetching, optimization |
| [react-best-practices](react-best-practices/SKILL.md) | Frontend | React anti-patterns, state management, hooks rules |
| [react-testing-library](react-testing-library/SKILL.md) | Frontend | General-purpose React Testing Library guide with Vitest |
| [zod](zod/SKILL.md) | Full-stack | Zod schema validation, parsing, error handling, type inference |
| [typescript-expert](typescript-expert/SKILL.md) | Full-stack | Type-level programming, performance, tooling, migrations |
| [security](security/SKILL.md) | Full-stack | OWASP Top 10:2025, auth, injection, uploads, secrets |
| [mermaid-diagram](mermaid-diagram/SKILL.md) | Shared | Mermaid diagrams in markdown (flowcharts, sequence, ERD, …) |
| [engineering-insights](engineering-insights/SKILL.md) | Shared | Captures durable session learnings into the touched module's `insights/INSIGHTS.md` |
| [workflow-retro](workflow-retro/SKILL.md) | Shared | Cost/latency post-mortem on a finished multi-agent pipeline run — tokens, cache reads, tool calls, parallelism, per subagent; appends a trend row to `docs/retros/ledger.md` |
| [pr-self-review](pr-self-review/SKILL.md) | Shared | The pre-PR gate: routes the diff onto these skills, runs the gates, blocks the merge on a critical finding ([docs](pr-self-review/README.md)) |
| [dependency-checker](dependency-checker/SKILL.md) | Shared | Dependency audit: graph + on-disk sizes (`du`) + type/reason classification + a prioritized cut/replace/dedupe action list |
| [api-contract-breaking-change](api-contract-breaking-change/SKILL.md) | Product (DevDigest agent) | Route path/method, required params, request shape, status codes/enums — public API breaking changes |
| [api-contract-response-schema](api-contract-response-schema/SKILL.md) | Product (DevDigest agent) | Response body shape — field removal/rename, type changes, nullability, pagination/error envelopes |
| [api-contract-semver-discipline](api-contract-semver-discipline/SKILL.md) | Product (DevDigest agent) | Whether a breaking change carries the version bump semver requires |
| [api-contract-deprecation-policy](api-contract-deprecation-policy/SKILL.md) | Product (DevDigest agent) | Whether a removed/changed public element went through a proper deprecation cycle first |

`pr-self-review` consumes every other row: it decides which of them a given diff
has earned. A new skill needs a rule in
[pr-self-review/routing.md](pr-self-review/routing.md), or it will never run on
a PR — the skill's own preflight reports it if you forget. The four
`api-contract-*` rows are the exception: they are not repo-diff-review skills.
They're portable rubric drafts whose body is meant to be copy-pasted into
DevDigest's own Skills Lab → Add Skill form and attached to a DevDigest agent
through DevDigest's UI, so they intentionally have no `pr-self-review` routing
rule.

## What Are Skills?

Skills are modular packages that extend the AI agent with specialized knowledge and workflows. Unlike rules (always applied) or agents (invoked for specific tasks), skills are loaded on-demand when the agent determines they're relevant.

### Skills vs Rules vs Commands vs Agents

| Type | Scope | Loaded | Purpose |
|------|-------|--------|---------|
| **Rules** (`.mdc`) | Project conventions | Always or by file pattern | Persistent guardrails |
| **Commands** (`.md`) | User actions | On `/command` invocation | Slash commands |
| **Skills** (`.md`) | Domain knowledge | On-demand by agent | Specialized knowledge |
| **Agents** (`.md`) | Workflows | Via Task tool | Subagent orchestration |

## Creating New Skills

Each skill has:

- `SKILL.md` — Main skill file with rules and conventions (required)
- `examples.md` — Code examples showing good/bad patterns (recommended)
- `references.md` — Sources and rationale (optional)
