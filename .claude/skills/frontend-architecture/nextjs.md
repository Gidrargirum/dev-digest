# Next.js App Router — Structural Layer

How the four rules from [SKILL.md](SKILL.md) apply when folders also define routes.
This file covers **placement**; framework mechanics (RSC internals, caching, metadata,
route handler APIs) belong to the `next-best-practices` skill.

---

## The premise: two independent axes

In App Router, folders serve two unrelated purposes at once:

1. **Routing** — `app/` folders are URL segments, and they define where layouts,
   `loading`, and `error` boundaries apply.
2. **Modularity** — feature boundaries and dependency direction.

Most Next.js structure problems come from conflating them. Ask both questions separately:
*does this path need to exist for the URL?* and *who owns this code?*

Framework mechanisms that let you separate the axes:

| Mechanism | Effect |
|---|---|
| colocation by default | a folder is not routable until it has `page`/`route`; any file may sit beside them |
| `_folder` (private) | opts the folder and its subtree out of routing entirely |
| `(group)` (route group) | groups routes without adding a URL segment; enables per-group layouts |
| `src/` | separates application code from root-level config |

---

## Choosing a layout

Three viable shapes. Pick one and apply it consistently — mixing them per-route is the
actual failure mode.

### A. `app/` is routing only

```
src/features/<name>/…          ← all real code
app/<route>/page.tsx           ← thin adapter: imports from the feature, renders it
```

Use when: several routes render the same feature, or you already enforce feature
boundaries with a linter. Cost: constant jumping between `app/` and `features/`.

### B. Colocation inside the route segment

```
app/(internal)/boards/
├── page.tsx            ← thin
├── layout.tsx
├── loading.tsx
├── _components/        ← UI for this route only
└── _lib/               ← loaders, actions, services, schemas, tests for this route only
```

Use when: a route maps 1:1 to a feature. Best discoverability. Cost: code shared by two
routes must be promoted upward, deliberately.

### C. Hybrid (default recommendation)

Route-specific → `_components/` + `_lib/` in the segment. Shared by 2+ routes →
`features/` (or `components/` + `lib/`). This is just the promotion rule applied to routes.

Whichever you choose: **`page.tsx` stays thin**. It resolves params, calls the data layer,
composes components. Business logic in a `page.tsx` cannot be reused or tested.

---

## The Server/Client boundary is an architectural boundary

This is the one structural constraint React-only projects do not have.

- `'use client'` marks a **boundary in the module graph**, not a single component.
  Everything a client entry imports is pulled into the client bundle. The directive belongs
  on the entry to a client subtree, not on every file in it.
- **Code** crosses via imports; **data** crosses via serializable props. Functions do not
  cross (a Server Function passed as `action`/`*Action` is a reference, not a function).
- A Server Component **can** render inside a Client Component when passed as `children` —
  the client never imports its code, only receives its rendered output. This is the main
  tool for keeping the client bundle small without flattening the tree.

Placement consequences:

| Rule | Why |
|---|---|
| push `'use client'` down to leaf interactive components | a directive high in the tree drags the whole subtree into the client bundle |
| render providers as deep as possible, never around `<html>` | wrapping the root opts the static tree out of optimization |
| wrap client-only third-party components in your own `'use client'` file | keeps the boundary in your code, and gives one place to swap the library |
| expose compound components as named exports, not static properties | `Menu.Item` becomes `undefined` across the boundary |
| mark server modules with `import 'server-only'` | build-time error instead of a silent client leak |

A useful convention: a `.server.ts` suffix or a `server/` folder for modules that must never
reach the client, plus `server-only` as the actual enforcement.

---

## Data access: one layer, not scattered calls

Pick **one** of three approaches project-wide and do not mix them — mixed approaches make
both code review and security audit unreliable:

| Approach | Fits |
|---|---|
| **External HTTP API** — call the existing backend from server components | an existing backend owned by another team |
| **Data Access Layer (DAL)** — internal server-only module | **new projects; the default** |
| **Component-level queries** — DB calls inline in components | prototypes only |

A DAL is a module that: runs only on the server, performs authorization, and returns
minimal DTOs — never raw rows.

**The single most important placement rule in a Next.js app:**

> Only the data-access layer reads `process.env`. Secrets never appear anywhere else.

Supporting patterns: cache the current-user lookup so modules read it back instead of
passing it down (less risk of it reaching a client component); return explicit field
subsets from DTO functions rather than spreading a record.

---

## Mutations: where the entry points live

Decision rule: **a human triggering it from your UI → Server Action. A machine calling it
→ Route Handler** (webhooks, mobile clients, third-party integrations, public read APIs).

Structure:

- Server Actions are **thin**: validate input → call a service/DAL → revalidate. Roughly
  20 lines is the ceiling; past that, the logic belongs in a service.
- Business logic goes in plain services with no framework imports — those are the units
  you actually test.
- Colocate actions with the feature/route that owns them (`_lib/<name>.actions.ts`).
  A central `lib/actions/` bucket stops scaling almost immediately.
- Do not put Server Actions inside `api/` route folders.

Security constraints that shape placement: an exported Server Action is reachable by direct
POST even if never imported, and a page-level auth check does **not** cover the actions
defined on that page. So every action re-verifies authentication **and** resource ownership —
which is another reason to route them through the DAL rather than duplicating checks.

---

## Config and environment variables

```
config/            ← app-wide constants + validated env, parsed once at boot
<feature>/_lib/*.constants.ts
```

- Validate env with a schema at boot/build so a bad environment fails immediately.
- Only `NEXT_PUBLIC_*` reaches the browser, and it is **inlined at build time** — one image
  promoted across environments will carry frozen values. Anything that must vary at runtime
  has to be read on the server during dynamic rendering or served through an endpoint.
- Dynamic access (`process.env[name]`) is never inlined — it silently yields nothing on the
  client. Always write the full literal `process.env.NEXT_PUBLIC_X`.
- Non-prefixed vars become an empty string in client bundles: a server helper imported into
  a client component fails silently rather than loudly. Hence `server-only`.
- `.env*` files stay at the project root even when using `src/`.

---

## Heavier options

**Feature layer** — split each feature into a data part (mappers/DTOs, repositories) and a
domain part (entities, use cases, repository interfaces, validated params). Use when
business rules are substantial but you do not want full layering ceremony.

**Clean Architecture** — `entities → application (use cases) → infrastructure →
interface-adapters`, with `app/` as the outermost framework layer. Route handlers, server
actions, and components may only touch controllers, models, and errors — never use cases or
repositories directly. Justified when business rules must outlive the framework; otherwise
it is indirection without payoff.

---

## Structural review checklist (Next.js-specific)

- [ ] `process.env` and DB clients imported **only** inside the data-access layer
- [ ] every `'use server'` function re-checks authn **and** resource ownership
- [ ] action return values are shaped for the UI, not raw records
- [ ] `'use client'` sits on leaves, not on layouts or feature roots
- [ ] client component props are narrow types, never full domain entities
- [ ] `[param]` values are validated — bracket folders are user input
- [ ] `page.tsx` contains no business logic
- [ ] actions colocated with their feature, not in a central `lib/actions/`
- [ ] providers wrap `{children}`, not the document
- [ ] `proxy.ts` / `route.ts` reviewed separately — they carry the most authority
