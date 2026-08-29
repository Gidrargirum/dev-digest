# Architecture review — `webhooks` module (server/)

**Scope:** Onion ring placement and dependency direction only. Files reviewed:
`routes.ts`, `service.ts`, `repository.ts`.

## Verdict

**The layering is sound.** Dependencies point inward, each ring holds what it
should, and on several points this module is *cleaner* than the modules already in
`server/src/modules` (which reach into `container.db` from routes and inject the
whole `Container` into services). No dependency-direction rule is broken.

Two items should be resolved before merge. Neither is an inward/outward violation;
one is an inversion-checklist gap that will fail typecheck, the other is a
module-ownership question.

## What is correct

| Rule | Evidence |
|---|---|
| **1 — Direction** | `routes.ts` → `service` (never `repository`); `service` → `repository` + ports; `repository` → `db/*`. No inner ring imports an outer one. |
| **2 — Inversion** | `WebhooksService` depends on `GitHubClient` (the port from `vendor/shared`), never a concrete adapter. |
| **3 / stack — Fastify stops at `routes.ts`** | `FastifyInstance` / `ZodTypeProvider` appear only in `routes.ts`. `service.ts` and `repository.ts` are framework-free. Validation is done with the route `schema` (headers/body/params), not `.parse()` in the handler. The `GithubEventHeaders` schema correctly stays in `routes.ts` — HTTP framing, not a domain contract. |
| **stack — Drizzle stops at `repository.ts`** | `drizzle-orm`, `db/client`, `db/schema/webhooks` are imported only by `repository.ts`. |
| **Repository returns domain types** | `findDelivery` returns `WebhookDelivery | null`, mapping the row via `toWebhookDelivery`. No `*Row` type crosses into the service. `recordDelivery` takes a plain input object, `enqueueReview` takes the domain `PrDetail`. |
| **No business logic in the repository** | `onConflictDoNothing()` is a persistence detail; there is no policy or validation in `repository.ts`. |
| **Business rules live in the service** | Signature verification, the `SUPPORTED_EVENTS` filter, and the `opened`/`synchronize` action branch are all in `service.ts` — the decisions, not the queries. |
| **4 — One composition root** | The service constructor lists its needs (`repo`, `github`, `secret`) — all inner-ring — and does **not** take `Container`. `routes.ts` only calls `container.webhooks()`; the container is assumed to assemble the service. The secret arrives as a resolved `string`, consistent with "inputs are resolved values, not identifiers" and with secrets flowing through `SecretsProvider` in the container. |

`verifySignature` / `parseEvent` in `helpers.ts` are pure, module-local
computation — correct placement for module helpers.

## Items to resolve before merge

### A. `github.getPullDetail(...)` is not on the `GitHubClient` port

`service.ts` calls `this.github.getPullDetail(payload.repo, payload.number)`, but
the port in `server/src/vendor/shared/adapters.ts` exposes
`getPullRequest(repo: RepoRef, n: number): Promise<PrDetail>` — there is no
`getPullDetail`. As written this does not typecheck.

Fix — pick one, in this order of preference:
1. **Reuse `getPullRequest`** — it already returns `PrDetail` and is the same
   operation. Rename the call site.
2. If a genuinely different call is needed, **add `getPullDetail` to the port** in
   *both* vendored copies (`server/src/vendor/shared/adapters.ts` and
   `client/src/vendor/shared/adapters.ts`), implement it in the GitHub adapter, and
   add the corresponding `ContainerOverrides` field. Adding a second method that
   duplicates `getPullRequest` would be port bloat — avoid it.

The fix goes in `vendor/shared/adapters.ts` (or just the service call site) and the
adapter + container, not in the module files under review.

### B. `WebhooksRepository.enqueueReview` writes directly into `reviewQueue`

`repository.ts` inserts into `reviewQueue` (a new table the PR adds under
`db/schema/webhooks.ts`). "Enqueue a review" is plausibly a use case owned by the
**reviews** module rather than by `webhooks`. If it is, `webhooks` writing that
table directly couples the two modules at the persistence layer — the
cross-module-reach-in smell (anti-patterns §7), just expressed through a shared
schema file instead of an import.

This is a design judgment, not a hard violation, and it is defensible: a durable
inbound-webhook → review queue is a new async boundary and can legitimately be
owned here. But the ownership should be explicit. Preferred shape if the reviews
module owns the concept:

- introduce a `ReviewQueue` port (`vendor/shared/adapters.ts` or `src/ports/`) with
  `enqueue(detail: PrDetail)`, injected into `WebhooksService` like `github`; or
- have `WebhooksService` call the reviews module's service, wired in the container.

Either keeps `webhooks` from owning another module's table. The fix goes in the
port layer + container, and removes `enqueueReview` from `WebhooksRepository`.

## Nits (non-blocking, not layering)

- `IncomingEvent` is declared in `service.ts` and reconstructed structurally in
  `routes.ts`. Fine as-is; could move to a module DTO if it grows.
- `rawBody` is rebuilt with `JSON.stringify(req.body)` for HMAC verification. This
  is a correctness risk (re-serialized bytes won't match GitHub's payload), not an
  architecture issue — flagging only so it isn't lost. Capture the raw body at the
  Fastify layer instead.
