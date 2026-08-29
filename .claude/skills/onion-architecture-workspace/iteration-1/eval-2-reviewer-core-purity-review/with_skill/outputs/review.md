# Architecture review — `reviewer-core/src/severity-enrich.ts`

**Verdict: does not belong in `reviewer-core/`.** As written it breaks the
dependency rule, the purity rule, the inversion rule, and the single-composition-root
rule. The *pure* part of the idea (nudge a finding's severity from churn signals)
is legitimate domain logic, but every input it needs must be resolved by the
caller and handed in. In its current form it must not merge.

## Rule violations

### 1. Domain imports infrastructure of the outer package (direction — SKILL rule 1)

```ts
import { RepoIntelRepository } from '../../server/src/modules/repo-intel/repository.js';
```

`reviewer-core/` may not import anything from `server/src` except `vendor/shared`
(SKILL "The four rules" #1; decision-tree import table row `reviewer-core → repository = ✗`).
This is the innermost ring reaching into the outermost-but-one ring. Because
`server/` consumes `reviewer-core/` as source through a path alias, this also
creates a **module cycle** (`server → reviewer-core → server`), which
dependency-cruiser reports as `no-circular`. `pnpm arch:check` fails on this.

### 2. Concrete class instantiated outside the composition root (inversion + one root — rules 2 & 4)

```ts
const intel = new RepoIntelRepository();
```

Only `platform/container.ts` may name concrete classes (SKILL rule 4; stack-rules
"The DI container"). The domain must depend on an injected interface, never
`new` a persistence class — and never a *repository* at all: even inside
`server/`, cross-module access goes through the module's **service**, not its
`repository.ts` (anti-patterns #7, decision-tree). Here it's doubly wrong: wrong
ring *and* reaching past the service.

### 3. Filesystem I/O in the domain, at import time (purity — rule 3, anti-pattern #9)

```ts
const rubric = JSON.parse(readFileSync(join(__dirname, 'config', 'severity-rubric.json'), 'utf8'));
```

`node:fs` / `node:path` in the domain ring — explicitly the "just reading a config
file once at import" case anti-patterns #9 calls out. It breaks hermetic
`reviewer-core` tests (no keys, no network, no disk) and makes the engine
unusable outside `server/`. `__dirname` also does not exist in ESM, so this is a
runtime break as well.

### 4. Network I/O in the domain (purity — rule 3)

```ts
const diffRes = await fetch(`https://api.github.com/repos/.../pulls/${input.pullNumber}`, ...);
```

`reviewer-core` is `diff → prompt → LLM → findings`; its only side effect is the
injected `LLMProvider` (SKILL rule 3). A GitHub call belongs behind the
`GitHubClient` port in `vendor/shared/adapters.ts`, implemented by an adapter in
`server/src/adapters/**`, wired in the container. A raw `fetch` here is a
`wrapper masquerading as… no wrapper at all`.

### 5. Secret / env read in the domain (purity — rule 3, CLAUDE.md secrets rule)

```ts
authorization: `Bearer ${process.env.GITHUB_TOKEN}`
```

Env reads are I/O and forbidden in the domain. Secrets in this repo come from
`SecretsProvider` (`~/.devdigest/secrets.json`), resolved lazily in the container
when the GitHub adapter is constructed — never `process.env` in business code,
least of all in `reviewer-core`.

### 6. Inputs are identifiers, not resolved values (rule 3 corollary)

The function leans on `input.repoId`, `input.owner`, `input.repo`,
`input.pullNumber` to then go fetch things. SKILL rule 3: *"Inputs are resolved
strings, not identifiers."* The core should receive the churn list and the
changed-file count already computed, not the ids needed to compute them.

## How to restructure

**Split into a pure domain function + an application-ring orchestration step.**

1. **Domain (`reviewer-core/src/severity-enrich.ts`)** — keep only pure scoring:

   ```ts
   export interface SeverityEnrichInput {
     hotFiles: readonly string[];
     changedFileCount: number;
   }

   export function enrichSeverity(
     findings: Finding[],
     { hotFiles, changedFileCount }: SeverityEnrichInput,
   ): Finding[] {
     return findings.map((f) => {
       const base = SEVERITY_RUBRIC[f.category] ?? 0;
       const hot = hotFiles.includes(f.file) ? 1 : 0;
       const scale = changedFileCount > CHANGED_FILES_HOT_THRESHOLD ? 1 : 0;
       return { ...f, severityScore: f.severityScore + base + hot + scale };
     });
   }
   ```

   No `async` (no I/O left). The rubric becomes a plain TS literal module
   (`severity-rubric.ts`) bundled in `reviewer-core` — not a JSON file read via
   `fs`. Feed `hotFiles`/`changedFileCount` either through these params or by
   adding resolved fields to `ReviewInput`; if via `ReviewInput`, they must be
   optional prompt-independent slots so "feature off" leaves the pipeline
   unchanged (stack-rules "reviewer-core").

2. **Port** — `changed_files` comes from the existing `GitHubClient` port
   (`vendor/shared/adapters.ts`); add `getPullMeta(repo, number): Promise<{ changedFiles: number }>`
   if it isn't already covered. Churn comes from the **repo-intel module's
   service** (or a `CodeIndex`/repo-intel port), not its repository.

3. **Application (`server/src/modules/<reviews>/service.ts`)** — the orchestration
   that this file is really doing lives here: call the repo-intel service for hot
   files, call the `GitHubClient` port for the pull meta, then invoke the pure
   `enrichSeverity(findings, { hotFiles, changedFileCount })`. The service takes
   these as injected ports (SKILL rule 4 example), assembled by the container.

4. **Adapter + container** — GitHub token resolution stays in the Octokit adapter
   via `SecretsProvider`, constructed lazily in `platform/container.ts`, with a
   `ContainerOverrides` entry so the service test can stub it.

Net: `reviewer-core` keeps a hermetic, synchronous, dependency-free function;
`server/` owns the fetching and wiring. `pnpm arch:check` goes green.
