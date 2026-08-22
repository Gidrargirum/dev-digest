# plans/ — approved but unbuilt

Development Plans for features that have been designed and approved but not yet
implemented. Working artifacts, meant to be handed to an implementation session
and then deleted once the feature ships.

| Plan | Feature |
|---|---|
| [intent-layer.md](./intent-layer.md) | Classify a PR's motivation with a cheap model and feed it into the review prompt |

## Why not docs/ or specs/

- `docs/` — how something **works today**. A plan describes what does not exist yet.
- `specs/` — normative requirements. A plan is procedural: steps, gates, risks.
- `insights/` — dated write-ups of what was learned. Not a design surface.

When a plan ships, its normative half moves to `specs/` and the plan file is
removed. A stale plan is worse than no plan.
