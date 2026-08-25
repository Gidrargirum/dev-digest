# Blast Radius

A read-only impact map for a PR's diff: which symbols were declared in the
changed files, who imports or calls them, and which HTTP endpoints (and cron
jobs) might be affected — up to two hops of the reverse import graph. Answers
"what else could this diff touch?" beyond the changed lines themselves. Spans
`@devdigest/shared`, `server/`, `client/` and `mcp/`.

No LLM call is involved anywhere in this feature. Every fact comes from the
repo-intel index (`RepoIntelService`); Blast Radius only reads that index and
shapes a view over it.

## Data source

`repoIntel.getBlastRadius(repoId, changedFiles)` already exists
(`server/src/modules/repo-intel/service.ts`) and does the symbol- and
caller-resolution work described by points 3–4 of the original brief. This
spec does **not** re-implement that method; it fixes two defects in it and
adds the depth-2 endpoint walk, then builds `modules/blast/` as a thin
consumer plus the HTTP route, client tab, and MCP tool around it.

## repo-intel changes

### Per-symbol caller cap (bug fix)

`MAX_CALLERS_PER_SYMBOL` (20) **must** apply per changed symbol, not once to
the combined `callers` array. Today `tryPersistentBlast` does
`callers.slice(0, MAX_CALLERS_PER_SYMBOL)` after sorting the whole list by
`rank` DESC — with two or more changed symbols this silently drops callers of
whichever symbol sorts second. The fix groups `callers` by `viaSymbol` first,
then slices each group to 20, preserving the per-group `rank` DESC order.

This is a direct behavior change to `getBlastRadius()`'s existing default,
applied globally — it also changes what `reviews/run-executor.ts` puts in the
review prompt (potentially more callers per symbol than before). This is
accepted as a bug fix, not gated behind a new parameter.

`BlastResult` gains an opaque way to signal a cap was hit per symbol:

```ts
export interface BlastResult {
  // ...existing fields unchanged...
  /** Symbols whose caller list was truncated to MAX_CALLERS_PER_SYMBOL. */
  truncatedSymbols?: string[];
}
```

### Depth-2 endpoint discovery

Endpoints/crons are currently attributed only from `factsByFile` of direct
symbol callers (hop 1). A route file that imports a *service* which calls the
changed symbol — without calling it directly — is invisible today. The fix
adds hop 2: importers of hop-1 caller files, found via a reverse walk over
`file_edges`.

