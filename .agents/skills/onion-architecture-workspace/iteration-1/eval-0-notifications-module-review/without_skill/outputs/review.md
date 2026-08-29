# Architecture review — `notifications` module

Layering model in play: HTTP route → service (application) → repository (infrastructure),
plus adapters/ports for external systems, wired by the DI container as the single
composition root. Dependencies must point inward; outer-ring concerns (Fastify,
Drizzle, GitHub client, DB rows) must not leak inward or skip a layer.

## Critical

### 1. Service performs its own persistence instead of going through the repository
`service.ts` imports the `db` singleton (`../../db/client.js`), the Drizzle table
`notifications` (`../../db/schema/notifications.js`), and Drizzle operators
(`and, desc, eq`), and runs `db.select()...`, `db.insert()...` directly in
`list()` and `notifyReviewFinished()`.

- **Rule broken:** the application ring must not depend on infrastructure. Data
  access is the repository's job; the service should depend only on a repository
  port. Drizzle query builders and schema objects are infrastructure detail and
  must not appear in a service.
- **Also note:** a `NotificationsRepository` already exists with `findById`,
  `listRecent`, `markRead` — the service ignores it, so the module now has two
  parallel, uncoordinated data-access paths to the same table.
- **Fix:** inject a `NotificationsRepository` (or its interface) into the service.
  Move the `list` query into a repository method (`listRecent` already covers it,
  or add `list(unreadOnly, limit)`); move the insert into
  `repo.create(...)`. The service keeps only orchestration + DTO mapping.

### 2. Route calls the repository directly and holds domain logic
In `routes.ts`, `POST /notifications/:id/read` constructs a
`NotificationsRepository` and, in the handler, does `repo.findById`, the
`row.readAt === null` check, the conditional `repo.markRead`, and the 404
decision.

- **Rule broken:** the HTTP layer must not depend on or call the repository, and
  business rules (idempotent mark-as-read, "not found" semantics) belong in the
  application layer, not the transport layer.
- **Fix:** add `NotificationsService.markRead(id: string): Promise<void>` that
  loads via the repository, applies the idempotency check, updates, and throws a
  domain `NotFoundError` when absent. The route just calls
  `await service.markRead(req.params.id)` and maps the error to 404 via the
  shared error handler. Delete the `NotificationsRepository` import from
  `routes.ts`.

### 3. Persistence row type crosses into the HTTP layer
`repository.ts` returns `NotificationRow` (the raw DB row type from
`../../db/rows.js`), and `routes.ts` consumes `row.readAt` directly in the
handler.

- **Rule broken:** DB row shapes are an infrastructure detail; letting them reach
  the route couples the transport layer to the database schema. Crossing the
  boundary should be a domain entity / DTO.
- **Fix:** once the route no longer touches the repository (issue 2), this
  resolves for the HTTP layer. Additionally, have the repository return a domain
  `Notification` (mapping rows internally) rather than `NotificationRow`, so the
  raw row type never leaves infrastructure.

## Major

### 4. Service depends on the whole `Container` (service-locator anti-pattern)
`NotificationsService` takes `constructor(private readonly container: Container)`
and later reaches for `this.container.github()` and (currently) the db.

- **Rule broken:** the composition root should inject a service's explicit
  collaborators; taking the container hides real dependencies, lets the service
  reach any subsystem, and makes the class impossible to unit-test without the
  full container.
- **Fix:** inject exactly what it needs — `NotificationsRepository` and a
  `GithubPort` — as constructor params. The container wires them.

### 5. GitHub access is not behind an injected port at the call site
`notifyReviewFinished` does `const gh = this.container.github(); await gh.getViewer()`.

- **Rule broken:** external-system access must be an injected port/adapter, not a
  runtime lookup from the container inside application code.
- **Fix:** inject `github: GithubPort` into the constructor and call
  `this.github.getViewer()`.

### 6. Module wiring happens in the route file, not the composition root
`notificationsRoutes` does `new NotificationsService(container)` and
`new NotificationsRepository(container.db())` — object construction /
dependency assembly inside the HTTP layer, and inconsistently (service gets the
container, repo gets `container.db()`).

- **Rule broken:** the DI container is the single composition root; routes should
  receive already-constructed services, not build the object graph.
- **Fix:** register `NotificationsRepository` and `NotificationsService` in the
  container; have the route read `container.notificationsService()` only.

## Minor

### 7. `eq(notifications.readAt, null as never)` is a cast hack and wrong SQL
`eq(col, null)` generates `= NULL` (never true); the `as never` cast only
silences the type error. Use Drizzle's `isNull(notifications.readAt)`. This lands
in the repository once issue 1 is fixed.

### 8. Dead code: `NotificationsRepository.listRecent` is unused
It exists but nothing calls it (the service uses its own query instead). After
issue 1, wire the service through it (or remove it if `list` supersedes it).
