# frontend-architecture

**Version 1.0.0** · Frontend · Last updated 2026-08-13

Skill documentation: what this skill is for, what it covers, how it differs from the
neighbouring skills, and every source it was built from.

---

## Focus

One question, answered consistently: **where does this code belong?**

The skill is about *placement and boundaries* — folder structure, module ownership,
dependency direction, naming, and the promotion of code from local to shared. It is
deliberately **not** about how to write a component, how a hook behaves, or how a framework
renders. Those belong to other skills (see [Relationship to other skills](#relationship-to-other-skills)).

Its four load-bearing rules:

1. **Colocation** — code lives next to its only consumer.
2. **Promotion** — shared status is earned by a real second consumer, never predicted.
3. **Direction** — `shared → features → app`; features never import each other.
4. **Depth** — max 3–4 nested folders; flat until it hurts.

## What it covers

| Area | Contents |
|---|---|
| Folder structure | flat vs feature-based vs Feature-Sliced Design vs layered/Clean Architecture, and when each is justified |
| Module boundaries | dependency direction, cross-feature imports, public API, "delete the folder" test |
| Placement decisions | components, hooks, plain functions, constants, types, state, tests, assets |
| Component splitting | responsibility-based seams, prop-count and render-helper signals, when *not* to split |
| Logic placement | pure functions vs custom hooks vs components; server state vs client state |
| `utils` / `helpers` / `lib` / `services` | what each means and how to stop `utils/` becoming a dump |
| Constants & config | scope-based placement, magic values, env vars and secret containment |
| Naming | file/folder casing, exports, hook and folder naming conventions |
| Barrel files | the encapsulation-vs-build-cost trade-off, stated as a decision rather than a rule |
| Enforcement | ESLint rules that turn the conventions into build failures |
| Next.js App Router | routing axis vs module axis, route colocation, Server/Client boundary as an architectural boundary, data-access layer, action placement |
| Review | anti-pattern catalog with severities and a fast diff-review pass |

## When it applies

Intended trigger cases:

- creating a new file, folder, or feature and deciding where it goes;
- a component, page, or action that grew too big and needs splitting;
- extracting a util, hook, constant, or type — and deciding at which level it lives;
- choosing between feature-scoped and shared;
- setting up a project's structure, or writing its structural conventions down;
- reviewing a PR for structural drift (cross-feature imports, god folders, fat entry points);
- auditing or incrementally refactoring an existing codebase's organization.

Out of scope: component implementation, hook semantics, rendering performance, testing
technique, validation-library usage, framework APIs.

## Files

| File | Purpose | Size |
|---|---|---|
| [SKILL.md](SKILL.md) | the four rules, structure choice, logic placement, naming, barrels, enforcement | always loaded when the skill triggers |
| [decision-tree.md](decision-tree.md) | per-artifact placement procedures (component, hook, function, constant, type, state, test, asset, new feature) | on demand |
| [nextjs.md](nextjs.md) | App Router structural layer: routing vs module axis, `'use client'` boundary, DAL, actions, config | on demand |
| [anti-patterns.md](anti-patterns.md) | review catalog with severities + quick diff-review pass | on demand |
| [references/research-react.md](references/research-react.md) | full research notes with quotes and citations (Ukrainian) | provenance |
| [references/research-nextjs.md](references/research-nextjs.md) | full Next.js research notes with quotes and citations (Ukrainian) | provenance |

The two `references/` files are the raw research this skill was distilled from. They keep
the original quotes, the numbers, and both sides of every trade-off — read them when a rule
needs justification or when a rule seems wrong for a given project.

## Relationship to other skills

Deliberate boundaries to avoid duplication:

| Skill | Owns | This skill instead |
|---|---|---|
| `react-best-practices` | how to write components and hooks: purity, derived state, hook misuse, memoization, re-render behaviour | *where* the component/hook/function file lives and who may import it |
| `next-best-practices` | framework mechanics: RSC internals, data-fetching APIs, caching, metadata, route handler APIs, bundling flags | how App Router structure maps onto module boundaries and where server code, actions, and config live |
| `react-testing-library` | how to write tests: queries, `userEvent`, async, mocking | where test files live and which layer is worth unit-testing |
| `typescript-expert` | type-level programming, tooling, migrations | where a type declaration belongs in the folder tree |
| `zod` | schema authoring and parsing APIs | that config/env should be schema-validated at boot, and in which module |
| `security` | OWASP categories, auth, injection, uploads | the structural half only: secret containment in one layer, `server-only`, narrow props across the client boundary |

Overlap check: if a question is "how do I write X", it is not this skill. If it is
"where does X go, and what may import it", it is.

## Known trade-offs (stated, not resolved)

The skill presents both sides rather than picking dogmatically, because the sources
genuinely disagree:

- **Barrel files** — bulletproof-react says avoid them (tree-shaking, build cost);
  FSD and module-boundary approaches require them as public API. Decided per project.
- **FSD vs feature-based** — enforced boundaries vs ceremony overhead on small apps.
- **File naming** — PascalCase components (historical React convention) vs kebab-case
  everything (case-insensitive filesystems, no per-file decision).
- **`app/` as routing-only vs route colocation** in Next.js — discoverability vs promotion cost.

---

## Version history

### 1.0.0 — 2026-08-13

Initial release. Built from a two-part research pass (React/general + Next.js App Router).

- Four core rules; structure comparison table (flat / feature-based / FSD / Clean Architecture).
- `decision-tree.md`: nine placement procedures.
- `nextjs.md`: App Router structural layer.
- `anti-patterns.md`: catalog with CRITICAL/HIGH/MEDIUM severities + quick review pass.
- Research notes preserved under `references/`.

**Versioning policy:** MAJOR — a core rule changes or a file is removed; MINOR — new
section, new reference file, or a materially expanded area; PATCH — corrections, link fixes,
wording. Keep `metadata.version` in `SKILL.md` in sync with this section.

---

## Sources

Everything the skill was built from, grouped by topic. **Bold** = primary source, i.e. a
rule in the skill traces directly to it.

### Official documentation

- **[React — File Structure FAQ (legacy docs)](https://legacy.reactjs.org/docs/faq-structure.html)** — grouping by feature vs by type; max 3–4 nested folders; "don't spend more than five minutes"; colocation.
- **[React — Thinking in React](https://react.dev/learn/thinking-in-react)** — single responsibility as the split criterion; programming/CSS/design lenses; where state should live.
- **[React — Choosing the State Structure](https://react.dev/learn/choosing-the-state-structure)** — group related state, avoid contradictions/redundancy/duplication/deep nesting.
- **[React — Reusing Logic with Custom Hooks](https://react.dev/learn/reusing-logic-with-custom-hooks)** — when to extract a hook and when not to; `use` prefix; logic-not-state; concrete use-case naming; avoid lifecycle wrappers.
- **[Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure)** — colocation by default, private folders, route groups, `src/`, the three official strategies.
- **[Next.js — The Server and Client Boundary](https://nextjs.org/docs/app/guides/server-and-client-boundary)** — module-graph boundary, what crosses via imports vs props, owner/parent, compound components.
- **[Next.js — Server and Client Components](https://nextjs.org/docs/app/getting-started/server-and-client-components)** — the when-to-use table, pushing `'use client'` down, providers deep in the tree, wrapping third-party components, environment poisoning.
- **[Next.js — How to think about data security](https://nextjs.org/docs/app/guides/data-security)** — the three data-fetching approaches, Data Access Layer + DTOs, "only the DAL reads `process.env`", thin actions over a DAL, tainting, the audit checklist.
- **[Next.js — Environment variables](https://nextjs.org/docs/app/guides/environment-variables)** — `NEXT_PUBLIC_` build-time inlining, no dynamic lookups, load order, `.env` at root with `src/`.
- [npm — `server-only`](https://www.npmjs.com/package/server-only) — build-time guard for server modules.

### Project structure — primary references

- **[bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md)** — the `src/` folder table, feature folder contents, unidirectional flow, no cross-feature imports, avoid barrel files, `import/no-restricted-paths`.
- **[bulletproof-react — project-standards.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-standards.md)** — kebab-case files and folders, absolute imports via `@/*`, lint/format/type tooling.
- **[bulletproof-react — components-and-styling.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/components-and-styling.md)** — colocation, no nested render functions, prop-count signal, wrap third-party components, abstract only after real repetition.
- [bulletproof-react — repository](https://github.com/alan2207/bulletproof-react)
- **[Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/)** — the four-stage evolution and the promotion rule ("one feature → inside it; two or more → shared").
- **[Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation)** — "place code as close to where it's relevant as possible"; restraint before extracting to `utils`.
- [React Handbook — Project Structure](https://reacthandbook.dev/project-structure) — endorses bulletproof; start flat, refactor at ~10 files; SPA-oriented caveat.
- [React Handbook — Project Standards](https://reacthandbook.dev/project-standards)
- [Sandro Roth — How to structure your React projects](https://sandroroth.com/blog/project-structure/) — feature `index.ts` as public API; critique of bulletproof (split cohesive code, opaque inter-feature deps).
- [Codemzy — My React file/folder structure, 2025 changes](https://www.codemzy.com/blog/react-file-structure) — kebab-case everywhere, barrels removed, named exports, `features/` added.

### Feature-Sliced Design

- **[FSD — Overview](https://feature-sliced.design/docs/get-started/overview)** — the seven layers and the import rule.
- **[FSD — Slices and Segments (reference)](https://feature-sliced.design/docs/reference/slices-segments)** — zero coupling/high cohesion, public API rule, `ui`/`api`/`model`/`lib`/`config` segments, purpose-based naming.
- [FSD — homepage](https://feature-sliced.design/) · [documentation repository](https://github.com/feature-sliced/documentation)
- [codecentric — FSD and good frontend architecture](https://www.codecentric.de/en/knowledge-hub/blog/feature-sliced-design-and-good-frontend-architecture)
- [Godel Technologies — FSD: a guide to scalable frontend architecture](https://www.godeltech.com/blog/feature-sliced-design-a-guide-to-scalable-frontend-architecture/)
- [DEV — FSD: The Best Frontend Architecture](https://dev.to/m_midas/feature-sliced-design-the-best-frontend-architecture-4noj)
- [Bits and Pieces — Developing scalable frontends with FSD](https://blog.bitsrc.io/developing-frontends-with-feature-sliced-design-a2e5aa33d02c)

### Where business logic lives

- **[Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)** — application logic in hooks, UI stays presentational.
- **[Antony Leme — Business vs application logic: how to separate and test your React code](https://antonyleme.medium.com/business-vs-application-logic-how-to-separate-and-test-your-reactjs-code-4291d0c983b1)** — business logic as pure functions.
- [eMoosavi — Decoupling business logic from UI with custom React hooks](https://www.emoosavi.com/blog/decoupling-business-logic-from-ui-with-custom-react-hooks)
- [Asrul Kadir — Why separating business logic from components matters](https://asrulkadir.medium.com/why-separating-business-logic-from-components-matters-in-react-applications-5dbe2c71a2ba)
- [DEV — Separating logic from UI in React: a comparison with Angular services](https://dev.to/rcrd/separating-logic-from-ui-in-react-a-comparison-with-angular-services-5en)
- **[patterns.dev — Container/Presentational pattern](https://www.patterns.dev/react/presentational-container-pattern/)** — the pattern and its deprecation by hooks.
- [Nielsen tech blog — Why you should stop using the container/presentational pattern](https://medium.com/nmc-techblog/why-you-should-stop-using-the-container-presentational-pattern-in-redux-29b112406128)
- [GreatFrontend — Presentational vs container components](https://www.greatfrontend.com/questions/quiz/explain-the-presentational-vs-container-component-pattern-in-react)
- **[TkDodo — React Query as a State Manager](https://tkdodo.eu/blog/react-query-as-a-state-manager)** — don't copy server state into another store.
- [TkDodo's blog index in TanStack Query docs](https://tanstack.com/query/v4/docs/framework/react/community/tkdodos-blog) · [separate-server-and-client-state example](https://codesandbox.io/s/separate-server-and-client-state-rp3jx)

### utils / helpers / lib / services

- **[DEV — Why utils & helpers is a dump](https://dev.to/sergeysova/why-utils-helpers-is-a-dump-45fo)** — generic buckets grow unbounded; use named domain libraries with tests.
- [indie-starter.dev — Lib vs Utils vs Services folders](https://indie-starter.dev/blog/lib-vs-utils-vs-services-folders-simple-explanation-for-developers) — "talks to the outside world → lib".
- [Ali Bey — Libs vs Utils vs Services folders](https://medium.com/@a.m.housen/libs-vs-utils-vs-services-folders-simple-explanation-for-developers-0ae961539a0f)
- [Khairul Muhtadin — The role of libs and utils in a Next.js 15 project](https://khaisastudio.medium.com/understanding-the-role-of-libs-and-utils-in-a-next-js-15-project-b1c0368ef044)
- [stephencharlesweiss.com — utils vs helpers](https://stephencharlesweiss.com/utils-vs-helpers/)
- [GitHub issue — What's the difference between helpers and utils?](https://github.com/erikras/react-redux-universal-hot-example/issues/808)
- [DEV — Services vs utils](https://dev.to/moshfiqrony/services-vs-utils-what-is-the-difference-between-services-and-utils-5fh6)
- [DEV — Are utils a code smell?](https://dev.to/noway/are-utils-folder-where-you-put-random-stuff-you-don-t-know-where-to-put-otherwise-a-code-smell-3054)

### Constants, enums, naming

- [Sufle — Naming conventions in React for clean & scalable code](https://www.sufle.io/blog/naming-conventions-in-react) ([Medium mirror](https://medium.com/@sufleio/naming-conventions-in-react-for-clean-scalable-code-f6de31294452))
- [Better Stack — Understanding TypeScript enums](https://betterstack.com/community/guides/scaling-nodejs/typescript-enums/)
- [devoreur2code — TypeScript enums](https://www.devoreur2code.com/blog/typescript-enums)
- [DEV — Naming conventions: the foundation of clean code](https://dev.to/sathishskdev/part-1-naming-conventions-the-foundation-of-clean-code-51ng)
- [Sadeq Shahmoradi — PascalCase or kebab-case in file naming](https://medium.com/@sadeqshahmoradi76/pascalcase-or-kebab-case-best-or-bad-practice-in-file-naming-7382635d517e)
- [Piyush Gambhir — Next.js naming conventions](https://www.piyushgambhir.com/blogs/next-js-naming-conventions)

### Barrel files

- **[Vercel — How we optimized package imports in Next.js](https://vercel.com/blog/how-we-optimized-package-imports-in-next-js)** — 200–800 ms per barrel import; `modularizeImports` / `optimizePackageImports`; 15–70% dev boot improvement.
- **[ReactUse — Barrel files: why index.ts re-exports hurt tree shaking, Next.js dev memory, and tsc (2026)](https://reactuse.com/blog/barrel-files-tree-shaking/)** — the 552 kB → 64 kB chunk case.
- [Steven Lemon — Are TypeScript barrel files an anti-pattern?](https://steven-lemon182.medium.com/are-typescript-barrel-files-an-anti-pattern-72a713004250) — the case *for* barrels as public API.
- [vercel/next.js issue #12557 — tree shaking doesn't work with TS barrel files](https://github.com/vercel/next.js/issues/12557)
- [webpack discussion #16863 — barrel files, tree-shaking and code-splitting](https://github.com/orgs/webpack/discussions/16863)

### Enforcement

- **[eslint-plugin-boundaries](https://www.npmjs.com/package/eslint-plugin-boundaries)** ([README](https://github.com/javierbrea/eslint-plugin-boundaries/blob/master/README.md)) — element types, allowed dependencies, entry-point restrictions.
- [Tim Deschryver — Enforce module boundaries with `no-restricted-imports`](https://timdeschryver.dev/bits/enforce-module-boundaries-with-no-restricted-imports)
- [DEV — Enforcing layers and project boundaries with Nx](https://dev.to/this-is-learning/architects-delight-enforcing-layers-and-project-boundaries-with-nx-2d8o)
- [Steve Kinney — Architectural linting exercise](https://stevekinney.com/courses/enterprise-ui/architectural-linting-exercise)

### Next.js structure and mutations

- **[Makerkit — Next.js 16 App Router project structure: the definitive guide](https://makerkit.dev/blog/tutorials/nextjs-app-router-project-structure)** — `_components`/`_lib` colocation, thin actions (~20-line ceiling), services over actions, Zod-validated config, server/client export separation, explicit do/don't lists.
- **[Makerkit — Server Actions vs Route Handlers](https://makerkit.dev/blog/tutorials/server-actions-vs-route-handlers)** — "human from your UI → action; machine → route handler".
- [Wisp — Route handler vs server action in production](https://www.wisp.blog/blog/route-handler-vs-server-action-in-production-for-nextjs)
- [John Kavanagh — Server Actions vs API routes](https://johnkavanagh.co.uk/articles/when-to-use-server-actions-vs-api-routes-in-nextjs/)
- [vercel/next.js discussion #72919 — Server Actions instead of route handlers for fetching?](https://github.com/vercel/next.js/discussions/72919)
- [DEV — Server Actions vs route handlers (I got this wrong for 3 months)](https://dev.to/whoffagents/nextjs-15-server-actions-vs-route-handlers-when-to-use-each-i-got-this-wrong-for-3-months-49hm)
- **[dharmsy — Next.js 16 App Router folder structure](https://www.dharmsy.com/blog/nextjs-16-app-router-folder-structure)** — "the structure is the architecture"; `_components` per route; logic in `lib/`.
- [groovyweb — Next.js folder structure: best practices for 2026](https://www.groovyweb.co/blog/nextjs-project-structure-full-stack)
- [Aritra Paul — How to organize your Next.js app with the App Router](https://medium.com/@aritrapaulpc/how-to-organize-your-next-js-app-with-the-app-router-best-practices-folder-structures-4bba816df061)
- [TheKitBase — Next.js App Router best practices in 2026](https://thekitbase.app/blog/nextjs-app-router-best-practices-2026)
- [javascriptdoctor — Next.js App Router best practices for production (2026)](https://www.javascriptdoctor.blog/2026/07/nextjs-app-router-best-practices-for.html)
- [Thiraphat — Mastering Next.js App Router: structuring your application](https://thiraphat-ps-dev.medium.com/mastering-next-js-app-router-best-practices-for-structuring-your-application-3f8cf0c76580)
- [CodewithDev — Next.js 15/16 folder structure best practices](https://codewithdev.com/blog/nextjs-folder-struture-best-prctices)

### Layered / Clean Architecture

- **[nikolovlazar/nextjs-clean-architecture — README](https://github.com/nikolovlazar/nextjs-clean-architecture/blob/main/README.md)** — entities/application/infrastructure/interface-adapters, the dependency rule, and its mapping onto Next.js.
- [Sentry — Implementing Clean Architecture in Next.js](https://sentry.io/resources/clean-architecture-nextjs)
- [Hein Htoo — Clean Architecture with Next.js: insights from Lazar Nikolov](https://medium.com/@heinhtoo/clean-architecture-with-next-js-insights-from-lazar-nikolov-developer-advocate-at-sentry-abe1cb4c7ef3)
- [Entekume Jeffrey — Clean Architecture in Next.js 14: a practical guide](https://medium.com/@entekumejeffrey/image-source-the-clean-code-blog-https-blog-cleancoder-com-uncle-bob-2012-08-13-the-clean-arch-c5fa5b84ca10) · [part two](https://medium.com/@entekumejeffrey/clean-architecture-in-next-js-14-a-practical-guide-part-two-3e5d8dbf5a7c)
- [DEV — Why Next.js apps struggle at scale and how feature layers solve it](https://dev.to/behnamrhp/why-nextjs-apps-struggle-at-scale-and-how-feature-layers-solve-it-3d9c)

### Trend surveys (lower confidence, used for direction only)

- [Albert Barsegyan — The best React.js architecture for 2026: domain-driven + FSD](https://medium.com/@albert_barsegyan/the-best-react-js-architecture-for-2026-domain-driven-feature-sliced-design-87f6e25d13fe)
- [Chirag Mehta — How to structure a scalable React project in 2026](https://medium.com/@chiragmehta900/how-to-structure-a-scalable-react-project-in-2026-folder-architecture-guide-5562a6280b1e)
- [dangz.dev — How to structure a React app in 2026](https://dangz.dev/blog/how-to-structure-a-react-app-in-2026)
- [adeptdev.io — React folder structure best practices in 2026](https://www.adeptdev.io/blogs/react-folder-structure-best-practices)
- [DEV — Recommended folder structure for React (2025)](https://dev.to/pramod_boda/recommended-folder-structure-for-react-2025-48mc)
- [DEV — A practical React project structure you can reuse](https://dev.to/fanebytes/a-practical-react-project-structure-you-can-reuse-332e)
- [Srinivas A — React feature-based folder structure](https://medium.com/@Srinivas.A/react-feature-based-folder-structure-4665e39939e9)
