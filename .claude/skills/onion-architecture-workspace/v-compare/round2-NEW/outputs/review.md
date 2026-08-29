# Onion Architecture Review — `digests` feature module

Reviewed against `.claude/skills/onion-architecture/` (SKILL.md, decision-tree.md,
stack-rules.md, anti-patterns.md).

Files under review:

- `fixtures/digests/schema.ts` → `server/src/db/schema/digests.ts`
- `fixtures/digests/service.ts` → `server/src/modules/digests/service.ts`
- `fixtures/digests/repository.ts` → `server/src/modules/digests/repository.ts`

Verdict: **request changes.** Six distinct violations, two of them critical
(Drizzle in the application ring, another module's table defined and written
here).

---

## 1. Drizzle query built inside the service — `service.ts`

```ts
import { db } from '../../db/client.js';
import { digests } from '../../db/schema/digests.js';
...
async list(workspaceId: string, page: number): Promise<DigestsPage> {
  const rows = await db.select().from(digests)
    .where(eq(digests.workspaceId, workspaceId))
    .orderBy(desc(digests.nextRunAt))
    .limit(DIGEST_PAGE_SIZE)
    .offset((page - 1) * DIGEST_PAGE_SIZE);
  return { items: rows.map(toDigestDto) };
}
```

**Rule broken:** stack-rules.md "Drizzle — stops at `repository.ts`":
`src/db/schema` and `src/db/client` are importable from repositories, migrations
and seeds *and nowhere else*. Also SKILL.md rule 1: "`service.ts` may not import
`db/schema`, `db/client`". Enforced by `service-not-in-db`. Compounded by
anti-patterns §3 — raw Drizzle rows (`toDigestDto` maps a table row) crossing
into the application ring. The service also reaches for the module-level `db`
singleton instead of the injected `repo`, so the query is untestable without
Postgres (stack-rules "a service test that needs Postgres is a design smell").

**Fix (in `service.ts` + `repository.ts`):** add a paged method to
`DigestsRepository` (e.g. `listPage(workspaceId, page, size): Promise<Digest[]>`)
and have `list()` call `this.repo`. Drop the `db/client` and `db/schema` imports
from the service entirely. Row→domain mapping stays in the repository.

---

## 2. `notification_outbox` table defined in the digests schema file — `schema.ts`

```ts
export const notificationOutbox = pgTable('notification_outbox', { ... });
```

**Rule broken:** SKILL.md "Module ownership — one module, one aggregate": "A
module owns exactly its own `db/schema` tables. `db/schema/<name>.ts` defines the
tables for `modules/<name>/` and nothing else." anti-patterns §11. The
`notification_outbox` table is owned by the `notifications` module; redefining it
in `db/schema/digests.ts` is a boundary break even though no code is imported
(and it risks a duplicate `pgTable('notification_outbox')` definition colliding
with the real one). Not caught by `arch:check` — needs the human eye.

**Fix (in `schema.ts`):** delete the `notificationOutbox` export. `digests.ts`
keeps only the `digests` table. Digests reaches outbound notifications through
the notifications module's service/port (see §3).

---

## 3. Repository writes another module's table — `repository.ts`

```ts
import { digests, notificationOutbox } from '../../db/schema/digests.js';
...
async queueNotification(kind: string, recipientId: string, payload: unknown) {
  await this.db.insert(notificationOutbox).values({ kind, recipientId, payload });
}
```

**Rule broken:** SKILL.md "A repository touches only its own module's tables… If
`modules/a` needs to write something `modules/b` owns, it goes through `b`'s
service or a port, wired in the container." anti-patterns §11 ("for every
`this.db.insert(...)` in a `modules/<a>/repository.ts`, check the table is
declared in `db/schema/<a>.ts`"). Here `DigestsRepository` inserts into
`notification_outbox`, which the `notifications` module owns.

**Fix (in `repository.ts` + `service.ts` + `platform/container.ts`):** remove
`queueNotification` from `DigestsRepository`. Introduce a `NotificationPort`
(e.g. `enqueue(kind, recipientId, payload)`) owned by the notifications module /
`vendor/shared`, implemented by the notifications service, injected into
`DigestsService` via `DigestDeps` and wired in the container — the same shape as
`container.reviewRepo` for cross-cutting entities. `runDue()` then calls
`this.deps.notifications.enqueue(...)`.

