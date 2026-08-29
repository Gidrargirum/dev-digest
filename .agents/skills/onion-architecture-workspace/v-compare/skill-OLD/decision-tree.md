# Decision tree — which ring?

Start at the top. The first matching question wins.

## The one question that settles most cases

> **Does this code touch the outside world — DB, network, filesystem, clock, env?**

- **Yes** → it is an **adapter** or a **repository** (infrastructure ring).
  Its interface goes in `vendor/shared/adapters.ts`; its implementation in
  `src/adapters/<name>/`.
- **No, but it orchestrates things that do** → **service** (application ring).
- **No, and it is pure review logic** → **`reviewer-core/`** (domain ring).
- **No, and it is a shape/contract** → **`vendor/shared/contracts/`**.

---

## By artifact

### A new feature

`server/src/modules/<name>/` + one import in `modules/index.ts`.
We do **not** autoload from the filesystem.

Minimum shape:

```
modules/<name>/
├── routes.ts        entry — HTTP, Zod route schemas, calls the service
├── service.ts       application — the use cases
└── repository.ts    infrastructure — Drizzle only
```

Add `helpers.ts` / `constants.ts` only once there is real content to move.

### An outbound dependency (LLM, GitHub, git, index, secrets, tokenizer)

Two files, two rings — never one:

1. **Port**: `vendor/shared/adapters.ts` — an interface in domain vocabulary.
   `getPullDiff(...)`, not `octokitPullsGet(...)`. If the interface mentions the
   vendor, it is not a port, it is a wrapper.
2. **Adapter**: `src/adapters/<area>/<impl>.ts` — the SDK lives here and only here.
3. Wire it in `platform/container.ts` and add it to `ContainerOverrides` so tests
   can substitute it.

### A helper function

| Used by | Goes to |
|---|---|
| one file | that file, unexported |
| one module | `modules/<name>/helpers.ts` |
| several modules | `modules/_shared/` |
| several modules **and** it is I/O | an adapter behind a port |
| the review pipeline, pure | `reviewer-core/src/` |

Promotion needs a real second consumer, never a predicted one.

### A type

- Crosses the HTTP boundary (request/response) → `vendor/shared/contracts/` as a
  Zod schema. Remember the **second vendored copy** in `client/src/vendor/shared`.
- A DB row shape → `src/db/rows.ts`, infrastructure ring. It may not appear in a
  service signature — map to a domain type in the repository.
- Internal to one module → next to its use.

### Business logic that "needs the DB"

It does not. Split it:

- the *decision* → service (pure, testable);
- the *fetch* and the *write* → repository.

`if (await repo.countActiveRuns(id) >= MAX) throw ...` — the rule lives in the
service, the query in the repository.

### A cross-cutting concern (jobs, SSE, errors, config, resilience)

`src/platform/`. It is entry/infrastructure-ring plumbing: modules may use it,
`reviewer-core/` may not.

### A background job

The *job body* is a service method. `JobRunner` only schedules it. Do not put
orchestration inside the runner.

---

## Import legality, at a glance

| From ↓ / To → | contracts | reviewer-core | service | repository | adapters | db | platform | fastify |
|---|:-:|:-:|:-:|:-:|:-:|:-:|:-:|:-:|
| `vendor/shared` | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `reviewer-core` | ✅ | — | ✗ | ✗ | ✗ | ✗ | ✗ | ✗ |
| `service.ts` | ✅ | ✅ | ✅ | ✅ | ✗ | ✗ | ✅¹ | ✗ |
| `repository.ts` | ✅ | ✗ | ✗ | — | ✗ | ✅ | ✅¹ | ✗ |
| `adapters/**` | ✅ | ✅ | ✗ | ✗ | ✅ | ✗ | ✅¹ | ✗ |
| `routes.ts` | ✅ | ✗ | ✅ | ✗ | ✗ | ✗ | ✅ | ✅ |
| `container.ts` | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✗ |

¹ `platform/errors.ts` and `platform/config.ts` are fine anywhere.
`platform/container.ts` is **entry-ring** — an inner ring importing it inverts
the direction (rule 4).

---

## Still unsure?

Ask: **if we replaced Postgres with something else, would this file change?**

- Yes → infrastructure.
- No, but it would change if the *business rule* changed → application or domain.

That question separates the rings more reliably than any folder name.
