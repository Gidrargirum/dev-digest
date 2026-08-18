# specs/ — contracts and requirements (cross-package)

What the system **must** do: API contracts, data formats, acceptance criteria
for features touching more than one package. Normative voice — "must",
"may not" — not "currently works like this".

| Specification | About |
|---|---|
| [findings-severity-breakdown.md](./findings-severity-breakdown.md) | FINDINGS counters + hover popover on the PR list and the Agent runs timeline |
| [conventions-extractor.md](./conventions-extractor.md) | Extracting house conventions from a repo and merging the accepted ones into a skill |
| [pr-intent-layer.md](./pr-intent-layer.md) | Deriving a PR's intent/scope before review, caching it, and surfacing it in the prompt and the Overview tab |

## What belongs here

- Contracts between packages (`@devdigest/shared`, REST/SSE, the `RunTrace` shape).
- Acceptance criteria for lesson features L01–L08.
- E2E flow specifications (the `e2e/` package has no documentation `specs/` —
  its `e2e/specs/` holds executable `*.flow.json`).

Descriptions of how something works **today** belong in `docs/`, not here.
