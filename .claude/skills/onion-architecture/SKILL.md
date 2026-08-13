---
name: onion-architecture
description: "Backend code architecture for server/ and reviewer-core/ — deciding WHICH RING code belongs in, and enforcing that dependencies point inward only. Use when adding a backend module, route, service, repository or adapter; when a service needs the outside world (DB, LLM, GitHub, git, filesystem); when deciding where a port interface goes; when Fastify or Drizzle types start spreading; when `pnpm arch:check` fails; or when reviewing a backend PR for layering drift. Covers the four rings (contracts, domain, application, infrastructure, entry), ports and adapters, the DI container as composition root, repository boundaries, and dependency-cruiser enforcement. Trigger terms: onion architecture, clean architecture, hexagonal, ports and adapters, layer boundary, dependency rule, where does this service go, repository pattern, DI container, arch:check, dependency-cruiser, backend structure."
metadata:
  version: 1.0.0
  tags: architecture, onion, backend, fastify, drizzle, ports-and-adapters, server
---

# Onion Architecture — backend rings

Answers one question: **which ring does this code belong in, and may it import that?**

Scope: `server/` and `reviewer-core/`. Not *how to write* a Fastify route (see
`fastify-best-practices`), not *how to write* a Drizzle query (see
`drizzle-orm-patterns`) — only placement, direction, and boundaries.

For the frontend equivalent see `frontend-architecture`.

| File | Read when |
|---|---|
| [decision-tree.md](decision-tree.md) | placing a specific artifact — service, adapter, port, helper, type |
| [stack-rules.md](stack-rules.md) | Fastify / Drizzle / Zod / container specifics — what may cross which line |
| [enforcement.md](enforcement.md) | `pnpm arch:check` failed, or you need to change the rules |
| [anti-patterns.md](anti-patterns.md) | reviewing a PR or auditing an existing module |
| [references/](references/) | you need the source behind a rule, or the trade-off's other side |

---

## The rings

Innermost first. **Every dependency points inward.**

```
        entry          routes.ts · app.ts · platform/container.ts
      ┌─────────────────────────────────────────────────┐
      │  infrastructure   adapters/** · db/** · repository.ts
      │   ┌───────────────────────────────────────┐     │
      │   │  application    modules/<m>/service.ts │     │
      │   │   ┌───────────────────────────┐        │     │
      │   │   │  domain   reviewer-core/  │        │     │
      │   │   │   ┌───────────────────┐   │        │     │
      │   │   │   │ contracts         │   │        │     │
      │   │   │   │ vendor/shared/**  │   │        │     │
      │   │   │   └───────────────────┘   │        │     │
      │   │   └───────────────────────────┘        │     │
      │   └───────────────────────────────────────┘     │
      └─────────────────────────────────────────────────┘
```

| Ring | Path | Holds | Knows about |
|---|---|---|---|
| contracts | `server/src/vendor/shared/**`, `server/src/ports/**` | Zod contracts, **port interfaces** | nothing |
| domain | `reviewer-core/src/**` | review engine: prompt, grounding, reduce | contracts |
| application | `server/src/modules/<m>/service.ts` | use cases, orchestration, transactions | contracts, domain |
| infrastructure | `server/src/adapters/**`, `src/db/**`, `modules/<m>/repository.ts` | Drizzle, Octokit, simple-git, LLM SDKs | everything inward |
| entry | `modules/<m>/routes.ts`, `app.ts`, `platform/container.ts` | HTTP, wiring | everything inward |

Infrastructure sits **outside** application, not under it. That is the whole point:
`repository.ts` is a detail, `service.ts` is not.

---

## The four rules

Everything below follows from these. When a case is not covered, reason from them.

### 1. Direction — dependencies point inward, never outward

> *"All code can depend on layers more central, but code cannot depend on layers
> further out from the core."* — Palermo, 2008

An inner ring may not import an outer one. Concretely:

- `reviewer-core/` may not import anything from `server/src` except `vendor/shared`.
- `service.ts` may not import `db/schema`, `db/client`, or a concrete `adapters/*`.
- `routes.ts` may not import `repository.ts` — it goes through the service.
- `vendor/shared/` imports nothing from the app at all.

### 2. Inversion — the inner ring declares the interface, the outer one implements it

Data access and I/O are **needs of the core**, so the contract belongs to the core:

- The **port** (`interface GitHubClient`, `LLMProvider`, `CodeIndex`) lives in
  `vendor/shared/adapters.ts` — innermost ring.
- A port the **client has no use for** (`Tokenizer`, `DepGraph`) goes in
  `src/ports/` instead. Same ring, same rules — but `vendor/shared` is vendored
  into the browser bundle's type surface, and a token budget has no business
  there.
- The **adapter** (`OctokitGitHubClient`, `OpenAIProvider`, `TiktokenTokenizer`)
  lives in `src/adapters/**` — outermost.
- A service depends on the interface. It must never name the class.

If you find yourself writing `new OctokitGitHubClient()` outside the container,
the inversion is broken.

### 3. Purity — the domain performs no I/O

`reviewer-core/` is `diff → prompt → LLM → findings` and nothing else. Its only
side effect is a call to the **injected** `LLMProvider`.

Needs data? Add a field to `ReviewInput` and let the caller resolve it. Inputs are
resolved strings, not identifiers: skill *bodies*, not slugs; memory *texts*, not ids.

A test in `reviewer-core/` that wants network is a signal the logic landed in the
wrong package.

### 4. One composition root — only the container names concrete classes

`platform/container.ts` is the single place where interfaces meet implementations.
Everything else receives what it needs.

Corollary — **a service takes ports, not the `Container`**. Accepting `Container`
means the application ring depends on the composition root, which is entry-ring.
Prefer:

```ts
// ✅ the service states its needs; they are all inner-ring interfaces
constructor(
  private readonly repo: ReviewRepository,
  private readonly github: GitHubClient,
  private readonly llm: LLMProvider,
) {}

// ❌ opaque dependency on the outermost ring; untestable without the whole app
constructor(private readonly container: Container) {}
```

Tests substitute through `ContainerOverrides`, never by mocking modules.

---

## Enforcement is mechanical, not cultural

These rules are checked, not trusted:

```sh
cd server && pnpm arch:check       # the gate — fails on any NEW violation
pnpm arch:violations               # show all violations, including known ones
```

The repo carries 12 pre-existing violations in
`.dependency-cruiser-known-violations.json`. They are **ignored, not forgiven**:
the baseline is a ratchet, so the count may go down but never up.

Adding to the baseline to make a red build green is not allowed — see
[enforcement.md](enforcement.md).

---

## When a rule is genuinely in the way

Say so instead of quietly routing around it. A leak that is argued for and
documented is cheaper than one discovered a year later. The usual honest outcomes:

- the port is missing → add the interface to `vendor/shared/adapters.ts`, or to
  `src/ports/` when the client has no use for it;
- the boundary is drawn wrong → move the code, not the rule;
- the use case really is infrastructural (a migration, a seed, a script) → it does
  not belong in `modules/` at all.
