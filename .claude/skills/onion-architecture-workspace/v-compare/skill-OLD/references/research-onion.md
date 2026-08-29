# References — Onion Architecture and its neighbours

Sources behind the rules in `SKILL.md`. Retrieved 2026-08-13.

---

## Primary — Jeffrey Palermo, who coined the term (2008)

- [The Onion Architecture: Part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)
- [Part 2](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-2/) — worked example
- [Part 4: After Four Years](https://jeffreypalermo.com/2013/08/onion-architecture-part-4-after-four-years/) — retrospective
- [Tag index](https://jeffreypalermo.com/tag/onion-architecture/)

The load-bearing sentence, and the source of **rule 1**:

> All code can depend on layers more central, but code cannot depend on layers
> further out from the core.

Two further points from Part 1 that shaped this skill:

- The **Domain Model sits at the absolute centre**; the innermost application
  layer holds **repository interfaces** — contracts, not implementations. This is
  why `vendor/shared/adapters.ts` is the innermost ring here, not a `ports/` folder
  next to the adapters.
- The **periphery holds UI, infrastructure and tests** — the things that change
  most often. Infrastructure is *outside* the application, not beneath it, which is
  the difference between Onion and a classic three-tier stack where everything
  eventually depends on the DB layer.

---

## Context — how Onion relates to Hexagonal and Clean

- [Onion Architecture — Herberto Graça](https://herbertograca.com/2017/09/21/onion-architecture/) —
  places Onion in the lineage between Cockburn's Ports & Adapters and Martin's
  Clean Architecture; the clearest account of what each one adds.
- [Hexagonal Architecture — Wikipedia](https://en.wikipedia.org/wiki/Hexagonal_architecture_(software)) —
  the ports-and-adapters vocabulary used throughout `stack-rules.md`.
- [Clean Architecture: The Dependency Rule and Concentric Layers — Bitloops](https://bitloops.com/resources/software-architecture/clean-architecture) —
  the dependency rule stated in a framework-neutral way.

The practical summary that justifies **rules 2 and 3**: the application core
depends on nothing external, declares the ports it needs as interfaces, and imports
only its own domain types. The web framework and the database driver never appear
inside the core — they live in adapters, wired by dependency injection.

---

## TypeScript / Node implementations

- [Hexagonal Architecture: Complete Guide with a TypeScript Example](https://generalistprogrammer.com/tutorials/hexagonal-architecture-complete-guide)
- [Onion Architecture in Node.js with TypeScript — Sankhadip Samanta](https://sankhadip.medium.com/onion-architecture-in-node-js-with-typescript-5508612a4391)
- [onion-architecture-boilerplate — Melzar](https://github.com/Melzar/onion-architecture-boilerplate) — Express + TS, OOP variant
- [Original Onion architecture example (C#), mirrored](https://github.com/Jordiag/Jeffrey-Palermo-Onion-Architecture)

Where we deliberately diverge from these: most Node examples are heavily
class-and-decorator based (NestJS-style). This repo keeps plain functions and
interfaces, with the container doing the wiring by hand. The rings are identical;
only the ceremony differs.

---

## Enforcement

- [dependency-cruiser](https://github.com/sverweij/dependency-cruiser) — the tool
  itself; already a `server/` dependency (17.4.3).
- [Dependency Cruiser: Restrict Imports in JavaScript — Atomic Object](https://spin.atomicobject.com/dependency-cruiser-imports/) —
  the `forbidden` rule model, concisely.
- [Validate Dependencies According to Clean Architecture — Ken Miyashita](https://betterprogramming.pub/validate-dependencies-according-to-clean-architecture-743077ea084c) —
  layered `forbidden` rules mapped onto Clean rings; the closest prior art to
  `.dependency-cruiser.cjs`.
- [How to maintain clean architecture with dependency rules — cubic.dev](https://www.cubic.dev/blog/how-to-maintain-clean-architecture-with-dependency-rules-in-your-codebase)
- [How We Enforce Architecture Boundaries at Scale — lastminute.com](https://technology.lastminute.com/how-we-enforce-architecture-boundaries-at-scale-on-our-app/) —
  the source of the **ratchet** idea: adopt a baseline of existing violations so
  the gate is green from day one, then let the number only fall.
- [Taking Frontend Architecture Serious With Dependency-cruiser — Xebia](https://xebia.com/blog/taking-frontend-architecture-serious-with-dependency-cruiser/)

The recurring conclusion across these, and the reason `arch:check` exists rather
than a paragraph in `AGENTS.md`: an architectural boundary that is not checked by
a build step is a boundary that erodes. Documented conventions lose to deadlines;
a failing exit code does not.
