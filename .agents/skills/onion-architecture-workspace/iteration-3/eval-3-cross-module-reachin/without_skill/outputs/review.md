# Architecture Review — `brief/service.ts` `relatedPrsSection`

Scope: Onion ring placement and module-boundary rules for the new `relatedPrsSection`
method and its imports. `server/src/modules/brief/` and `server/src/modules/blast/`
are sibling feature modules, each `routes → service → repository`, meant to be
independently deletable and testable. Dependencies must point inward and cross
module lines only through a port wired at the composition root
(`server/src/platform/container.ts`).

The excerpt breaks that in several ways; they compound into one theme: **`brief`
reaches directly into `blast`'s internals instead of going through a port.**

---

## Finding 1 — CRITICAL: cross-module source imports (`no-cross-module-imports`)

```ts
import { BlastRepository } from '../blast/repository.js';
import { BLAST_SYMBOL_CAP, formatSymbolList } from '../blast/helpers.js';
```

`.dependency-cruiser.cjs`'s `no-cross-module-imports` rule forbids any import from
one `modules/<name>/` folder into another. `brief` is not allowed to name
`../blast/repository.js` or `../blast/helpers.js` at all. `pnpm arch:check` fails
on this, and it defeats "independently deletable": deleting `blast/` would now
break `brief/`'s type-check and runtime.

This module already has the sanctioned mechanism. `brief/types.ts` declares
`BriefBlastSource` precisely so the blast read path is consumed as a structural
port, and `container.brief` wires `blast: this.blast` into `BriefDeps`. The
service must use `this.deps.blast`, never `../blast/*`.

**Fix location:**
- Delete both imports from `brief/service.ts`.
- Extend `BriefBlastSource` in `server/src/modules/brief/types.ts` with the
  method(s) this section needs (e.g. `relatedPrs(workspaceId, prId): Promise<PrRelatedRef[]>`),
  typed against `@devdigest/shared` shapes.
- Implement that method on `BlastService` (`server/src/modules/blast/service.ts`)
  and add it to `BlastPort` in `blast/types.ts` so `container.blast` still
  satisfies `BriefBlastSource` structurally at the one wiring site
  (`platform/container.ts`).

---

## Finding 2 — CRITICAL: application ring instantiates an infrastructure adapter

```ts
const blastRepo = new BlastRepository(this.deps.db);
```

`BriefService` is an application-ring object. Its own doc comment states the
constraint: *"Constructor takes ports (`BriefDeps` + `BriefRepositoryPort`) —
never the `Container`. No `container.*`, no `db/schema`, no `fastify` here."*
`BlastRepository` is a Drizzle adapter (imports `../../db/client.js` and
`../../db/schema.js`) — an infrastructure-ring class. An application service must
never `new` an infrastructure adapter; constructing repositories is the
composition root's job alone. Doing it inside a request method also rebuilds the
adapter on every call instead of once at wiring time.

**Fix location:** remove the `new BlastRepository(...)`. The related-PRs read is
reached through the port from Finding 1 (`this.deps.blast.…`). If the data is a
plain `pr_files`/`pull_requests` aggregate with no repo-intel involvement, the
alternative is to add a method to `BriefRepositoryPort` (`brief/types.ts`) and
implement it in `brief/repository.ts` — but it still must not live in `blast/`.

---

## Finding 3 — CRITICAL: bypasses the repository port / smuggles `db` into the service

The service has no database handle and must not have one. `BriefDeps`
(`brief/types.ts`) has no `db` field; all persistence goes through
`BriefRepositoryPort` / `BriefLockedRepository`. `this.deps.db` does not exist,
and adding it would put a raw Drizzle connection in the application ring,
letting the service issue ad-hoc queries around its repository boundary — the
exact coupling the port exists to prevent.

**Fix location:** do not add `db` to `BriefDeps`. Route this read through either
`BriefBlastSource` (Finding 1) or `BriefRepositoryPort` (Finding 2), both of
which already own the DB access.

---

## Finding 4 — reusing another module's constants and helpers

```ts
import { BLAST_SYMBOL_CAP, formatSymbolList } from '../blast/helpers.js';
import { RELATED_PR_LIMIT } from './constants.js';
```

Even setting aside the illegal import path, `BLAST_SYMBOL_CAP` and
`formatSymbolList` are `blast`'s internal tuning knob and presentation helper.
Consuming them couples `brief`'s output to `blast`'s private contract — a change
to either silently changes the Brief. `blast` already keeps such values private
(`PRIOR_PRS_LIMIT`, `PRIOR_PRS_PATH_LIMIT` in `blast/constants.ts`) and maps its
own read models to the shared contract inside `blast/helpers.ts`.

**Fix location:** if `brief` needs a symbol cap or a symbol-list formatter, it
owns them — a constant in `server/src/modules/brief/constants.ts` (alongside the
existing `RELATED_PR_LIMIT`) and a helper in `brief/helpers.ts`. Better: the
port method from Finding 1 returns already-shaped, already-bounded data so
`brief` does no capping or formatting of `blast`'s domain at all.

---

## Note (not a boundary violation)

`changedSymbols(...)` and `pullsTouchingSymbols(...)` are not on the real
`BlastRepository` (it exposes `resolvePr`, `getChangedFiles`, `findPriorPrs`).
Whatever port method replaces this must be defined deliberately on
`BlastPort` / `BriefBlastSource`, not assumed.

---

## Summary of fixes

| Rule broken | Where the fix goes |
|---|---|
| `no-cross-module-imports` (dependency-cruiser) | remove `../blast/*` imports from `brief/service.ts`; add method to `BriefBlastSource` in `brief/types.ts` |
| dependency rule — application ring must not construct infrastructure adapters | remove `new BlastRepository`; implement on `BlastService` + `BlastPort`, or on `BriefRepository` + `BriefRepositoryPort` |
| repository boundary / no raw `db` in a service | keep `BriefDeps` db-free; go through the port |
| module owns its own constants/helpers | `brief/constants.ts`, `brief/helpers.ts` |
| composition root is the only place two modules meet | wire the new port in `platform/container.ts` `get brief()` |
