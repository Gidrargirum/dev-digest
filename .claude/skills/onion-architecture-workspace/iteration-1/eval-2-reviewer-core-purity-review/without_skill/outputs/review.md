# Architecture review — `reviewer-core/src/severity-enrich.ts`

**Verdict: does not belong in `reviewer-core/src/` as written.** The intent
(a second pass that nudges finding severity using repo churn signals) is a
legitimate domain concern, but every input it needs is fetched by the module
itself through I/O, and it reaches *outward* into `server/`. It must be reduced
to a pure function and all data acquisition must move to `server/`.

## Rule violations

### 1. Inward dependency rule broken — domain imports the outer ring
```ts
import { RepoIntelRepository } from '../../server/src/modules/repo-intel/repository.js';
```
`reviewer-core/` is the inner ring; `server/` is the outer ring that *consumes*
it. This import reverses the dependency arrow and creates a cycle
(`server → reviewer-core → server`). It also drags Drizzle/Postgres transitively
into the pure package. `pnpm arch:check` (dependency-cruiser) should reject the
`../../server` path outright. This is the critical finding.

### 2. Database I/O in the domain
`new RepoIntelRepository()` + `await intel.hotFilesForRepo(input.repoId)` runs a
DB query from inside the review engine. The domain must not touch persistence;
repositories live in the outer ring and are invoked before the domain runs.

### 3. Network I/O in the domain
The `fetch` to `https://api.github.com/...` makes the domain a network client
and couples it to GitHub. External-system calls belong in an infrastructure
adapter in `server/`.

### 4. Filesystem I/O + import-time side effect
```ts
const rubric = JSON.parse(readFileSync(join(__dirname, 'config', 'severity-rubric.json'), 'utf8'));
```
Reads a file from disk at module load. This is I/O in the domain, a hidden
side effect on import, throws during import if the file is missing, depends on
`__dirname` (CJS-only) and on the on-disk layout of the built package.
Configuration must be passed in, already parsed.

### 5. Secret / environment access in the domain
`process.env.GITHUB_TOKEN` — the domain reads a secret straight from the
environment. Per repo conventions secrets come from `SecretsProvider` in
`server/`; the domain should never see env at all.

### 6. Not pure / not deterministic
Consequences of 2–5: the function is `async`, non-deterministic, and cannot be
unit-tested without mocking `fetch`, the filesystem, and a DB class. The stated
purpose of `reviewer-core/` is a pure `diff → prompt → LLM → findings` engine.

## How to restructure

**Domain (`reviewer-core/src/`):** a synchronous pure function over data.

```ts
// reviewer-core/src/severity-enrich.ts
export interface SeverityEnrichContext {
  rubric: Record<string, number>;   // category -> base bump
  hotFiles: string[];               // churn-hot paths for this repo
  changedFileCount: number;         // PR size signal
}

export function enrichSeverity(
  findings: Finding[],
  ctx: SeverityEnrichContext,
): Finding[] {
  return findings.map((f) => {
    const base = ctx.rubric[f.category] ?? 0;
    const hot = ctx.hotFiles.includes(f.file) ? 1 : 0;
    const scale = ctx.changedFileCount > 40 ? 1 : 0;
    return { ...f, severityScore: f.severityScore + base + hot + scale };
  });
}
```

No `fs`, no `fetch`, no `process.env`, no import of `server/`, no `async`.

**Application/orchestration (`server/`):** the composition root / review
service gathers the three inputs and calls the domain function:

- `rubric` — load and parse the JSON once at startup (config loader in
  `server/`), or fold it into existing review config; inject the object.
- `hotFiles` — call `RepoIntelRepository.hotFilesForRepo(repoId)` where the
  repository already lives, in `server/`.
- `changedFileCount` — obtain from the existing GitHub client / PR import
  adapter in `server/` (the PR metadata is almost certainly already fetched
  during import; reuse it rather than issuing a fresh authenticated call).

Then `const enriched = enrichSeverity(findings, { rubric, hotFiles, changedFileCount })`.

**If `reviewer-core` must own the sequencing** (call order between the LLM pass
and the enrich pass), express the dependencies as *ports* (interfaces declared
in `reviewer-core`) — e.g. `HotFilesPort`, `PullMetaPort` — and have `server/`
supply adapter implementations through the DI container. The interfaces point
inward; the concrete DB/GitHub code stays in `server/`. Passing plain data
(the first option) is simpler and preferred unless ordering genuinely forces
the port approach.
