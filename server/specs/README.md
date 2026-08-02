# server/specs/ — API contracts

What routes and services **must** do: request/response shapes, error statuses,
persistence invariants, acceptance criteria.

| Specification | About |
|---|---|
| _(empty)_ | — |

## What belongs here

- A route contract that goes beyond its Zod schema (effect ordering,
  idempotency, what a 202 actually promises).
- DB invariants not visible from the Drizzle schema.
- Acceptance criteria for the modules of later lessons.

Read this before changing any public contract: the Zod schema in
`src/vendor/shared` is the source of **types**, not the source of requirements.
