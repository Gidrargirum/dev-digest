# Onion review — `alerts` module

Scope: Onion ring boundaries and dependency direction only.

## Finding 1 — `AlertsService` depends on the `Container` (application ring → entry ring)

**Files:** `service.ts:2` (`import type { Container } from '../../platform/container.js'`), `service.ts:9` (`private readonly app: Container`), `service.ts:20` (`const sink = this.app.alertSink()`); mirrored in `container-excerpt.ts:21` (`new AlertsService(this, new AlertsRepository(this.db))`).

**Rule broken:** Dependencies point inward only. `platform/container.ts` is the composition root (entry ring); it imports every module's service. An application-ring service that imports and holds the container inverts that arrow and creates a construction cycle (the container builds the service while the service references the container). This is the exact pattern every sibling module documents that it avoids — see `blast/service.ts` ("Constructor takes ports … never the `Container`"), `brief/service.ts:41` ("never the `Container` (AC-9)"), and the container's own comments on `repoIntel`/`intent`/`projectContext` ("Takes ports, not `this`, for … cycle-avoidance"). `arch:check` will flag the `modules → platform` edge.

**Fix:**
- In `modules/alerts/`, declare the dependency as a port. Either depend directly on the `AlertSink` interface, or add a small `AlertsDeps` type (as `blast/types.ts` / `brief/types.ts` do) and take `{ sink: AlertSink }`.
- `service.ts`: remove the `Container` import; constructor becomes `constructor(private readonly sink: AlertSink, private readonly repo: AlertsRepository)` (or `deps` + `repo`). `deliverDue` uses `this.sink.deliver(...)`.
- `container-excerpt.ts:21`: construct with the resolved port — `new AlertsService(this.alertSink(), new AlertsRepository(this.db))` — exactly as `blast` gets `this.repoIntel` passed in.

## Finding 2 — `AlertSink` port added to `vendor/shared/adapters.ts` instead of `server/src/ports/`

**Files:** `adapters.additions.ts` (whole file, appended to `server/src/vendor/shared/adapters.ts`); consumed via `container-excerpt.ts:5` (`import type { AlertSink } from '@devdigest/shared'`).

**Rule broken:** `vendor/shared` is the contracts ring that BOTH client and server share — it is vendored into the client, so every interface there lands in the browser's type surface, and it must be edited as two copies in lockstep (`server/CLAUDE.md` "Do not touch"). `server/src/ports/index.ts` exists precisely for ports the client has no use for, and its header states the rule: "an interface here may not import from `modules/`, `adapters/`, `db/` or `platform/` … The implementations live in `adapters/**`; the container is the only place the two meet." Outbound alert delivery (email / webhook / Slack, per the interface's own doc comment) is a server-only I/O concern; the browser has no notion of it. It belongs with `Tokenizer`, `DepGraph`, `ContextDocsReader` in `server/src/ports/`, not in the shared vendored contract.

**Fix:**
- Move the `AlertSink` interface (and its `import type { Alert }`) into `server/src/ports/index.ts`.
- Do not append it to `vendor/shared/adapters.ts` (and therefore no matching edit to the client's second copy).
- `container-excerpt.ts:5`: import `AlertSink` from `../ports/index.js` instead of `@devdigest/shared`.
- The `Alert` DTO / `AlertsPage` (returned to the client by `AlertsService.list`) legitimately stay in `vendor/shared/contracts/alerts.ts`; only the port interface moves.

## Not flagged

- `AlertsRepository` (infrastructure ring) importing Drizzle, `db/client`, `db/schema/alerts`, and mapping rows to the `Alert` domain type via `helpers` — correct repository boundary, consistent with sibling modules.
- `EmailAlertSink` constructed from `this.config.alertsFromAddress` in the container — an adapter reading non-secret config at the composition root is fine.
- Container constructing `new AlertsRepository(this.db)` inline in the `alerts` getter — matches the `blast`/`brief` pattern.
