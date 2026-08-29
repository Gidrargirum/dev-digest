# Architecture review — `brief/service.ts` `relatedPrsSection`

Scope: Onion ring placement and module boundaries for the new `relatedPrsSection`
method and its three new imports. Backend (`server/`).

Verdict: **BLOCKED** — the excerpt breaks the module boundary and the dependency
direction in four distinct ways. All four have the same root cause: the Brief
service reaches sideways into the `blast` module and downward into Drizzle
instead of going through its already-defined port.

---

## Finding 1 — Cross-module reach-in: `brief` imports `blast` internals (CRITICAL)

```ts
import { BlastRepository } from '../blast/repository.js';
import { BLAST_SYMBOL_CAP, formatSymbolList } from '../blast/helpers.js';
```

- **Rule broken:** SKILL.md rule 1 (dependencies point inward, `routes`/`service`
  never import another module's `repository.ts`) and anti-patterns.md §7
  "Cross-module reach-in". Mechanically this is the `no-cross-module-imports`
  rule in `.dependency-cruiser.cjs` (line 104) — `pnpm arch:check` fails, and
  adding it to the baseline is not allowed.
- **Why it costs:** `brief` and `blast` can no longer be moved, deleted or tested
  independently; a change to `blast`'s repository shape or helper signatures
  silently breaks `brief`. The module boundary becomes decorative.
- **This module already solved this correctly.** `brief/types.ts` defines
  `BriefBlastSource` precisely so the import is not needed, with a comment
  spelling out the rule:
  > "Declared here rather than imported from `modules/blast/` —
  > `no-cross-module-imports` forbids the import, and `container.blast` satisfies
  > this shape structurally at the one wiring site."
  The new method ignores that port and imports the module directly instead.
- **Where the fix goes:**
  1. `server/src/modules/brief/types.ts` — widen the blast port
     (`BriefBlastSource`, or add a sibling structural port) with the one read
     this feature needs, in domain vocabulary and returning resolved data, e.g.
     `relatedPrs(workspaceId, prId): Promise<{ symbols: string[]; prs: { number: number; title: string }[] }>`.
  2. `server/src/modules/blast/service.ts` + `blast/types.ts` (`BlastPort`) —
     implement that method on `BlastService`, using `blast`'s **own**
     `BlastRepository` (which it already holds) and `blast`'s own helpers.
  3. `server/src/modules/brief/service.ts` — call `this.deps.blast.relatedPrs(...)`
     and format the returned strings locally.
  4. `server/src/platform/container.ts` — no change needed: `container.brief`
     already passes `blast: this.blast` into `BriefDeps`, and a widened
     structural port stays satisfied at that one wiring site. Composition
     happens here, one ring out — as it should.

---

## Finding 2 — Service constructs a concrete infrastructure class (CRITICAL)

```ts
const blastRepo = new BlastRepository(this.deps.db);
```

- **Rule broken:** SKILL.md rule 4 "One composition root — only the container
  names concrete classes". `new BlastRepository(...)` in the application ring
  means the service names an infrastructure implementation and wires its own
  dependencies. `platform/container.ts` is the single place allowed to do this
  (it already does, at line 194).
- **Why it costs:** the service is no longer unit-testable through
  `ContainerOverrides` — every test now needs a real `Db`. The dependency points
  outward, to `modules/blast/repository.ts`.
- **Where the fix goes:** delete the instantiation. The read is reached through
  the injected `deps.blast` port (Finding 1). `BlastService` is the thing that
  legitimately holds a `BlastRepository`, and the container is the thing that
  legitimately constructs both.

---

## Finding 3 — Drizzle `Db` handle leaked into the application ring (CRITICAL)

```ts
new BlastRepository(this.deps.db)   // this.deps.db : Db
```

- **Rule broken:** SKILL.md rule 3 / stack-rules.md "Drizzle — stops at
  `repository.ts`" and the `service-not-in-db` cruiser rule (line 37). A Drizzle
  `Db` may appear in repositories, migrations and seeds only — never in a
  `service.ts`.
- **Additional signal:** `BriefDeps` in `brief/types.ts` deliberately lists only
  `llm`, `github`, `featureModel`, `blast` — there is **no `db` field**. The
  excerpt's `this.deps.db` requires adding a raw persistence handle to the
  application-ring deps object, which is exactly the leak the current shape
  avoids. `BriefRepository` (constructed with `this.db` in the container) is how
  Brief is allowed to touch storage.
- **Where the fix goes:** do not add `db` to `BriefDeps`. Persistence for this
  feature belongs behind either the widened `deps.blast` port (preferred — the
  data is `blast`'s) or, if it were Brief-owned data, behind `BriefRepositoryPort`
  in `brief/repository.ts`.

---

## Finding 4 — Reuse of another module's helper / constant across the boundary

```ts
import { BLAST_SYMBOL_CAP, formatSymbolList } from '../blast/helpers.js';
```

- **Rule broken:** same `no-cross-module-imports` rule as Finding 1; called out
  separately because the fix is different. `decision-tree.md` "A helper
  function": a helper used by *several modules* goes to `modules/_shared/`, not
  imported from a peer module. `formatSymbolList` is pure formatting and
  `BLAST_SYMBOL_CAP` is a pure constant, so "it's harmless, it's pure" is the
  tempting excuse — the boundary rule still forbids the import.
- **Where the fix goes:** two honest options.
  - Keep the symbol capping and formatting **inside `blast`** — `BlastService`
    applies `BLAST_SYMBOL_CAP` and returns already-formatted / already-bounded
    data through the port (Finding 1). Nothing crosses. This is the smaller
    change and keeps `blast`'s knobs in `blast`.
  - If `brief` genuinely needs its own symbol formatting, give it
    `brief/helpers.ts` with its own function, or promote the shared formatter to
    `server/src/modules/_shared/` — but only with a real second consumer, not a
    predicted one.

---

## Note (not an architecture finding)

`blastRepo.changedSymbols(...)` and `blastRepo.pullsTouchingSymbols(...)` do not
exist on the current `BlastRepository` (it exposes `resolvePr`,
`getChangedFiles`, `findPriorPrs`). Whoever implements the port method on
`BlastService` will need corresponding repository reads. Flagging only so the
fix for Findings 1–4 is scoped correctly; it is not itself a ring violation.

---

## Fix summary

| # | Rule | Fix lands in |
|---|---|---|
| 1 | `no-cross-module-imports` / rule 1 | `brief/types.ts` (widen port), `blast/service.ts` + `blast/types.ts` (implement), `brief/service.ts` (consume via `deps.blast`) |
| 2 | rule 4 — composition root | `brief/service.ts` — remove `new BlastRepository(...)` |
| 3 | `service-not-in-db` / rule 3 | `brief/types.ts` — do **not** add `db` to `BriefDeps`; read via port |
| 4 | `no-cross-module-imports` — helpers | keep capping/formatting in `blast`, or `modules/_shared/` |

No container change required — `container.brief` already injects `this.blast`
into `BriefDeps`; the structural port just gets wider.
