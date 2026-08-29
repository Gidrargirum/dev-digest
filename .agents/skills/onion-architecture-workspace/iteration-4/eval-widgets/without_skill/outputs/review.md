# Widgets PR — Onion architecture review

Rings (inward-pointing dependency rule):
**contracts** (`vendor/shared`, `src/ports`) → **domain** → **application** (`modules/*/service.ts`) → **infrastructure** (`modules/*/repository.ts`, `adapters/**`, `db/**`) → **entry** (`modules/*/routes.ts`, `platform/container.ts`).
Each ring may depend only on rings strictly inside it; the container is the single composition root where application meets infrastructure.

---

## 1. `contracts/widgets.ts` — port interface imports a concrete infrastructure library

```ts
export interface WidgetTagger {
  suggest(payload: import('openai').OpenAI.Chat.ChatCompletionCreateParamsNonStreaming): Promise<string[]>;
}
```

**Rule broken:** the contracts ring (innermost) must not depend on any outer ring or any adapter/vendor library. Port shapes here are provider-neutral by design — compare `LLMProvider`/`CompletionRequest` in `vendor/shared/adapters.ts`, which never name `openai`. This interface hard-codes the OpenAI SDK request type into ring 0.

**Extra damage:** `vendor/shared` is vendored into the client, so this drags `openai`'s type surface (and a dependency the browser build has no reason to carry) into the client package.

**Fix goes in:** `contracts/widgets.ts` — define a neutral input, e.g. `suggest(input: { name: string }): Promise<string[]>` (or a small `TagSuggestionRequest` type). The mapping from that to an OpenAI chat-completion payload belongs in the adapter (§2). Also consider whether this port belongs in `server/src/ports/` instead of `vendor/shared` — the client has no notion of widget-tag suggestion — but the library import is the blocking issue either way.

---

## 2. `adapters/llm/openai-tagger.ts` — secret read from `process.env` instead of `SecretsProvider`

```ts
constructor() {
  this.client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
}
```

**Rule broken:** repo invariant — secrets are read only through `SecretsProvider` (`~/.devdigest/secrets.json`), `process.env` is a fallback owned by that provider, not by adapters. The sibling adapter `adapters/llm/openai.ts` takes `apiKey: string` in its constructor and lets the container resolve it.

**Fix goes in:** `adapters/llm/openai-tagger.ts` — constructor takes `apiKey: string`; the container passes `await this.secrets.get('OPENAI_API_KEY')` (§3).

(Minor, same file: the file is named `openai-tagger.ts` in its header and imported as such by the container, but the task describes it as `adapters/llm/openai.ts`, which already exists as the real `OpenAIProvider`. Pick a non-colliding name.)

---

## 3. `platform/container.ts` — `widgetTagger()` constructs a secret-backed adapter with no secret

```ts
widgetTagger(): WidgetTagger {
  if (this.overrides.widgetTagger) return this.overrides.widgetTagger;
  this._widgetTagger ??= new OpenAiWidgetTagger();
  return this._widgetTagger;
}
```

**Rule broken:** the composition root is where an adapter is assembled from its configuration. Every other secret-backed adapter accessor here is `async` and pulls the key from `this.secrets` (`llm()`, `github()`). This one is sync precisely because it can't `await`, which is what forced the `process.env` read in §2.

**Fix goes in:** `platform/container.ts` — make `widgetTagger()` `async`, resolve `OPENAI_API_KEY` via `this.secrets.get(...)` (throw `ConfigError` if missing, matching `buildLlm`), pass it to `new OpenAiWidgetTagger(key)`.

---

## 4. `widgets/routes.ts` — entry ring bypasses the composition root

```ts
const service = new WidgetsService(container);
const repo = new WidgetsRepository(container.db());
```

**Rule broken:** the container is the single composition root; the entry ring wires through it and does not `new` application/infrastructure classes itself. The container already exposes `get widgets(): WidgetsService` (with lazy caching), and this route ignores it and builds its own instance.

