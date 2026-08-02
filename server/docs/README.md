# server/docs/ — how the API works

Explanatory guides for server-layer mechanisms. One file per mechanism.

| Document | About |
|---|---|
| _(empty)_ | — |

## Candidates to write

`review-pipeline.md` (route → queue → executor → reviewer-core → persist) ·
`di-container.md` (ports, adapters, swapping in mocks) ·
`repo-intel.md` (indexing, the degrade contract) ·
`jobs-and-sse.md` (JobRunner, RunBus, event buffering) ·
`db-schema.md` (the `src/db/schema/*` domains, `workspace_id` tenancy).

Top-level diagrams already live in [`../README.md`](../README.md) — link to
them, don't restate them here.
