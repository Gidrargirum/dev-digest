# Architecture review — `alerts` feature module (server/)

Scope: Onion ring boundaries and dependency direction only.

## Ring placement of the submitted files

| File | Intended ring |
|---|---|
| `modules/alerts/service.ts` | Application |
| `modules/alerts/repository.ts` | Infrastructure (persistence adapter for the module) |
| `vendor/shared/adapters.ts` addition (`AlertSink`) | Contracts / ports (innermost) |
| `platform/container.ts` additions | Entry / composition root |

---

## Finding 1 — CRITICAL: `AlertsService` depends on the DI `Container` (inward ring imports the composition root; creates an import cycle)

`service.ts`:

```ts
import type { Container } from '../../platform/container.js';

export class AlertsService {
  constructor(
    private readonly app: Container,
    private readonly repo: AlertsRepository,
  ) {}
  ...
  const sink = this.app.alertSink();
```

**Rule violated — the dependency rule / composition-root rule.** The Application
ring must not name anything in the Entry ring. `platform/container.ts` is the
composition root: it is the outermost wiring layer and is allowed to depend on
every module, but nothing may depend back on it. A service that takes
`Container` inverts the arrow (application → entry) and also forms a concrete
import cycle: `container.ts` imports `AlertsService`, and `service.ts` imports
`Container`. `pnpm arch:check` (dependency-cruiser) flags `modules/** ->
platform/**` as a forbidden edge.

This is also inconsistent with every sibling facade. `BriefService`,
`IntentService`, `RepoIntelService`, `ContextService` each take a narrow
**deps/ports object** plus a repository, never `this`. The container comment on
`intent` says it explicitly: "Takes ports, not `this`, for … cycle-avoidance …
(the container constructs it, so accepting `Container` would cycle)."

**Where the fix goes:**

1. `modules/alerts/types.ts` (new): define `AlertsDeps`, e.g.
   `interface AlertsDeps { sink: AlertSink }` (or `sink(): AlertSink` to keep it
   lazy), and an `AlertsPort` the service `implements`.
2. `modules/alerts/service.ts`: constructor becomes
   `constructor(private readonly deps: AlertsDeps, private readonly repo: …)`;
   replace `this.app.alertSink()` with `this.deps.sink` / `this.deps.sink()`.
   Delete the `import … Container` line.
3. `platform/container.ts`: change the registration to
   `new AlertsService({ sink: () => this.alertSink() }, new AlertsRepository(this.db))`.

---

## Finding 2 — MAJOR: `AlertSink` port added to `vendor/shared/adapters.ts` instead of `server/src/ports/`

`adapters.additions.ts` is appended to `server/src/vendor/shared/adapters.ts`,
and `container-excerpt.ts` imports it as `import type { AlertSink } from
'@devdigest/shared'`.

**Rule violated — port-location rule.** `vendor/shared` is the contract module
that is **vendored into the client**; anything added there lands in the
browser's type surface. `server/src/ports/index.ts` states the test directly:
a port belongs in `vendor/shared` only if *both* sides of the system agree on
it; a port that exists "purely so a server module can state what it needs
without naming an implementation," for a concept the client has no notion of,
belongs in `server/src/ports/` (same innermost ring, not vendored). `AlertSink`
is an outbound-delivery concern (email today, webhook/Slack later) consumed only
by `modules/alerts` on the server; the browser has no notion of an alert
delivery channel. It is the same case as `Tokenizer` and `DepGraph`.

Secondary consequence: editing `vendor/shared` obliges a matching edit to the
client's second, already-diverged copy (`client/src/vendor/shared`); putting the
port in `server/src/ports/` avoids touching the vendored contract at all.

Note: the response DTOs the service returns (`Alert`, `AlertsPage`, and the new
`contracts/alerts.ts` the interface refers to) *do* cross the HTTP boundary and
legitimately live in `vendor/shared/contracts`. Only the **port interface** is
misplaced.

**Where the fix goes:**

1. Drop `adapters.additions.ts`. Add `AlertSink` to
   `server/src/ports/index.ts` instead.
2. `platform/container.ts`: import it from `../ports/index.js`, not
   `@devdigest/shared`. Its private field type (`_alertSink?: AlertSink`) and
   `ContainerOverrides.alertSink` reference the same port.
3. The `EmailAlertSink` implementation stays in `server/src/adapters/alerts/`
   (correct — Infrastructure), and is the only place `AlertSink` and its impl
   meet.

---

## Finding 3 — MINOR: service constructor depends on the concrete `AlertsRepository` class

`service.ts` types its second constructor param as the concrete
`AlertsRepository`. The `brief` module (the closest analogue: a cached,
job-driven facade) instead defines a `BriefRepositoryPort` interface in
`types.ts` and depends on that, so the Application ring never names the
Drizzle-backed persistence class. `blast` does take the concrete class, so the
repo is not fully consistent — this is a soft finding, not an `arch:check`
failure (both files are inside the same module ring).

**Where the fix goes (optional, to match `brief`):** declare
`AlertsRepositoryPort` in `modules/alerts/types.ts` and have `AlertsService`
depend on it; `AlertsRepository` `implements AlertsRepositoryPort`.

---

## Not flagged

- `repository.ts` importing `Db`, `drizzle-orm`, and `db/schema/alerts.js` —
  correct for a module persistence adapter.
- `service.ts` / `repository.ts` importing `Alert` / `AlertsPage` from
  `@devdigest/shared` and mapping via local `helpers.ts` — matches sibling
  modules.
- Local `constants.ts` / `helpers.ts` — correctly module-scoped.