- New repository method `getImportersOf(repoId, files): Promise<IndexerEdgeRow[]>`
  — `SELECT from_file, to_file FROM file_edges WHERE repo_id = ? AND to_file IN (...)`,
  served by the existing `file_edges_repo_to_idx` index on `(repo_id, to_file)`.
  Do **not** reuse `getEdges` (pulls the entire repo's edge set) for this —
  the targeted query is what the index exists for.
- Walk: hop 1 = `callerFiles` (from `getResolvedCallers`, unchanged). Hop 2 =
  `getImportersOf(repoId, hop1Files)`, deduplicated, excluding files already
  in hop 1 or in `changedFiles`.
- **Width cap: 200 files per hop.** If a hop's importer set exceeds 200 files
  (a hub file like a barrel `index.ts` fans out to most of the repo), take the
  top 200 by `rank` DESC and mark the result `partial` with a reason that
  names the capped hop — never silently truncate without signaling it.
- `getFileFacts` is called for hop-1 ∪ hop-2 files; hop-2 endpoints/crons are
  merged into `factsByFile` the same way hop-1 ones are. `impactedEndpoints`
  becomes the union across both hops.
- Reuse the existing `BFS_DEPTH = 2` constant (`repo-intel/constants.ts`) as
  the depth bound rather than introducing a second one.

### Degraded contract (unchanged shape, now load-bearing for blast)

`getBlastRadius()` already follows the repo-intel degraded contract
(`types.ts` header): `degraded?: boolean` + `reason?: DegradedReason` on the
object, arrays are `[]` when there is nothing. `modules/blast/` **must** rely
on this rather than inventing its own degradation logic — see API contract
below for how it's surfaced to the HTTP caller.

## `modules/blast/` (server)

New module, one import in `modules/index.ts`. Onion layering:

- **infrastructure** (`repository.ts`) — two workspace-scoped Drizzle reads:
  (1) resolve `:id` to a PR row and its `repo_id`, scoped to the caller's
  workspace in the query itself (join `pull_requests` → `repos`); (2)
  `pr_files.path` for that PR id → the changed-files list. No new tables.
- **application** (`service.ts`) — constructor takes `BlastRepository` +
  `RepoIntel` (`container.repoIntel`), never the `Container`. Logic: resolve
  PR + changed files → `repoIntel.getBlastRadius(repoId, changedFiles)` → map
  `BlastResult` into the `BlastRadius` shared contract (group `callers` by
  `viaSymbol` into `downstream[]`, split `factsByFile` endpoints vs crons per
  symbol, compute `summary` as a plain string like `"2 symbols · 14 callers ·
  3 endpoints"` — no model call).
- **entry** (`routes.ts`) — `GET /pulls/:id/blast`, `schema.params: IdParams`,
  `getContext` for tenancy, delegates to the service.
- No new contracts ring additions beyond what's below — the port is
  `container.repoIntel`, already exposed by the composition root.

`modules/blast/` **must not** import `modules/repo-intel/repository.ts`
directly (`.dependency-cruiser.cjs` forbids cross-module imports); it only
sees `RepoIntel` through the container.

## API contract

`GET /pulls/:id/blast` →

| Case | Response |
|---|---|
| `:id` does not resolve to any PR in the database | `404` (`NotFoundError`) |
| `:id` resolves to a PR in a **different** workspace | `404` (`NotFoundError`) — same branch as the row above; a single workspace-scoped lookup returns "not found" for both, so a foreign PR id leaks no more signal than a nonexistent one |
| `:id` resolves to a PR in the caller's workspace, but repo-intel has no usable index for its repo (`getBlastRadius` returns `degraded: true`, or `getIndexState` shows no index) | `200 PrBlastResponse` with `status: 'degraded'`, non-null `reason`, `blast: null` |
| Index exists but a hop-2 width cap was hit (see above) | `200 PrBlastResponse` with `status: 'partial'`, `reason` naming what was capped, `blast` populated with what was computed |
| Full success | `200 PrBlastResponse` with `status: 'ok'`, `reason: null`, `blast` populated |

This deliberately diverges from `modules/intent/routes.ts`, which returns
`{ intent: null }` for both "not computed" and "not in my workspace" to avoid
a 404 signal. Blast Radius does not carry that concern — `NotFoundError` for
tenancy mismatch already matches the convention used elsewhere in this
codebase (e.g. `modules/conventions/routes.ts`'s `startExtract`, where a
single workspace-scoped lookup returns `null` — and thus 404 — for both a
missing repo and one owned by someone else).

**No empty-array masking (point 6 of the original brief):** `blast: null`
happens only on `degraded`. On `partial`, whatever was actually computed is
returned as-is — an empty `downstream[]` on `ok`/`partial` means "genuinely no
callers found," not "we don't know."

### `PrBlastResponse` contract (new, `vendor/shared/contracts/brief.ts`)

```ts
export const BlastStatus = z.enum(['ok', 'partial', 'degraded']);

export const DownstreamImpact = z.object({
  symbol: z.string(),
  callers: z.array(BlastCaller),
  endpoints_affected: z.array(z.string()),
  crons_affected: z.array(z.string()),
  callers_truncated: z.boolean(), // MAX_CALLERS_PER_SYMBOL was hit for this symbol
});

export const PrBlastResponse = z.object({
  status: BlastStatus,
  reason: z.string().nullable(),
  blast: BlastRadius.nullable(),
  counts: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
});
```

`ChangedSymbol`, `BlastCaller`, and `BlastRadius` already exist in
`brief.ts` and are reused unchanged; `DownstreamImpact` gains the
`callers_truncated` field (additive — existing consumers of `PrBrief` are
unaffected). Both vendored copies (`server/src/vendor/shared`,
`client/src/vendor/shared`) **must** be updated together via
`node scripts/sync-shared.mjs`, then verified with `--check`. No field may
carry a Zod `.default()` that the client relies on — the client only imports
`@devdigest/shared` **types**, never the runtime schema, so defaults never
apply there; the server must always emit every field explicitly.

## Client — Blast tab

- `lib/hooks/blast.ts`: `usePrBlast(prId)` — `GET /pulls/:id/blast`, typed via
  `PrBlastResponse` (type-only import from `@devdigest/shared`), `enabled:
  !!prId`, query key `["pr-blast", prId]`.
- `PrDetailHeader` gains a `blast` tab entry (`?tab=blast`, same mechanism as
  the existing tabs — no new state); its badge count uses `counts.symbols`.
- `BlastTab` (new component folder under `_components/`, standard layout:
  `BlastTab.tsx` / `styles.ts` / `constants.ts` / `helpers.ts` / `index.ts` /
  `BlastTab.test.tsx`):
  - Header row with `symbols` / `callers` / `endpoints` / `crons` counts from
    `counts`.
  - Expandable list, one entry per `downstream[]` symbol: symbol name, caller
    count, and when expanded — the caller list (`file:line`, clickable — see
    below), followed by endpoint chips (`endpoints_affected`) and a separate
    cron section (`crons_affected`) when non-empty.
  - `status: 'degraded'` renders `reason` as explanatory text — never an
    empty tree.
  - `status: 'partial'` renders the data it has, plus a visible note built
    from `reason` (e.g. "some callers may be missing — index is partial").
  - Loading / error states follow the same pattern as `FindingsTab`.
- **Out of scope for this iteration** (explicitly deferred, no dead UI for
  them): the "Prior PRs touching these files" section, and the Tree/Graph
  toggle — only the Tree view ships now; no toggle control is rendered.
- `file:line` uses the existing `githubBlobUrl(repoFullName, headSha, file,
  line)` helper (`client/src/lib/github-urls.ts`, already used by
  `FindingCard`) — opens the caller's location on GitHub in a new tab
  (`target="_blank" rel="noopener noreferrer"`). No in-app file viewer exists
  for files outside the diff, so this is the same compromise `FindingCard`
  already makes, not a new gap. The link is disabled/rendered as plain text
  when `repoFullName` is unavailable.
- Styling lives in `styles.ts` as plain `CSSProperties`; `vendor/ui` is not
  modified.

## MCP — `get_blast_radius`

`mcp/src/tools/get-blast-radius.ts` currently returns a stub
(`{ status: 'not_implemented' }`). It becomes a thin client of `GET
/pulls/:id/blast` — no blast-radius logic is duplicated in `mcp/`:

- `resolveRepo(input.repo)` → `resolvePull(repo.id, input.pr)` →
  `api.getBlast(pull.id)` → map the response into the tool's terse output
  shape (flat symbols/callers/endpoints/crons, per
  `docs/agent-prompts/mcp-server-best-practices.md`'s "result, not
  operation" principle).
- `api/client.ts` parses the response with a narrow local Zod schema plus
  `.passthrough()`, matching the file's existing style — the full vendored
  contract is not imported into `mcp/`.
- A `degraded` response maps to a `ToolError`-style message naming the next
  step (e.g. "repo not indexed yet — trigger a resync"), not a hard failure;
  an empty `downstream[]` on `ok` is a normal, successful empty result.
- This changes the tool's declared output schema and `description` in
  `TOOL_DEFINITIONS` — accepted, since the stub never had a useful response
  to begin with.

## Acceptance

- A PR that changes a file declaring two exported functions, each called
  from more than 20 places, returns `downstream[]` with exactly 20 callers
  *per* symbol (40 total across both), each with `callers_truncated: true`.
- A PR whose changed file is only reached by a route handler two hops away
  (route file → service file → changed file) shows that route in
  `endpoints_affected` for the relevant symbol.
- `GET /pulls/:id/blast` for a PR id that does not exist returns `404`.
- `GET /pulls/:id/blast` for a PR id belonging to another workspace returns
  `404`, indistinguishable in shape from the case above.
- `GET /pulls/:id/blast` for a PR in the caller's workspace whose repo has
  never been indexed returns `200` with `status: 'degraded'`, `blast: null`,
  and a non-empty `reason` — never an empty `downstream[]` pretending to be a
  real answer.
- `get_blast_radius` in `mcp/` and the Blast tab in `client/` both render the
  same underlying data for the same PR — neither has its own resolution
  logic.

## Not implemented

- **"Prior PRs touching these files."** Deferred to a follow-up; needs its
  own query (`pull_requests` × `pr_files` on the same paths) and its own
  contract field. No placeholder UI ships for it.
- **Graph view.** The Tree/Graph toggle from the reference design is not
  built in this iteration — only Tree ships, with no dead toggle control.
