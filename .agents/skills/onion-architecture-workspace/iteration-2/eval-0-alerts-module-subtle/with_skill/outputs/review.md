# Architecture review — `alerts` feature module

Scope: Onion ring boundaries only. `pnpm arch:check` not yet run; findings below
predict what it (and `arch:violations`) will report.

Overall shape is close: `routes → service → repository`, the delivery job body
lives in `service.deliverDue()` (correct — `JobRunner` only schedules), and
`repository.listForWorkspace` returns the domain type `Alert`, not a row type.
Two boundary breaks must be fixed before merge, plus one minor leak.

---

## 1. CRITICAL — `AlertsService` depends on `Container` (composition root)

**Files:** `service.ts:2`, `service.ts:9` (`private readonly app: Container`),
`service.ts:20` (`this.app.alertSink()`); `container-excerpt.ts:21`
(`new AlertsService(this, ...)`).

**Rule broken:**
- SKILL rule 4 ("One composition root") corollary — *"a service takes ports, not
  the `Container`"*. `platform/container.ts` is **entry ring**; an application-ring
  service importing it points its dependency **outward** (SKILL rule 1).
- decision-tree "Import legality" table: `service.ts → platform` is allowed only
  for `errors.ts` / `config.ts`, **not** `container.ts`.
- anti-patterns.md #2 ("`Container` as a constructor parameter"). Because the
  container *also* constructs `AlertsService` (`container-excerpt.ts:21`), this is
  a genuine **cycle** — dependency-cruiser will report a new `no-circular`
  violation, i.e. a 13th entry on top of the baseline of 12. Adding it to the
  baseline is not allowed (SKILL "Enforcement", anti-patterns #8).

**Fix (application ring):** state the real need in the signature. Either take the
port directly, or add `modules/alerts/types.ts` with an `AlertsDeps`/`AlertsPort`
(the `repo-intel` / `blast` / `brief` pattern):

```ts
// service.ts
constructor(
  private readonly repo: AlertsRepository,
  private readonly sink: AlertSink,
) {}
// deliverDue(): use this.sink.deliver(alert), drop this.app.alertSink()
```

```ts
// container.ts
this._alerts ??= new AlertsService(new AlertsRepository(this.db), this.alertSink());
```

Also confirm `ContainerOverrides` gained `alerts?: AlertsService` and
`alertSink?: AlertSink` fields (the excerpt reads `this.overrides.alerts` /
`this.overrides.alertSink`) — every new port in the container needs a matching
override or it is untestable (anti-patterns quick pass).

---

## 2. HIGH — `AlertSink` port placed in `vendor/shared/adapters.ts`

**File:** `adapters.additions.ts` (appended to
`server/src/vendor/shared/adapters.ts`); `container-excerpt.ts:5`
(`import type { AlertSink } from '@devdigest/shared'`).

**Rule broken:** SKILL rule 2 ("Inversion"), lines 84–89 — *"A port the **client
has no use for** (`Tokenizer`, `DepGraph`) goes in `src/ports/` instead. Same
ring, same rules — but `vendor/shared` is vendored into the browser bundle's type
surface."* `server/src/ports/index.ts` spells out this exact test in its own
header comment. `AlertSink` is outbound delivery (email today; webhook / Slack
later) — a purely server-side concern; the browser has no notion of an alert
delivery channel, so it must not land in the client's vendored type surface.

**Fix (contracts ring, server-only):** move the `AlertSink` interface out of
`adapters.additions.ts` and into `server/src/ports/index.ts` (alongside
`Tokenizer`, `DepGraph`, `ContextDocsReader`). Update the imports in
`container.ts` (and repository/service if they reference it) to
`import type { AlertSink } from '../ports/index.js'` — not `@devdigest/shared`.
The adapter `EmailAlertSink` stays in `server/src/adapters/alerts/email-sink.ts`
(correct). Do **not** move the `Alert` *contract* — that one crosses the HTTP
boundary via the list endpoint and correctly belongs in
`vendor/shared/contracts/alerts.ts` (remember the second vendored copy in
`client/src/vendor/shared/contracts/` — anti-patterns #10).

---

## 3. MINOR — retry policy applied inside the repository

**File:** `repository.ts:6` + `repository.ts:23`
(`lt(alerts.attempts, MAX_DELIVERY_ATTEMPTS)`, constant imported from
`./constants.js`).

**Rule broken:** stack-rules.md "Drizzle — stops at `repository.ts`": *"No
business logic in a repository. No validation, no policy…"*; anti-patterns.md #4;
decision-tree "Business logic that needs the DB" — *the decision is the service's,
the fetch is the repository's*. "How many failed attempts before an alert is
abandoned" is a delivery-policy rule, not a storage detail. The `status =
'pending'` and `nextAttemptAt < now` predicates are fine as plain query criteria;
the attempt cap is the one that is policy.

**Fix:** keep `MAX_DELIVERY_ATTEMPTS` in the service and pass it down as a
parameter, so the repository runs the filter it is told to run:

```ts
// service.deliverDue()
const due = await this.repo.findDeliverable(new Date(), DELIVERY_BATCH, MAX_DELIVERY_ATTEMPTS);
// repository
async findDeliverable(now: Date, limit: number, maxAttempts: number): Promise<Alert[]>
```

---

## Not findings (checked, OK)

- `deliverDue()` as a service method — correct; job body belongs in the service.
- `repository` returns `Alert` (domain), maps rows via `toAlert` — no row-type leak.
- `helpers.ts` shared within the one module — fine.
- No Fastify types outside `routes.ts` in the reviewed files.