**Fix goes in:** `widgets/routes.ts` — use `container.widgets`; delete the direct `new WidgetsService` / `new WidgetsRepository`.

---

## 5. `widgets/routes.ts` — entry ring calls the repository directly, skipping the service

```ts
import { WidgetsRepository } from './repository.js';
...
const total = await repo.countAll();
...
nextCursor: items.length === PAGE_SIZE ? items.at(-1)!.id : null,
```

**Rule broken:** dependency direction is entry → application → infrastructure. The route must not reach into `repository.ts` (infrastructure); pagination/counting is application logic. The GET handler here assembles the `WidgetsPage` envelope (total, nextCursor, pageSize) itself using a raw repo call.

**Fix goes in:** move the list-page assembly into `WidgetsService` (e.g. `service.listPage(page): Promise<WidgetsPage>`), which internally uses its repo. `widgets/routes.ts` loses the `WidgetsRepository` import entirely; `widgets/service.ts` + `widgets/repository.ts` gain the method.

---

## 6. `widgets/service.ts` — application ring imports the infrastructure ring

```ts
import { and, desc, eq, lt } from 'drizzle-orm';
import { db } from '../../db/client.js';
import { widgets } from '../../db/schema/widgets.js';
...
const [row] = await db.insert(widgets).values({...}).returning();
...
const rows = await db.select().from(widgets).orderBy(...).limit(PAGE_SIZE).offset(...);
```

**Rule broken:** the application ring may not depend on infrastructure. `drizzle-orm`, the `db` client, and `db/schema/*` are all infrastructure; all persistence must go through the repository port. `create()` and `list()` run Drizzle queries inline. The repository (`repository.ts`) is the correct home for these — and it is otherwise clean and should be left as is.

Additionally, the service reaches for the **module-level `db` singleton** rather than the injected `container` — so even the DI seam is bypassed. Compare `ConventionsService`, which does all DB work via `this.repo = new ConventionsRepository(container.db)`.

**Fix goes in:** `widgets/service.ts` — remove the `drizzle-orm` / `db` / `db/schema` imports; add `create` / `list` methods to `WidgetsRepository` and call `this.repo.*`. (`and`, `lt` are also imported but unused.)

---

## 7. `widgets/service.ts` — `get()` leaks a raw DB row across the contract boundary

```ts
async get(id: string): Promise<Widget> {
  const widget = await this.repo.findById(id);      // WidgetRow | undefined
  if (!widget) throw new NotFoundError(`widget ${id}`);
  return widget;                                     // returned unmapped
}
```

**Rule broken:** row types from the infrastructure ring must be mapped to the contract type at the service boundary. `create()` and `list()` correctly call `toWidget(...)`; `get()` returns the `WidgetRow` straight through a `Promise<Widget>` signature, so the entry ring serializes the DB row shape as the public contract.

**Fix goes in:** `widgets/service.ts` — `return toWidget(widget);`.

---

## 8. `widgets/routes.ts` — validation done with `.parse()` in the handler, not the route schema

```ts
typed.post('/widgets', { schema: { body: z.unknown() } }, async (req, reply) => {
  const body = CreateWidget.parse(req.body);
```

**Rule broken:** repo convention — validate via `schema.body` / `schema.params` (one Zod schema = validation + serialization), not `.parse()` inside the handler. `z.unknown()` also disables request-body documentation/serialization.

**Fix goes in:** `widgets/routes.ts` — `schema: { body: CreateWidget }`, then use `req.body` directly.

---

## Minor (not ring violations)

- `widgets/routes.ts` reads `req.headers['x-workspace-id'] as string` directly; other modules take workspace/identity from `_shared/context.ts` (`getContext(req)`).
- `widgets/service.ts` — unused imports `and`, `lt`.

## Files that are fine

- `widgets/repository.ts` — correct infrastructure ring: constructor-injected `Db`, returns `WidgetRow`, Drizzle confined here. Leave as is (it will gain `create` / `list` / `listPage` helpers per §5–6).
- `platform/errors.ts` — unchanged; `AppError` usable from any ring is intended.
