# Onion architecture review — Widgets feature

Scope: ring placement and dependency direction only. Findings are ordered by
severity. `platform/errors.ts` is unchanged and fine.

---

## Critical

### C1. Port `WidgetTagger` imports the OpenAI SDK types — `contracts/widgets.ts`

```ts
export interface WidgetTagger {
  suggest(payload: import('openai').OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<string[]>;
}
```

Breaks **Rule 1 (direction)** and **Rule 2 (inversion)**, plus
`contracts-depend-on-nothing`: `vendor/shared/` is the innermost ring and must
import nothing — here it imports a type from the `openai` package. It is also
anti-pattern #5 "a wrapper masquerading as a port": the interface speaks
Octokit/OpenAI vocabulary, so swapping the vendor changes the core and the
inversion buys nothing. The core's actual need is "given a widget name, give me
tag suggestions".

**Fix — `contracts/widgets.ts`:** state the port in domain terms, no SDK import:

```ts
export interface WidgetTagger {
  suggest(name: string): Promise<string[]>;
}
```

The prompt-building (`buildTagPrompt`) and the OpenAI request shape then live
entirely inside the adapter.

### C2. Drizzle in the application ring — `widgets/service.ts`

```ts
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { widgets } from '../../db/schema/widgets.js';
...
const [row] = await db.insert(widgets).values({...}).returning();
...
const rows = await db.select().from(widgets).orderBy(...).limit(PAGE_SIZE).offset(...);
```

Breaks **Rule 1** and the stack rule "**Drizzle stops at `repository.ts`**"
(`service-not-in-db`). `create` and `list` build and run queries directly
against `db/client` and `db/schema`. The service also imports the module's own
repository yet bypasses it for writes and list.

**Fix — `widgets/service.ts` (+ `widgets/repository.ts`):** move the insert and
the paged select into named repository methods (`repo.insert(...)`,
`repo.listPage(page)`); the service keeps only the decision ("no tags supplied →
ask the tagger, cap at MAX_TAGS") and calls the repo. No `drizzle-orm` /
`db/*` import may remain in `service.ts`.

### C3. `Container` injected into the service — `platform/container.ts` + `widgets/service.ts`

```ts
// container.ts
this._widgets ??= new WidgetsService(this);
// service.ts
constructor(private readonly container: Container) { this.repo = new WidgetsRepository(container.db()); }
```

Breaks **Rule 4 (one composition root)** / anti-pattern #2. The application ring
now depends on the entry-ring composition root: the true dependencies are
invisible in the signature, and because `service.ts` also `import`s
`container.ts` while the container constructs the service, this is a **`no-circular`
cycle** — the same shape that produced the four baseline cycles. `routes.ts`
compounds it by also doing `new WidgetsService(container)`.

**Fix — `service.ts` + `container.ts`:** the service constructor takes the ports
it uses — `constructor(private repo: WidgetsRepository, private tagger: WidgetTagger)`.
The container assembles them: `new WidgetsService(new WidgetsRepository(this.db()), this.widgetTagger())`.
Drop the `import type { Container }` from `service.ts`.

### C4. Adapter reads a secret from `process.env` — `adapters/llm/openai.ts` (the new `openai-tagger.ts`)

```ts
constructor() {
  this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
```

Breaks the container/secrets stack rule: "Adapters are constructed lazily and
resolved through `SecretsProvider`. Secrets are never read from `AppConfig` or
the DB" — and never from `process.env` (see `platform/config.ts` note, and the
existing `OpenAIProvider`/`AnthropicProvider` which take `apiKey: string`). The
no-arg constructor also can't be given a key by the composition root.

**Fix — the new adapter file + `container.ts`:** `constructor(apiKey: string)`;
the container resolves the key via `this.secrets` (lazily) and passes it into
`new OpenAiWidgetTagger(key)`, exactly like the other LLM adapters.

---

## Major

### M1. `routes.ts` imports and calls the repository directly — `widgets/routes.ts`

```ts
const repo = new WidgetsRepository(container.db());
...
const total = await repo.countAll();
```

Breaks **Rule 1**: "`routes.ts` may not import `repository.ts` — it goes through
the service" (import-legality table: routes → repository ✗). It also reaches
`container.db()` from the entry handler.

**Fix — `routes.ts` + `service.ts`:** the service exposes what the list endpoint
needs (e.g. `service.listPage(page)` returning items + total), and `routes.ts`
only frames the HTTP envelope around it. Remove the `WidgetsRepository` import
from `routes.ts`.

### M2. Repository returns Drizzle row types — `widgets/repository.ts`

```ts
async findById(id: string): Promise<WidgetRow | undefined>
async listStaleUntagged(): Promise<WidgetRow[]>
```

Breaks the stack rule "Repository methods return domain types" / anti-pattern
#3. `WidgetRow` (from `db/rows.ts`, infrastructure) escapes upward:
`service.get()` is declared `Promise<Widget>` but returns `repo.findById(...)`
unmapped, so a `WidgetRow` is handed to the route and serialized as the
contract. A column rename now breaks the service, the route and the client
contract.

**Fix — `widgets/repository.ts`:** map every returned row through `toWidget(...)`
inside the repository; methods return `Widget` / `Widget[]`. `WidgetRow` stays
private to the file.

### M3. Handler re-validates with `.parse()` instead of the route schema — `widgets/routes.ts`

```ts
{ schema: { body: z.unknown() } },
async (req, reply) => {
  const body = CreateWidget.parse(req.body);
```

Anti-pattern #6 / Fastify stack rule: validate with `schema.body`, not `.parse()`
in the handler — one Zod schema does validation and serialization.

**Fix — `routes.ts`:** `schema: { body: CreateWidget, response: { 201: Widget } }`
and use `req.body` directly.

---

## Minor

### m1. `WidgetsPage` is a transport envelope in the contracts ring — `contracts/widgets.ts`

`WidgetsPage` (`items` / `page` / `pageSize` / `total` / `nextCursor`) is HTTP
pagination framing, not a domain shape. The stack rule: "A contract schema
describes the domain shape, not a transport envelope. Pagination wrappers and
HTTP framing stay in `routes.ts`." `Widget` and `CreateWidget` are correctly
placed; only the page wrapper is misplaced.

**Fix — `contracts/widgets.ts`:** keep `Widget` / `CreateWidget`; build the
pagination envelope inline in `routes.ts` (or with a shared generic paginate
helper in `_shared/`), not as a shared contract.

### m2. Both vendored `shared` copies must change together — `contracts/widgets.ts`

The PR appends to `server/src/vendor/shared/contracts/`. The rule ("Two vendored
copies exist and have already diverged; change both, deliberately, in the same
commit" — anti-pattern #10) means `client/src/vendor/shared/contracts/widgets.ts`
must get the same `Widget` contract. Confirm the client copy is in the diff.

### m3. Staleness policy encoded in a repository query — `widgets/repository.ts`

`listStaleUntagged()` bakes the business definition of "stale" (`STALE_AFTER_DAYS`,
untagged) into the `where` clause. Borderline against "no business logic in a
repository". If a background re-tagging job owns this rule, the *decision*
(what counts as stale) belongs in that service; the repository should expose a
narrower primitive like `listUntaggedCreatedBefore(date)`.

---

## Fine as-is

- `platform/errors.ts` — unchanged; `AppError` / `NotFoundError` are usable from
  any ring.
- `ContainerOverrides.widgetTagger?` — correct: every new port gets an override
  entry.
- `service.get()` throwing `NotFoundError` rather than setting a status code —
  correct (routes/error mapper carry the status).
