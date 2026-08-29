# Architecture review — `notifications` module

Reviewed against the Onion ring rules (`server/` rings: contracts → domain →
application → infrastructure → entry; dependencies point inward only).

Verdict: **not mergeable**. The application ring (`service.ts`) does its own
Drizzle I/O and depends on the composition root, and the entry ring
(`routes.ts`) talks to the repository and runs domain logic. Findings below.

---

## 1. `service.ts` imports `db/client` and `db/schema` and builds queries — CRITICAL

```ts
import { db } from '../../db/client.js';
import { notifications } from '../../db/schema/notifications.js';
...
const rows = await db.select().from(notifications).where(...).orderBy(...).limit(PAGE_SIZE);
...
await db.insert(notifications).values({ ... });
```

- **Ring rule broken:** Direction (rule 1) — `service.ts` (application) may not
  import `db/client`, `db/schema`, or any infrastructure concrete. Drizzle stops
  at `repository.ts` (stack-rules: "Drizzle — stops at `repository.ts`", "No
  query building in a service"). Import-legality table: `service.ts → db` is ✗.
- **Fix:** move both the `list` read and the `notifyReviewFinished` insert into
  `NotificationsRepository` as named methods (`listRecent` already exists;
  add e.g. `insertReviewFinished(...)`). The service calls those methods and
  keeps only the decision logic (the `unreadOnly` choice, the "only notify if…"
  rule if any). `db.transaction`, `select`, `insert` must never appear in the
  service file.

## 2. `Container` injected into `NotificationsService` — CRITICAL

```ts
constructor(private readonly container: Container) {}
...
const gh = this.container.github();
```

- **Ring rule broken:** One composition root (rule 4) / Inversion (rule 2).
  `platform/container.ts` is entry-ring; a service taking `Container` points its
  dependency outward at the outermost ring, hides its real dependencies from the
  signature, and forces every unit test to build the whole app (anti-pattern 2).
- **Fix:** the constructor should name the ports it actually uses —
  `constructor(private readonly repo: NotificationsRepository, private readonly
  github: GitHubClient)`. The container assembles them and passes them in; add a
  `NotificationsRepository`/deps entry to `ContainerOverrides` for test
  substitution. The service must never name `Container`.

## 3. `routes.ts` imports and calls `repository.ts` directly — CRITICAL

```ts
import { NotificationsRepository } from './repository.js';
...
const repo = new NotificationsRepository(container.db());
...
const row = await repo.findById(req.params.id);
if (!row) { reply.code(404); return; }
if (row.readAt === null) { await repo.markRead(req.params.id, new Date()); }
```

- **Ring rule broken:** Direction (rule 1) — "`routes.ts` may not import
  `repository.ts` — it goes through the service." Import-legality table:
  `routes.ts → repository` is ✗.
- **Fix:** the whole `POST /notifications/:id/read` body becomes
  `await service.markRead(req.params.id); reply.code(204);`. Remove the
  repository import and construction from `routes.ts`.

## 4. Domain logic and domain-driven status code in the route handler — HIGH

The `:id/read` handler decides existence (`404`) and the idempotency rule
(`if (row.readAt === null)`) in the entry ring.

- **Ring rule broken:** stack-rules (Fastify) — "No business branching in a
  handler. If a route has an `if` about domain state, that `if` belongs in the
  service"; "A service returns data or throws; it never sets a status code. Map
  errors centrally — `NotFoundError` from `platform/errors.ts`."
- **Fix:** `service.markRead(id)` loads the row via the repo, throws
  `NotFoundError` when absent (central error mapper turns it into 404), and
  applies the "already read" short-circuit itself. The handler only returns 204.

## 5. Repository returns DB row types (`NotificationRow`) — HIGH

```ts
async findById(id: string): Promise<NotificationRow | undefined>
async listRecent(limit: number): Promise<NotificationRow[]>
```

- **Ring rule broken:** stack-rules (Drizzle) — "repository returns a domain
  type"; "Row types live in `src/db/rows.ts` and must not appear in a service
  signature" (anti-pattern 3). A `NotificationRow` flowing out of the repo means
  a column rename ripples into the service, route, and client contract.
- **Fix:** map inside the repository to the domain type
  (`Notification` from `@devdigest/shared`, or an internal domain shape) — move
  `toNotificationDto` from `helpers.ts` into the repository as the row→domain
  mapper. Repository signatures expose domain types only.

## 6. Pagination envelope assembled in the service — MEDIUM

```ts
return { items, nextCursor: items.length === PAGE_SIZE ? items.at(-1)!.id : null };
```

- **Ring rule broken:** stack-rules (Zod/shared) — "A contract schema describes
  the domain shape, not a transport envelope. Pagination wrappers and HTTP
  framing stay in `routes.ts`."
- **Fix:** the service returns the domain list (and whatever the next-page key
  is); `routes.ts` wraps it into the `NotificationsPage` transport shape. If the
  team wants the envelope kept as a shared contract, that is a deliberate
  decision to record, not a default.

## 7. Two divergent data-access paths for the same table — MEDIUM

`list` goes `service → db` directly; `:id/read` goes `routes → repository`. The
injected/constructed `NotificationsRepository` in `service.ts` is never used.

- **Ring rule broken:** consequence of 1 and 3 — the repository boundary is not
  the single persistence seam for the module.
- **Fix:** once 1–3 are applied, every read and write for `notifications` goes
  through `NotificationsRepository`, called only by the service.

---

## Not flagged (checked, fine)

- `repository.ts` importing `db/schema`, `drizzle-orm`, `PostgresJsDatabase` —
  correct for the infrastructure ring.
- `repository.ts` contains no policy/validation — good.
- `routes.ts` validating via `schema.querystring` / `schema.params` rather than
  `.parse()` in the handler — correct.
- Module layout (`routes/service/repository` + `helpers`/`constants`) matches the
  decision-tree "new feature" shape.
