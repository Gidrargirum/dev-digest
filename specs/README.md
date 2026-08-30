# specs/ — contracts and requirements (cross-package)

What the system **must** do: API contracts, data formats, acceptance criteria
for features touching more than one package. Normative voice — "must",
"may not" — not "currently works like this".

| Specification | About |
|---|---|
| [findings-severity-breakdown.md](./findings-severity-breakdown.md) | FINDINGS counters + hover popover on the PR list and the Agent runs timeline |
| [conventions-extractor.md](./conventions-extractor.md) | Extracting house conventions from a repo and merging the accepted ones into a skill |
| [pr-intent-layer.md](./pr-intent-layer.md) | Deriving a PR's intent/scope before review, caching it, and surfacing it in the prompt and the Overview tab |
| [blast-radius.md](./blast-radius.md) | Impact map for a PR's diff — changed symbols, callers, and reachable HTTP endpoints/crons, surfaced via a route, a client tab, and an MCP tool |
| [2026-08-26-project-context-folder.md](./2026-08-26-project-context-folder.md) | Attaching repo `.md` docs to agents/skills by hand, injecting them as untrusted `## Project context`, and showing them in the run trace (read/attach path; partially superseded below) |
| [2026-08-27-project-context-folder-authoring.md](./2026-08-27-project-context-folder-authoring.md) | Authoring the Project Context folder — file tree, create/upload/edit `.md` documents, DB-backed persistence, and the COVERAGE indicator; supersedes the base spec's read-only Non-goals |
| [2026-08-29-eval-pipeline.md](./2026-08-29-eval-pipeline.md) | Eval Pipeline — eval cases seeded from accepted/dismissed findings, a batch replay of an agent over its frozen gold set, code-only recall/precision/citation scoring, the Evals tab, the Eval Dashboard and run comparison; **Amendment A (draft)** adds skill-level evals — `owner_kind='skill'`, two-pass with/without execution against a baseline agent, and the skill's own Evals tab (revokes the base spec's skill Non-goal) |
| [2026-08-28-pr-brief.md](./2026-08-28-pr-brief.md) | PR Brief — one cached LLM call on review-run completion, fusing intent, blast radius and diff stats into what/why/risk_level/risks/review_focus, rendered as three Overview blocks with deep links into the diff; partially supersedes `pr-intent-layer.md`'s `risk_areas` |

## What belongs here

- Contracts between packages (`@devdigest/shared`, REST/SSE, the `RunTrace` shape).
- Acceptance criteria for lesson features L01–L08.
- E2E flow specifications (the `e2e/` package has no documentation `specs/` —
  its `e2e/specs/` holds executable `*.flow.json`).

Descriptions of how something works **today** belong in `docs/`, not here.
