# Onion architecture review — `webhooks` module (server/)

**Scope reviewed:** `routes.ts`, `service.ts`, `repository.ts` of the new
`server/src/modules/webhooks/` module. `helpers.ts` and `constants.ts` are
referenced but were not part of the fixture; assumptions about them are called
out below.

## Verdict

**The layering is sound.** Dependencies point inward in every file, the four
rules hold, and no library type escapes its ring. There is exactly one
debatable point (a `new Date()` clock read in the service) — noted as a minor,
not a ring violation.

---

## Rule-by-rule

### Rule 1 — Direction (dependencies point inward)

| File | Imports | Assessment |
|---|---|---|
| `routes.ts` (entry) | `fastify`, `fastify-type-provider-zod`, `zod`, `@devdigest/shared`, `_shared/schemas`, `platform/container` (type) | All legal for the entry ring. Routes may depend on everything inward. |
| `service.ts` (application) | `@devdigest/shared` (contracts), `platform/errors`, `ports/index`, `./repository`, `./helpers`, `./constants` | All legal. `service → repository` is allowed; `platform/errors` is allowed anywhere; `ports/*` is innermost. |
| `repository.ts` (infrastructure) | `drizzle-orm`, `db/client`, `db/schema/webhooks`, `@devdigest/shared`, `./helpers` | All legal for the infrastructure ring. |

- `routes.ts` does **not** import `repository.ts` — it goes through
  `container.webhooks()`. Correct.
- `service.ts` does **not** import `db/*`, `adapters/*`, or `fastify`. Correct.
- `repository.ts` does **not** import the service or `reviewer-core`. Correct.
- No cross-module reach-in: the service depends on `EnqueueReviewPort`, not on
  `modules/reviews/*`. The `reviews` module is bound as the implementation one
  ring out, in the container. This is the right way to compose two modules.

### Rule 2 — Inversion (inner ring declares the interface)

- `GitHubClient` is consumed from `@devdigest/shared` as an interface; the
  service never names `OctokitGitHubClient`. Correct.
- `EnqueueReviewPort` is placed in `server/src/ports/index.ts`, not in
  `vendor/shared/adapters.ts`. This matches the skill's guidance: a port the
  browser bundle has no use for (like `Tokenizer` / `DepGraph`) belongs in
  `src/ports/`. The client has no notion of a review queue, so this placement
  is correct.
- The port names read in domain vocabulary (`enqueue(detail)`,
  `getPullRequest(repo, number)`) — no vendor terms leak through. Not wrappers.

### Rule 3 — Purity (domain performs no I/O)

Not applicable in the direction that matters: nothing here is in
`reviewer-core/`. The domain ring is untouched. The service correctly performs
I/O **only** through injected ports (`repo`, `github`, `reviews`).

### Rule 4 — One composition root

- `WebhooksService` constructor takes `(repo, github, reviews, secret)` — three
  inner-ring interfaces plus a primitive. It does **not** accept `Container`.
  Correct, and better than the `repos` / `agents` / `reviews` modules that still
  take `Container`.
- `routes.ts` receives `Container` and calls `container.webhooks()`. This is the
  same pattern as the other route factories; because the service is assembled by
  the container (or in the factory) and not injected back into itself, no cycle
  is produced. Acceptable.
- Follow-through required outside these three files (not violations, but the
  module is not wired without them):
  - `container.webhooks()` must be added to `platform/container.ts`, the only
    place `new WebhooksService(...)` / the concrete `GitHubClient` adapter and
    the `EnqueueReviewPort` implementation may be named.
  - A `webhooks` entry (or a reused `github` / `enqueueReview` override) must be
    added to `ContainerOverrides` so route/service tests can substitute it.
  - `secret` must be resolved through `SecretsProvider`, not read from
    `AppConfig` or the DB (repo secrets convention).

---

## Stack-rule checks

- **Fastify stops at `routes.ts`.** `FastifyInstance` / type provider appear
  only in `routes.ts`. The service signature is a plain `IncomingEvent` DTO, not
  `FastifyRequest`. Correct.
- **Validation via route schema.** `schema.headers` / `schema.body` do the
  validation; there is no `.parse()` in the handler. The service assumes a valid
  DTO. Correct.
- **No business branching in the handler.** The handler maps HTTP → use case →
  status code. All branching (`SUPPORTED_EVENTS`, `payload.action`) is in the
  service. Correct.
- **Service returns data or throws.** `handleEvent` returns `void`, `getDelivery`
  returns `WebhookDelivery` or throws `NotFoundError`; `AppError('…', 401)` from
  `platform/errors` carries the status. The route never sets an error status
  itself. Correct.
- **Drizzle stops at `repository.ts`.** `db/schema`, `eq`, `db.insert/select`
  appear only in the repository. Correct.
- **No Drizzle row in an application signature.** `findDelivery` returns
  `WebhookDelivery | null` via `toWebhookDelivery(row)`; `recordDelivery` takes a
  structural `{ id, event, receivedAt }` object. No `*Row` type crosses into the
  service. Correct.
- **No business logic in the repository.** `recordDelivery` /
  `findDelivery` translate storage ↔ domain and stop. `onConflictDoNothing()` is
  a persistence detail, correctly kept here rather than an "already seen this
  delivery?" check in the service. Correct.
- **No query building in the service.** The service calls named repository
  methods; no `where` clause is passed down. Correct.

---

## Minor / debatable (not ring violations)

1. **`new Date()` in the service (`handleEvent`).** The decision tree lists
   "clock" among the things that "touch the outside world". `receivedAt` is a
   storage timestamp with no bearing on a business decision, so the low-friction
   fix is to let the **repository** stamp it (or a `webhookDeliveries.receivedAt`
   column `DEFAULT now()`), dropping `receivedAt` from the `recordDelivery`
   input. Only reach for an injected `Clock` port if a test needs to assert the
   exact value. This does not break any of the four rules and does not block.

2. **Header casts in `routes.ts`** (`req.headers['x-github-event'] as string`).
   `GithubEventHeaders` already validates these, so the casts are a
   type-provider ergonomics issue, not an architecture one. Harmless.

3. **Unverified assumptions about `helpers.ts` / `constants.ts`.** For the
   verdict to hold, `verifySignature` and `parseEvent` must be pure
   (crypto/`JSON.parse` only, no I/O) and `toWebhookDelivery` a pure row→domain
   mapper. A module-local `helpers.ts` shared between the service and the
   repository is allowed by the decision tree ("used by one module →
   `modules/<name>/helpers.ts`"). If `parseEvent` or `verifySignature` grows any
   filesystem/network/env access, it must move behind a port.

4. **Contract + schema follow-through (not in these files).** `WebhookDelivery`
   must be added to **both** vendored `shared` copies
   (`server/src/vendor/shared`, `client/src/vendor/shared`) in the same commit,
   and `db/schema/webhooks.ts` needs a migration (`pnpm db:migrate`).

---

## Quick review pass

- [x] No new file imports `fastify` outside `routes.ts`
- [x] No `db/schema` import outside the repository
- [x] Service takes ports, not `Container`
- [x] New port (`EnqueueReviewPort`) placed correctly (`src/ports/`, not vendor/shared)
- [x] Repository methods return domain types
- [x] No cross-module reach-in
- [ ] `ContainerOverrides` entry + `SecretsProvider` wiring — pending, lands in `container.ts`
- [ ] Contract change touches both vendored `shared` copies — pending