---

## 4. Cross-module value import — `service.ts`

```ts
import { NOTIFICATION_KINDS } from '../notifications/constants.js';
```

**Rule broken:** anti-patterns §7 "Cross-module reach-in" / SKILL.md "No import
from `../<other-module>/`". `modules/digests` importing `modules/notifications`
internals means the two modules can no longer be deleted, moved or tested
independently. Only `vendor/shared/contracts/*`, `src/ports/*` and `../_shared/`
may cross a module boundary.

**Fix (in `service.ts`):** the notification `kind` is an implementation detail of
the notifications side. Pass it from behind the `NotificationPort` from §3 (the
port method already knows which kind it emits), or move the kind constant/enum to
`vendor/shared/contracts/` if it is genuinely shared vocabulary. Digests should
not name `NOTIFICATION_KINDS`.

---

## 5. Cross-module `import type` — `service.ts`

```ts
import type { ReviewRunSummary } from '../reviews/types.js';
```

**Rule broken:** anti-patterns §12 "A cross-module `import type` is still a
cross-module import". `modules/reviews/types.ts` is the reviews module's private
surface; `import type` compiles away and slips past `arch:check`, but it couples
digests to reviews just the same. `ReviewRunSummary` appears in `DigestDeps` and
in three method signatures here.

**Fix (in `service.ts`):** digests needs this only to talk to reviews. The
`recentRuns` port in `DigestDeps` should carry the shape in its own signature,
with the return type defined in `vendor/shared/contracts/` (remember the second
vendored copy) rather than imported from `modules/reviews/`. `formatRuns` then
consumes the shared contract type. Digests imports nothing from `../reviews/`.

---

## 6. Failure-threshold policy embedded in a repository query — `repository.ts`

```ts
async findDue(now: Date): Promise<Digest[]> {
  ...
  lt(digests.consecutiveFailures, MAX_CONSECUTIVE_FAILURES),
  ...
}
```

**Rule broken:** stack-rules.md "No business logic in a repository… no policy";
anti-patterns §4; decision-tree.md "Business logic that needs the DB — the
*decision* → service, the *fetch* → repository." "Stop dispatching a digest after
N consecutive failures" is a business rule; here it is baked into the `WHERE`
clause where the service (and its tests) can't see or exercise it.

**Fix (in `repository.ts` + `service.ts`):** `findDue` returns digests that are
enabled and due; `DigestsService.runDue()` applies the
`consecutiveFailures < MAX_CONSECUTIVE_FAILURES` check (or passes the threshold
in as a parameter). Note also that `saveRun` always resets `consecutiveFailures`
to 0 and there is no path that increments it — the failure-handling use case
looks incomplete, which is easier to spot once the policy is in the service.

---

## What is fine — leave alone

- `schema.ts` `digests` table itself — correct place, correct columns.
- `DigestsService` taking a `DigestDeps` port bag (`clock`, `recentRuns`) plus a
  repository — this is the approved `RepoIntelDeps` pattern (anti-patterns §2);
  the service names the ports it needs, not `Container`. Keep it and extend it
  with the `NotificationPort` from §3.
- `DigestsRepository` constructor taking `Db` and the `toDigest` row→domain
  mapping in `listForWorkspace` / `findDue` — correct repository shape.
- `nextRunAfter` / `formatRuns` cadence logic living in the service — correct
  ring for a business rule.

---

## Fix summary by file

| File | Changes |
|---|---|
| `schema.ts` | Remove `notificationOutbox` (§2). |
| `service.ts` | Drop `db/client` + `db/schema` imports, route `list()` through `repo` (§1); drop `../notifications/constants` import (§4); drop `../reviews/types` import, use a shared contract type via the port (§5); move failure-threshold check here from the repo (§6); call a `NotificationPort` instead of `repo.queueNotification` (§3). |
| `repository.ts` | Remove `queueNotification` + `notificationOutbox` import (§3); add a paged list method for §1; simplify `findDue` to enabled+due only (§6). |
| `platform/container.ts` (not in diff) | Wire `NotificationPort` (notifications service) into `DigestsService` deps (§3). |
| `vendor/shared/contracts/*` (both copies) | Home for the review-run summary shape and, if shared, the notification kind (§4, §5). |
