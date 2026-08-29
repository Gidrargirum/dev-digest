# Architecture review — `webhooks` module (`server/`)

Scope: Onion ring placement and dependency direction across `routes.ts`,
`service.ts`, `repository.ts`. Checked against the existing `server/` conventions
(`platform/container.ts` composition root, `modules/*` layering, `db/schema/*`
ownership, `vendor/shared/adapters.ts` ports).

## Verdict

The ring layering is **almost entirely sound**. HTTP → service → repository is
respected, Drizzle stays in the repository, Fastify stays in routes, ports are
consumed as interfaces, and `platform/errors` is used correctly from the service.

There is **one real architecture violation**, and it shows up in three files:
**the `webhooks` module owns and writes the `reviewQueue` — a table that belongs
to the reviews domain, not to webhooks.**

## The violation: `webhooks` reaches across an aggregate boundary into the review queue

**Rule broken:** a module's repository owns exactly one aggregate / table group;
cross-cutting entities are reached through a shared repository or a port wired by
the composition root, not by a second module writing the table directly. The
container states this explicitly for `agents` / `reviews`: *"consuming modules use
`container.reviewRepo` instead of reaching into another module's folder."*

Where it appears:

1. **`repository.ts:3`** — `import { webhookDeliveries, reviewQueue } from
   '../../db/schema/webhooks.js'`. The review queue table is being defined in the
   **webhooks** schema file. Schema ownership is wrong: `reviewQueue` is a reviews
   concept and belongs in `db/schema/reviews.ts` (or a dedicated
   `db/schema/review-queue.ts`).
2. **`repository.ts:22-27`** — `WebhooksRepository.enqueueReview(detail: PrDetail)`
   inserts into `reviewQueue`. The webhooks repository now has write authority
   over another domain's aggregate. `WebhooksRepository` should touch
   `webhookDeliveries` only.
3. **`service.ts:38`** — `await this.repo.enqueueReview(detail)`. The webhooks
   service is orchestrating a reviews-domain state transition through its own
   infrastructure object rather than through a reviews-owned collaborator.

**Where the fix goes:**

- Move the `reviewQueue` table definition into the reviews schema and give
  ownership of enqueue logic to the reviews module — either a method on the
  existing `ReviewRepository` / a reviews service, or a small
  `ReviewEnqueuePort` interface (in `modules/reviews/types.ts` or
  `vendor/shared/adapters.ts` if it needs to be an adapter).
- `WebhooksService` should depend on that port/collaborator, injected via its
  constructor.
- `platform/container.ts` wires it in the `webhooks()` factory —
  `new WebhooksService(new WebhooksRepository(db), reviewEnqueue, github, …)` —
  exactly as `blast` receives `this.repoIntel` and `brief` receives `this.blast`
  today. The webhooks module never imports a reviews schema or reviews
  repository directly.
- Remove `enqueueReview` and the `PrDetail` import from `WebhooksRepository`.

## Everything else checks out

- **`routes.ts`** — depends only on Fastify types, Zod, `@devdigest/shared`
  contracts, and `Container`. Both handlers delegate straight to
  `container.webhooks()`; no DB access, no domain logic, no Drizzle. Correct
  entry-ring placement. (The `webhooks()` factory still needs to be added to the
  container — see wiring notes below.)
- **`service.ts`** — application-ring orchestration only: verify → record →
  parse → fetch → enqueue. Depends on the `GitHubClient` **port interface**
  (`vendor/shared/adapters.ts:143`), not the `OctokitGitHubClient` adapter — this
  is the correct direction. Depends on the concrete `WebhooksRepository` class,
  which matches the established convention (`BlastService` takes
  `new BlastRepository(db)`, etc. — there is no repository interface layer in
  this codebase). Uses `AppError` / `NotFoundError` from `platform/errors`, which
  is explicitly cross-layer. Module-local `helpers.ts` / `constants.ts` are fine.
- **`repository.ts`** — Drizzle (`eq`, `Db`, schema tables) is correctly confined
  to this file. Row → contract mapping via `toWebhookDelivery` keeps raw rows out
  of the returned type. This is textbook infrastructure-ring code — the only
  problem is the extra `reviewQueue` responsibility described above.
- **Dependency direction** — no inward ring imports an outward one. routes→
  service→repository→db, plus ports as interfaces. Clean.

## Non-blocking notes (not ring violations)

- **`service.ts:16-20` constructor injection of a resolved `GitHubClient` and a
  plain `secret: string`.** Every other module takes GitHub as a thunk
  (`github: () => this.github()`) because `container.github()` is `async` and
  resolves a secret lazily; the webhook secret likewise comes from
  `SecretsProvider` (async). Injecting both eagerly forces secret resolution at
  container-construction / boot time. Prefer the thunk pattern
  (`github: () => this.github()`, `secret: () => this.secrets.get('GITHUB_WEBHOOK_SECRET')`)
  to stay consistent with `intent` / `brief`. This is a composition-root wiring
  choice, not a layering break.
- **`routes.ts:32` `rawBody: JSON.stringify(req.body)`.** Re-serializing the
  parsed body will not reproduce GitHub's exact bytes, so
  `verifySignature` will reject valid deliveries. Capture the raw payload with a
  Fastify `preParsing` / content-type parser hook and pass that through. This is
  a correctness bug in the entry ring, worth fixing, but it does not cross a ring
  boundary.
- **`verifySignature` (HMAC in `helpers.ts`)** is pure computation over inputs, so
  keeping it as a module helper called from the service is acceptable; no adapter
  needed.

## Summary of rules broken

| # | Rule | File / line | Fix location |
|---|------|-------------|--------------|
| 1 | One module = one aggregate; don't define another domain's table in your schema file | `db/schema/webhooks.ts` (via `repository.ts:3`) | Move `reviewQueue` to the reviews schema |
| 2 | A repository writes only its own module's tables | `repository.ts:22-27` (`enqueueReview`) | Delete; move enqueue to reviews module |
| 3 | Cross-module collaboration goes through a port wired by the composition root, not a direct repo call | `service.ts:38` | Inject a `ReviewEnqueuePort` via `container.webhooks()` |
