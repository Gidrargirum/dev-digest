# Architecture review — `webhooks` module (server/)

**Scope:** Onion ring placement and dependency direction only, across
`routes.ts`, `service.ts`, `repository.ts`.

## Verdict

**Layering is sound.** All three files sit in the ring they belong to and every
import points inward. None of the server's `dependency-cruiser` rules
(`.dependency-cruiser.cjs`) is broken by these three files. One transitive
concern to verify (`helpers.ts`, not supplied) and two non-layering nits are
listed at the end.

## File-by-file

### `routes.ts` — entry ring ✓

- Imports only entry-appropriate things: Fastify / `ZodTypeProvider` / `zod`,
  the `WebhookDelivery` contract from `@devdigest/shared`, `_shared/schemas`,
  and `platform/container`.
- Handlers call the service (`container.webhooks().handleEvent(...)`,
  `container.webhooks().getDelivery(...)`) — never the repository. Satisfies
  `entry-not-in-repository`.
- No `db/schema` import — satisfies `repository-owns-persistence`.
- HTTP concerns only (status codes, header/body schema); no signature checking,
  event filtering, or enqueue decision here — that logic is correctly in the
  service.

### `service.ts` — application ring ✓

- `GitHubClient` is imported from `@devdigest/shared` and it *is* a port
  interface (`src/vendor/shared/adapters.ts:143`), not a concrete adapter — so
  `service-not-in-adapters` is satisfied. `WebhookDelivery` is a contract type.
- `EnqueueReviewPort` comes from `../../ports/index.ts`, the server-only
  inward-facing port collection — exactly its intended use. The service names
  what it needs (`enqueue(detail)`) without naming an implementation.
- `NotFoundError` / `AppError` from `platform/errors.ts` — explicitly usable
  from any layer; no rule forbids it.
- `verifySignature` / `parseEvent` / `SUPPORTED_EVENTS` from same-module
  `./helpers.ts` and `./constants.ts`.
- Imports the concrete `WebhooksRepository` class from `./repository.js`. This
  matches the established convention for a service and its own repository
  (`modules/intent/service.ts`, `modules/blast/service.ts` both do the same);
  `arch:check` permits it. `modules/brief` goes further and depends on a
  `BriefRepositoryPort` interface instead — a stricter option worth considering
  for test isolation, but the direct import is **not** a rule violation.
- No Drizzle, no adapter, no Fastify import — `service-not-in-db`,
  `service-not-in-adapters`, `fastify-stays-at-the-edge` all satisfied.
- Ring placement of behaviour is right: signature verification, event
  allow-listing, and the "opened / synchronize → fetch PR → enqueue" use case
  all live here, orchestrating ports.

### `repository.ts` — infrastructure ring ✓

- Touches Drizzle (`eq`, `db/client`, `db/schema/webhooks`) — permitted: the
  `repository-owns-persistence` and `service-not-in-db` rules both exclude
  `src/modules/<m>/repository*`.
- Returns the `WebhookDelivery` contract type via `toWebhookDelivery(row)`, not
  raw table rows — the persistence boundary maps out to domain types as it
  should.
- No business logic; just `recordDelivery` (idempotent insert) and
  `findDelivery`.

## To verify — `helpers.ts` (not supplied)

`helpers.ts` is imported by **both** `service.ts` (`verifySignature`,
`parseEvent`) and `repository.ts` (`toWebhookDelivery`, a row → contract
mapper). `dependency-cruiser` runs with `tsPreCompilationDeps: true`, so it
follows transitive imports. If `toWebhookDelivery` in that shared file imports
Drizzle row/schema types (e.g. from `db/schema/webhooks` or a `db/rows.ts`
equivalent), then `service.ts → helpers.ts → db/schema` would pull persistence
types into the application ring and trip `repository-owns-persistence` /
`service-not-in-db` transitively.

**Fix location if so:** move the row-mapper out of the shared `helpers.ts` —
put `toWebhookDelivery` in `repository.ts` itself or a `repository/`-adjacent
mapper file, and keep `helpers.ts` limited to the pure functions the service
needs. If `helpers.ts` has no persistence import, nothing to do.

## Non-layering nits (out of scope, flagged in passing)

- `service.ts:25` — `new AppError('invalid webhook signature', 401)`. The
  `AppError` constructor is `(code, message, statusCode = 400)`
  (`platform/errors.ts`), so `401` lands in the `message` slot and the response
  is a 400. Use `new AppError('invalid_webhook_signature', 'invalid webhook signature', 401)`.
- Container access style: `container.webhooks()` is a method call, whereas the
  existing container exposes facades as lazy getters (`container.brief`,
  `container.intent`). Cosmetic, but worth aligning when the container wiring is
  added.
