# docs/ — how it works (cross-package)

Explanatory guides for mechanisms that span package boundaries. One file per
mechanism. Not rules (those live in `AGENTS.md`) and not requirements (those
live in `specs/`).

| Document | About |
|---|---|
| [agent-prompts/](./agent-prompts/README.md) | How an agent's `system_prompt` becomes the messages a model sees; the canonical text of the three built-in reviewers |
| [retros/ledger.md](./retros/ledger.md) | Append-only trend log of `workflow-retro` runs — tokens, cache reads, wall-clock per pipeline run |

## What belongs here

Explanations of how something works, pointing at real files. Anything specific
to a single package belongs in `<package>/docs/`, not here.
