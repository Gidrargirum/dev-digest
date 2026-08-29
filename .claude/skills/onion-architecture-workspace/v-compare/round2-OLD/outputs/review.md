# Onion architecture review — `digests` module

Scope: ring placement and dependency direction for the new `digests` feature
(`schema.ts`, `service.ts`, `repository.ts`). Reviewed against the
`onion-architecture` skill (SKILL.md four rules, decision-tree, stack-rules,
anti-patterns).

---

## Critical

### C1 — Service imports `db/client` and `db/schema` and builds a Drizzle query

**File:** `server/src/modules/digests/service.ts` (lines 2–6, 24–31)

```ts
import { desc, eq } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { digests } from '../../db/schema/digests.js';
...
async list(workspaceId: string, page: number): Promise<DigestsPage> {
  const rows = await db.select().from(digests).where(eq(...)).limit(...).offset(...);
  return { items: rows.map(toDigestDto) };
}
```

Rules broken:

- **SKILL.md rule 1 (Direction):** "`service.ts` may not import `db/schema`,
  `db/client`, or a concrete `adapters/*`." The application ring is importing the
  infrastructure ring.
- **stack-rules — Drizzle stops at `repository.ts`:** "`src/db/schema` … importable
  from repositories, migrations and seeds. Nowhere else." Plus "No query building
  in a service. If a service needs a different filter, add a named repository
  method." Enforced by `service-not-in-db`.
- **anti-patterns #3:** the Drizzle row shape (`rows`) is handled directly in the
  application ring via `rows.map(toDigestDto)`; a column rename now breaks the
  service.

**Fix (in `service.ts`):** delete the `db` / `db/schema` / `drizzle-orm` imports;
add a `listPage(workspaceId, page)` method to `DigestsRepository` that returns
`Digest[]` (already-mapped domain type) and call that. Pagination framing
(`page`/size) can stay in the service; the query and the row→domain mapping move
into the repository.

### C2 — `digests` schema file redefines the `notification_outbox` table owned by the `notifications` module

**File:** `server/src/db/schema/digests.ts` (lines 14–21)

```ts
export const notificationOutbox = pgTable('notification_outbox', { ... });
```

Per the given repo context, the `notifications` module owns outbound
notifications and the `notification_outbox` table. Redefining that `pgTable` here
is:

- **anti-patterns #7 (cross-module reach-in):** the `digests` feature reaches into
  another module's persistence surface. "The two modules can no longer be deleted,
  moved or tested independently; the module boundary becomes decorative."
- a concrete Drizzle hazard: two `pgTable('notification_outbox')` definitions with
  no build step to reconcile them (the same class of silent divergence the skill
  calls out for the vendored `shared` copies).

**Fix (in `schema.ts`):** remove the `notificationOutbox` declaration entirely.
The `digests` schema file should define only the `digests` table.

### C3 — `digests` repository writes to another module's table

**File:** `server/src/modules/digests/repository.ts` (lines 3, 39–43) and its
caller `service.ts` (lines 40–42)

```ts
async queueNotification(kind: string, recipientId: string, payload: unknown) {
  await this.db.insert(notificationOutbox).values({ kind, recipientId, payload });
}
```

Rules broken:

- **anti-patterns #7 (cross-module reach-in)** / **stack-rules
  `repository-owns-persistence`:** a repository owns *its own* module's tables. The
  `digests` repository persisting into `notification_outbox` means outbound-
  notification writes now have two owners.
- Direction is still inward here, but the *module* boundary is violated:
  composition between `digests` and `notifications` must happen one ring out (the
  container), not by one module's repository touching the other's storage.

**Fix:** remove `queueNotification` (and the `notificationOutbox` import) from
`repository.ts`. Have `DigestsService` depend on a port for enqueuing a
notification — either an injected `notifications` service / port passed through
`DigestDeps` (same pattern already used for `recentRuns`), e.g.
`deps.queueDigestReady(workspaceId, digestId)` wired in `platform/container.ts`.

