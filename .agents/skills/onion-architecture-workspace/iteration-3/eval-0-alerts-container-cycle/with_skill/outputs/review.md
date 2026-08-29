# Architecture review — `alerts` module (Onion ring boundaries)

Scope: ring placement and dependency direction only. Typecheck passed; `pnpm arch:check` not yet run.

## Verdict: CHANGES REQUIRED

Two critical boundary violations (one of them a new dependency cycle that will fail `arch:check`), one major policy leak into the persistence ring, one minor wiring gap.

---

## C1 — CRITICAL: `AlertsService` takes `Container`; creates a service ↔ container cycle

**Where:** `modules/alerts/service.ts:2` (`import type { Container } from '../../platform/container.js'`), `:9` (`private readonly app: Container`), `:20` (`this.app.alertSink()`); paired with `container-excerpt.ts:20` (`new AlertsService(this, new AlertsRepository(this.db))`).

**Rule:** SKILL.md rule 4 — "a service takes ports, not the `Container`". `platform/container.ts` is the entry ring; an application-ring service importing it points its dependency outward. Anti-patterns #2. Decision-tree import table: `service.ts → container.ts` is illegal.

Because the container also constructs the service, `service.ts → platform/container.ts → service.ts` is a genuine circular dependency. The known-violations baseline contains **zero** `no-circular` entries, so this is a NEW violation and `pnpm arch:check` will fail on it (the baseline is a ratchet — SKILL.md "Enforcement").

**Fix (in `modules/alerts/`):**
- Add `modules/alerts/types.ts` with `export interface AlertsDeps { alertSink: AlertSink }` (mirroring `modules/repo-intel/types.ts` → `RepoIntelDeps`), or simply give the constructor `(private readonly repo: AlertsRepository, private readonly sink: AlertSink)`.
- `service.ts`: delete the `Container` import; take `AlertSink` (from its port location — see C2); `deliverDue()` calls `this.sink.deliver(alert)` instead of `this.app.alertSink()`.
- `container-excerpt.ts:20`: `this._alerts ??= new AlertsService(new AlertsRepository(this.db), this.alertSink())`.

---

## C2 — CRITICAL: `AlertSink` port declared in `vendor/shared/adapters.ts`; belongs in `server/src/ports/`

**Where:** `adapters.additions.ts` (appended to `server/src/vendor/shared/adapters.ts`); `container-excerpt.ts:5` imports `AlertSink` from `@devdigest/shared`.

**Rule:** SKILL.md rule 2 — "A port the **client has no use for** (`Tokenizer`, `DepGraph`) goes in `src/ports/` instead… `vendor/shared` is vendored into the browser bundle's type surface." The `server/src/ports/index.ts` header states the same test explicitly. Alert *delivery* (email today; webhook/Slack later) is a pure server-side outbound concern — the Next.js studio never delivers an alert. Adding it to `vendor/shared` also silently obligates the second, already-diverged `client/src/vendor/shared/adapters.ts` copy (anti-patterns #10) for a type the client will never reference.

**Fix:**
- Move the `AlertSink` interface into `server/src/ports/index.ts` (or a new `ports/alerts.ts`). Import `Alert` there from the contracts ring.
- `container-excerpt.ts:5`: import `AlertSink` from `../ports/index.js`, not `@devdigest/shared`.
- Keep the `Alert` / `AlertsPage` **contract** schemas in `vendor/shared/contracts/alerts.ts` — those legitimately cross the HTTP boundary via `list()` — and mirror them into the client copy in the same commit.

---

## M1 — MAJOR: delivery policy (`MAX_DELIVERY_ATTEMPTS`) evaluated inside the repository

**Where:** `repository.ts:6` (`import { MAX_DELIVERY_ATTEMPTS } from './constants.js'`), `:23` (`lt(alerts.attempts, MAX_DELIVERY_ATTEMPTS)` in the `where`).

**Rule:** stack-rules "Drizzle" — "No business logic in a repository. No validation, no policy." Anti-patterns #4. Decision-tree "Business logic that needs the DB" — "the rule lives in the service, the query in the repository." The retry ceiling is a business rule; the repository should not own the threshold. The service already threads `now` and `DELIVERY_BATCH` down — the attempt ceiling is the same kind of parameter.

**Fix:** widen the method to `findDeliverable(now: Date, limit: number, maxAttempts: number)`; keep `MAX_DELIVERY_ATTEMPTS` in `modules/alerts/constants.ts` and read it in `service.ts` (`this.repo.findDeliverable(new Date(), DELIVERY_BATCH, MAX_DELIVERY_ATTEMPTS)`). The `status = 'pending'` and `nextAttemptAt < now` predicates are fine as query filters; only the numeric policy constant moves.

---

## m1 — MINOR: `ContainerOverrides` entries for `alertSink` / `alerts`

**Where:** `container-excerpt.ts:13,19` read `this.overrides.alertSink` and `this.overrides.alerts`, but the current `ContainerOverrides` interface (`container.ts:56–79`) declares neither, and the excerpt does not show it being extended.

**Rule:** stack-rules "DI container" — "Every port added to the container gets a matching field in `ContainerOverrides`, or it becomes untestable." Anti-patterns review checklist.

**Fix:** add `alertSink?: AlertSink;` and `alerts?: AlertsService;` to `ContainerOverrides` in `platform/container.ts`. (If already added and merely omitted from the excerpt, confirm and disregard.)

---

## Not flagged (checked, fine)

- `deliverDue()` as a service method with `JobRunner` only scheduling it — correct per decision-tree "A background job".
- `repository.ts` returns the domain type `Alert` via `toAlert`, no row type in a service signature — correct.
- `Db` and `db/schema/alerts` imported only in `repository.ts` — correct ring.
