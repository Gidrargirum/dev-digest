# Stack rules — where each tool is allowed to exist

Onion is a direction, not a folder layout. What actually breaks it in this repo is
a *library type* escaping its ring. One section per tool.

---

## Fastify — stops at `routes.ts`

`FastifyInstance`, `FastifyRequest`, `FastifyReply`, `FastifyPluginAsync` may
appear in `routes.ts`, `app.ts` and `platform/` only.

```ts
// ✅ routes.ts translates HTTP → use case → HTTP
app.post('/reviews/:id/run', { schema: { params: IdParams, body: RunRequest } },
  async (req) => svc.run(req.params.id, req.body));

// ❌ the framework has leaked into the application ring
async run(req: FastifyRequest, reply: FastifyReply) { ... }
```

Rules:

- **Validate with the route schema** (`schema.body` / `schema.params`), not
  `.parse()` in the handler. The service receives an already-valid DTO and can
  assume it.
- A service **returns data or throws**; it never sets a status code. Map errors
  centrally — `AppError`/`NotFoundError` from `platform/errors.ts` carry the status.
- No business branching in a handler. If a route has an `if` about domain state,
  that `if` belongs in the service.
- Enforced by `fastify-stays-at-the-edge` in `.dependency-cruiser.cjs`.

---

## Drizzle — stops at `repository.ts`

`src/db/schema` and `sql`-builders are importable from repositories, migrations
and seeds. Nowhere else.

```ts
// ✅ repository returns a domain type
async findRun(id: string): Promise<RunSummary | null> {
  const [row] = await this.db.select().from(t.runs).where(eq(t.runs.id, id));
  return row ? toRunSummary(row) : null;
}

// ❌ a table row escaping into the application ring
async findRun(id: string): Promise<RunRow> { ... }
```

Rules:

- **No business logic in a repository.** No validation, no policy, no
  "if the run is stale then…". A repository translates storage ↔ domain and stops.
- **No query building in a service.** If a service needs a different filter, add a
  named repository method — do not pass a `where` clause down.
- **Transactions belong to the service**, expressed as one repository call that
  takes a callback, so `db.transaction` still never appears in the service file.
- Row types live in `src/db/rows.ts` and must not appear in a service signature.
- Enforced by `service-not-in-db` and `repository-owns-persistence`.

The current baseline contains 8 `repository-owns-persistence` violations — routes
and helpers reaching into `db/schema` directly. Those are the known debt; do not
add a ninth.

---

## Zod / `@devdigest/shared` — the innermost ring

`vendor/shared/` holds two different things, both innermost:

- `contracts/*.ts` — Zod schemas: the shapes the system agrees on.
- `adapters.ts` — **port interfaces**: what the core needs from the world.

Rules:

- A contract schema describes the **domain shape**, not a transport envelope.
  Pagination wrappers and HTTP framing stay in `routes.ts`.
- `vendor/shared/` imports nothing from `modules/`, `adapters/`, `db/`, `platform/`.
  Enforced by `contracts-depend-on-nothing`.
- One Zod schema serves validation *and* serialization via
  `fastify-type-provider-zod`. Do not maintain a parallel response type.
- **Two vendored copies exist** (`server/src/vendor/shared`,
  `client/src/vendor/shared`) and they have already diverged. Editing one without
  the other silently breaks types. Change both, deliberately, in the same commit.

---

## The DI container — composition root, entry ring

`platform/container.ts` is the only file allowed to name concrete adapter classes.

Rules:

- Adapters are constructed **lazily** and resolved through `SecretsProvider`.
  Secrets are never read from `AppConfig` or the DB.
- Every port added to the container gets a matching field in `ContainerOverrides`,
  or it becomes untestable.
- **Do not inject `Container` into services** (SKILL.md rule 4). It is entry-ring;
  a service depending on it points its dependency outward and drags the whole app
  into every unit test.
- `container.ts` importing services is fine — it is the outermost ring. A service
  importing `container.ts` is a cycle, and dependency-cruiser reports it as one.
  The 4 current `no-circular` violations are exactly this shape.

---

## `reviewer-core` — the domain, consumed as source

- Consumed through a tsconfig path alias, **as source**, with no build step. A
  change here hits `server/` immediately.
- `build` is `tsc --noEmit`; `dist/` will never appear.
- No import may perform I/O. Need data? Add a field to `ReviewInput`.
- Optional prompt slots that are not passed are not rendered — feature off means
  the prompt is byte-identical to before the feature. This is a contract.
- Grounding is mandatory and always last: `assemble → LLM → reduce → ground`.
- `INJECTION_GUARD` is never weakened and never made conditional.

---

## Testing follows the rings

| Ring | Test style | Needs Docker |
|---|---|---|
| domain (`reviewer-core`) | pure units, stubbed provider, no keys | no |
| application (`service.ts`) | units with `ContainerOverrides` mocks | no |
| infrastructure (`repository.ts`) | integration, `*.it.test.ts`, testcontainers | yes |
| entry (`routes.ts`) | route tests through the app instance | depends |

An integration test (anything importing `test/helpers/pg.ts`) **must** be named
`*.it.test.ts` or it silently runs in the unit lane.

A service test that needs Postgres is a design smell, not a testing problem: the
service is reaching through its ring.