---

## Moderate

### M1 — Cross-module import of `NOTIFICATION_KINDS`

**File:** `server/src/modules/digests/service.ts` (line 6)

```ts
import { NOTIFICATION_KINDS } from '../notifications/constants.js';
```

**anti-patterns #7:** direct import of another module's `constants.ts`. "The shared
part goes to `modules/_shared/`, `vendor/shared/` or `platform/`. Composition
happens in the container, one ring out."

**Fix (in `service.ts`):** once C3 is fixed the notification kind is chosen by the
notifications side and this import disappears. If a shared constant is still
needed, promote it to `modules/_shared/`.

### M2 — Cross-module import of `ReviewRunSummary` type

**File:** `server/src/modules/digests/service.ts` (lines 7, 14, 47)

```ts
import type { ReviewRunSummary } from '../reviews/types.js';
```

The `recentRuns` dependency itself is modelled correctly as an injected port on
`DigestDeps` (good — that is rule 2 done right). But the *type* it traffics in is
reached in from `modules/reviews/types.ts`, re-coupling the two modules
(**anti-patterns #7**, type-level).

**Fix (in `service.ts`):** define the minimal shape the digest actually consumes
(`{ pullTitle: string; findingCount: number }`) locally in
`modules/digests/types.ts`, or promote a shared summary contract to
`modules/_shared/` / `vendor/shared/contracts`. The `reviews` module's internal
`types.ts` must not appear in another module's signatures.

### M3 — Business threshold baked into a repository query

**File:** `server/src/modules/digests/repository.ts` (lines 7, 17–30)

```ts
import { MAX_CONSECUTIVE_FAILURES } from './constants.js';
...
async findDue(now: Date): Promise<Digest[]> {
  ... lt(digests.consecutiveFailures, MAX_CONSECUTIVE_FAILURES) ...
}
```

"Give up on a digest after N consecutive failures" is a business policy.
**stack-rules — Drizzle section:** "No business logic in a repository. No
validation, no policy, no 'if the run is stale then…'." **decision-tree:** the
*decision* (which digests are eligible) belongs in the service, the *fetch* in the
repository — mirrors the `countActiveRuns(id) >= MAX` example.

**Fix:** repository exposes `findEnabledDue(now)` (just `enabled` + `nextRunAt`);
`DigestsService.runDue()` filters out `digest.consecutiveFailures >= MAX_CONSECUTIVE_FAILURES`
so the rule is unit-testable without Postgres. Lower confidence than C1–C3 — if the
team treats this purely as a query predicate it is defensible, but the constant
lives on the policy side today.

---

## Fine, leave alone

- **`DigestDeps` with `clock` and `recentRuns` as injected functions** — correct
  application-ring inversion (rule 2). The service names needs, not concretes, and
  takes ports + a repository rather than `Container` (rule 4 satisfied).
- **`repository.ts` returning `Digest` (`@devdigest/shared`) from `listForWorkspace`
  / `findDue`** — repository maps storage → domain type, exactly as required.
- **`repository.ts` taking `Db` by constructor injection** — fine.
- **`schema.ts` `digests` table definition itself** — correct place, correct ring.

---

## Summary of fixes by file

| File | Change |
|---|---|
| `db/schema/digests.ts` | C2: delete `notificationOutbox`; keep only `digests`. |
| `modules/digests/service.ts` | C1: drop `db`/`db/schema`/`drizzle-orm` imports, call a new repo method. M1: drop `notifications/constants` import. M2: drop `reviews/types` import, use a local/`_shared` shape. |
| `modules/digests/repository.ts` | C1: add `listPage` returning `Digest[]`. C3: delete `queueNotification` + `notificationOutbox` import. M3: move the `MAX_CONSECUTIVE_FAILURES` filter up to the service. |
| `platform/container.ts` (not in diff) | wire a notification-enqueue port into `DigestDeps`. |
