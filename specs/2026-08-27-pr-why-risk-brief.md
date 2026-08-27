# Spec: PR Why + Risk Brief | Spec ID: 2026-08-27-pr-why-risk-brief | Status: draft

## Problem & why

A reviewer opening a pull request today sees an INTENT card (L03), a Blast
Radius card (L04) and a file list, but still has to read the whole diff to
answer the two questions that decide how much attention the PR deserves:
*what does this change and why*, and *where is it most likely to hurt*.
Nothing on the Overview tab ranks the changed files, and nothing states a
single risk level.

This feature adds a **Why + Risk Brief**: one structured, cached, model-authored
summary per PR state — `what`, `why`, `risk_level`, `risks[]` and
`review_focus[]` — computed in the background at import time, surfaced on the
Overview tab, and navigable: a Review Focus entry jumps straight to the
relevant line in the Files Changed tab.

## Goals / Non-goals

Goals:

- One structured LLM call per PR state producing a `PrWhyRiskBrief`.
- Every risk and every review-focus entry grounded in the feature's own input
  set — no invented paths, no invented line numbers, no invented endpoints.
- Deep navigation from a Review Focus entry to a specific line of a specific
  file in the Files Changed tab.
- Caching bound to the PR's state, with a forced-recompute action.

Non-goals — explicitly **not** built by this spec:

- No hunk bodies are sent to the model. Only paths, per-file `additions`/
  `deletions`, and changed line numbers derived server-side.
- `risk_level` **must not** influence the PR score, the review verdict, any
  finding, or the review agent's prompt. It is informational output only.
- No MCP tool. The `mcp/` package is untouched by this feature.
- No executable tests are authored by this spec — `e2e/*.flow.json`, unit and
  integration suites are described under **Verification** and left to the
  implementation plan.
- The existing `PrBrief { intent, blast, risks, history }` contract and the
  `pr_brief` table's current meaning are **not** repurposed. This feature adds a
  new, separate contract.
- No retrieval of "relevant specs" per PR. The Project Context module attaches
  `.md` documents to *agents and skills*, keyed by `agentId` — there is no
  per-PR document retrieval in this codebase, and building one is out of scope.
- No change to how intent (L03) or blast radius (L04) are themselves computed.

## User stories

- **US-1**: as a reviewer, I want a one-glance statement of what this PR changes
  and why, so that I do not have to reconstruct the author's goal from the diff.
- **US-2**: as a reviewer, I want a single colour-coded risk level for the PR, so
  that I can decide how much time this review deserves before opening a file.
- **US-3**: as a reviewer, I want concrete risks tied to real files and lines in
  this PR, so that I can trust them instead of re-verifying every claim.
- **US-4**: as a reviewer, I want a prioritized list of files to look at first,
  each one clickable straight to the relevant line, so that I start where it
  matters instead of at the top of the diff.
- **US-5**: as a reviewer, I want the brief to reflect the PR's current state and
  to be able to force a rebuild, so that a stale brief never misleads me after
  new commits land.
- **US-6**: as a maintainer, I want brief generation to be a background,
  best-effort step, so that it can never block a PR import or a review run.

## Acceptance criteria (EARS)

### Generation and lifecycle

- **AC-1 (US-6) — Verification: server-integration**: WHEN a pull request is
  imported, the system shall enqueue a background brief computation for that PR
  and return the import response without waiting for it to finish.
- **AC-2 (US-6) — Verification: server-integration**: IF brief computation fails
  at any stage — input collection, model call, validation, or persistence —
  THEN the system shall catch the error, persist nothing for that attempt, leave
  any previously persisted brief untouched, and allow the import and any review
  run to complete normally.
- **AC-3 (US-5) — Verification: server-integration**: WHEN a brief is requested
  for a PR whose stored `pr_state_key` equals the PR's current state key, the
  system shall return the stored brief and shall not call the LLM.
- **AC-4 (US-5) — Verification: server-unit**: The system shall derive a PR state
  key from both the PR's `head_sha` **and** a digest of its diff statistics —
  the sorted set of `(path, additions, deletions)` over the PR's changed files.
  A change in either component shall produce a different state key.
  *Rationale (known trap): `GET /pulls/:id` refreshes `body`, `additions`,
  `deletions` and `files_count` from GitHub without updating `head_sha`
  (`server/src/modules/pulls/routes.ts`), so `head_sha` alone would let a
  changed diff keep a stale brief.*
- **AC-5 (US-5) — Verification: server-integration**: WHEN the stored brief's
  state key differs from the PR's current state key, the system shall treat the
  stored brief as stale and recompute it in the background.
- **AC-6 (US-5) — Verification: server-integration**: WHEN the regenerate action
  is invoked for a PR, the system shall recompute the brief unconditionally,
  bypassing the cache even when the state key is unchanged, and shall overwrite
  the stored brief on success only.
- **AC-7 (US-1) — Verification: server-integration**: WHEN a review run completes
  and produces an intent (L03) for a PR whose stored brief was computed without
  one, the system shall recompute the brief in the background so the newly
  available intent is reflected.
- **AC-8 (US-6) — Verification: server-unit**: WHILE a brief computation is
  already in flight for a given PR, the system shall not start a second
  concurrent computation for that same PR; a regenerate request arriving in that
  window shall either join the in-flight computation or be rejected with an
  explicit "already running" response, never silently duplicate the LLM call.

### Inputs and grounding

- **AC-9 (US-3) — Verification: server-unit**: The system shall assemble the
  brief's model input from exactly these sources: the PR's derived intent when
  present, the PR's blast-radius summary when available, diff statistics
  (changed file paths with per-file additions/deletions and the changed line
  numbers), and the linked GitHub issue's title and body when resolvable.
- **AC-10 (US-3) — Verification: server-unit**: The system shall never include
  diff hunk bodies, file contents, or raw patch text in the brief's model input.
- **AC-11 (US-3) — Verification: server-unit**: The system shall obtain the model
  output through a single structured completion call validated against a schema;
  a response failing schema validation shall be treated as a failed attempt
  under AC-2.
- **AC-12 (US-3) — Verification: server-unit**: WHEN the model returns a risk or
  a review-focus entry whose `path` is not a member of the PR's changed-file set
  (or, for a risk, whose referenced endpoint is not a member of the blast-radius
  endpoint set), the system shall drop that entry rather than store it.
- **AC-12a (US-3) — Verification: server-unit**: WHERE a changed file is a
  rename, the system shall admit **both** the old and the new path into the
  grounding validation set, so a model reference to either path is valid; the
  stored entry shall carry the **new** path, so navigation always targets the
  file as it exists after the change.
- **AC-13 (US-4) — Verification: server-unit**: WHEN the model returns a
  review-focus entry whose `line` is not among the changed line numbers derived
  server-side for that file, the system shall either snap the entry to the
  nearest changed line in the same file or drop the entry — it shall not store an
  unverified line number.
- **AC-14 (US-3) — Verification: server-unit**: IF validation drops every risk
  and every review-focus entry, THEN the system shall still store the brief with
  `what`, `why` and `risk_level` and empty arrays, rather than discarding the
  brief entirely.
- **AC-15 (US-2) — Verification: server-unit**: The system shall accept
  `risk_level` only from the closed set `high | medium | low`; any other value
  shall fail validation under AC-11.
- **AC-16 (US-3) — Verification: server-unit**: The system shall cap the stored
  arrays at `MAX_RISKS = 8` risks and `MAX_REVIEW_FOCUS = 6` review-focus
  entries, truncating the model's output when it exceeds them, and shall record
  the pre-truncation counts so the UI can state how many were withheld.
- **AC-36 (US-3) — Verification: server-unit**: The system shall describe at most
  `MAX_INPUT_FILES = 40` files individually in the model input, selecting them by
  `additions + deletions` descending, and shall represent the remainder as a
  single aggregate line stating the count of omitted files and their total
  changed lines. The grounding validation set (AC-12, AC-12a, AC-13) shall be
  built from **all** changed files, not only the described ones — a grounded
  reference to a file outside the top 40 must not be dropped.

### Degradation of inputs

- **AC-17 (US-1) — Verification: server-integration**: WHERE no intent has been
  derived for the PR yet, the system shall still produce a brief from the
  remaining sources and shall record which sources contributed.
  *This is the normal path for the first, import-time brief: intent is only
  produced as a side effect of a review run.*
- **AC-18 (US-1) — Verification: server-integration**: WHERE the blast radius is
  unavailable or degraded, the system shall still produce a brief from the
  remaining sources, and no risk may cite an endpoint (there is no endpoint set
  to validate against).
  *Also the normal path on this branch: the repo-intel blast radius is currently
  always degraded until the index carries persistent rank/decl data.*
- **AC-18a (US-6) — Verification: server-unit**: The system shall consume a blast
  summary only when one is already available; it shall never trigger a
  blast-radius computation and shall never wait on one. An unavailable blast
  summary is an omitted input (AC-18), not a reason to delay or fail the brief.
- **AC-19 (US-1) — Verification: server-integration**: IF no linked issue can be
  resolved, THEN the system shall omit that source without failing the brief.

### API contract

- **AC-20 (US-1) — Verification: server-integration**: WHEN a brief is requested
  for a PR that has none, the system shall respond `200` with an explicit
  "no brief" payload rather than `404`, matching the intent endpoint's
  convention.
- **AC-21 (US-5) — Verification: server-integration**: The system shall expose
  brief regeneration as its own explicit action rather than a `force` query flag
  on the read path, matching the repository's existing recompute convention
  (`POST /pulls/:id/review`, `/repos/:id/refresh`, `/repos/:id/resync`).
- **AC-38 (US-5) — Verification: server-integration**: The system shall limit
  manual regeneration to `MAX_REGEN = 3` requests per minute **per pull
  request**, and IF that budget is exhausted, THEN it shall respond `429` with a
  `Retry-After` header stating when the next slot frees. Background recomputes
  (import-time, new-state, post-review-run) shall not consume this budget.
- **AC-22 (US-6) — Verification: server-integration**: The system shall scope
  every brief read and write to the requesting workspace; a PR belonging to
  another workspace shall be indistinguishable from a non-existent PR.
- **AC-23 (US-1) — Verification: architecture-review**: The system shall define
  `PrWhyRiskBrief` and its response wrapper as new contracts, leaving the
  existing `PrBrief` contract unchanged, and shall keep the `server/` and
  `client/` vendored copies of the shared contract byte-identical.

### UI

- **AC-24 (US-1) — Verification: client**: The Overview tab shall render a
  Why + Risk Brief card containing `what`, `why`, the `risk_level` indicator and
  the Review Focus block, and shall not render a second copy of `risks[]`.
- **AC-25 (US-3) — Verification: client**: The Intent block shall be the only
  place `risks[]` is rendered, each risk shown as its title plus its
  `path:line` reference, positioned below the existing intent quote, In scope and
  Out of scope sections.
- **AC-26 (US-2) — Verification: client**: The card shall distinguish `high`,
  `medium` and `low` by colour **and** by a non-colour cue (label or icon), so
  the level is readable without colour perception.
- **AC-27 (US-4) — Verification: client**: WHEN a reviewer activates a Review
  Focus entry, the system shall navigate to the Files Changed tab with the
  target file and line addressed in the URL, in a single navigation that also
  preserves the page's other URL parameters.
- **AC-28 (US-4) — Verification: client**: WHEN the Files Changed tab is opened
  with a file-and-line target, the system shall scroll the addressed line into
  view and visually mark it as the target.
- **AC-29 (US-4) — Verification: client**: IF the addressed line cannot be
  resolved in the rendered diff — the file's patch is absent, or the line falls
  outside every rendered hunk — THEN the system shall fall back to scrolling the
  target file's card into view and indicate that the exact line is unavailable,
  never leaving the tab at an arbitrary scroll position.
  *Precedent: the smart-diff finding chip already has an "unanchored" fallback
  rendered in the file card footer.*
- **AC-30 (US-5) — Verification: client**: The card shall expose a regenerate
  control that is disabled while a regeneration is in flight and that refreshes
  the card's data on completion.
- **AC-35 (US-3) — Verification: client**: WHERE the stored arrays were truncated
  under AC-16, the UI shall state how many entries are shown out of how many the
  model produced — in the Review Focus block for `review_focus[]`, and in the
  Intent block for `risks[]` — so neither list reads as exhaustive.
- **AC-37 (US-5) — Verification: client**: WHEN a newer brief becomes available
  while the reviewer has an older one on screen, the system shall surface an
  unobtrusive "brief updated" notice with an explicit refresh action and shall
  **not** replace the displayed brief in place; the reviewer decides when the
  content changes under them.
- **AC-39 (US-5) — Verification: client**: WHILE the manual regeneration budget
  (AC-38) is exhausted, the regenerate control shall be disabled and shall show
  the time remaining until the next slot. This state shall be distinct from the
  in-flight disabled state of AC-30, and the client shall treat the server's
  `429`/`Retry-After` as authoritative rather than relying on its own counter
  alone.
- **AC-31 (US-1) — Verification: client**: WHILE the brief request is in flight
  and no brief has been rendered yet, the card shall show a skeleton placeholder.
- **AC-32 (US-1) — Verification: client**: IF the brief request fails, THEN the
  card shall show an error state with a retry action, rather than disappearing
  or showing an empty card.
- **AC-33 (US-1) — Verification: client**: WHERE no brief exists yet for the PR,
  the card shall show an explicit "not generated yet" state offering the
  regenerate action — not a silent absence, because unlike intent this feature
  has a user-invocable way out of that state.
- **AC-34 (US-3) — Verification: client**: The client shall reach brief data only
  through a dedicated hook in the client's hooks layer and shall type it from the
  shared contract, never redeclaring the shape locally and never calling `fetch`
  from a component.

## Edge cases

- PR imported with zero changed files, or with every file's patch absent — the
  changed-file set and changed-line set are empty, so every risk and
  review-focus entry is dropped by AC-12/AC-13 and AC-14 applies.
- A renamed file: the model cites the old path — accepted, because both paths are
  in the validation set, and the stored entry carries the new path (AC-12a).
- Very large PR (hundreds of files): only the 40 largest by changed lines are
  described individually; the rest appear as one aggregate line, while grounding
  still validates against every changed file (AC-36). A grounded reference to an
  undescribed file therefore survives.
- Two regenerate clicks in quick succession → AC-8 (no duplicate LLM call), and
  a burst beyond three per minute → AC-38/AC-39.
- A regenerate that succeeds while the reviewer is reading the previous brief:
  a "brief updated" notice appears, the content does not change until the
  reviewer refreshes (AC-37).
- Force-push rewriting history: `head_sha` changes, state key changes,
  background recompute follows (AC-5).
- Diff refreshed from GitHub without a new `head_sha` (the trap behind AC-4):
  the diff-statistics digest changes, so the state key still changes.
- Review run produces an intent *while* an import-time brief computation is
  still in flight → AC-8 plus AC-7 must not deadlock or lose the recompute.
- Model returns a `review_focus` entry for a real file but with `line: 0` or a
  negative line → AC-13.
- A PR whose linked issue lives in another repository — the intent module
  already recognizes but never fetches cross-repo issues; the brief must treat
  it as an unresolvable issue (AC-19), not attempt the fetch.

## Non-functional

- **Cost/latency containment — Verification: server-unit**: exactly one LLM call
  per computation; the call carries a timeout and the feature's own model
  selection, and its tokens/cost are attributed to the brief, not to a review
  run.
- **Rate limiting — Verification: server-integration**: manual regeneration is
  limited to 3 requests per minute per pull request (AC-38); background
  recomputes are exempt. The client mirrors, but does not replace, this server
  state (AC-39).
- **Accessibility — Verification: manual-qa**: the risk level is conveyed by more
  than colour (AC-26); each Review Focus entry is reachable and activatable by
  keyboard with an accessible name that includes the file path.
- **Layering — Verification: architecture-review**: the brief use case lives in
  the application ring and depends on ports, not concrete adapters; the LLM
  provider, the GitHub client and persistence reach it by injection through the
  single composition root. `reviewer-core/` performs no I/O for this feature.

## Inputs (provenance)

| Input | Provenance |
|---|---|
| Derived intent (`intent`, `in_scope`, `out_of_scope`, `risk_areas`) | [reused: L03] persisted per `(pr_id, head_sha)`; may be absent |
| Blast-radius summary + affected endpoints | [reused: L04] computed on demand from the repo-intel index; frequently degraded |
| Changed file paths, per-file additions/deletions | [deterministic: DB rows for the PR's files, originally from GitHub] |
| Changed line numbers per file | [deterministic: parsed server-side from the stored patch; the parse result is an input, the patch text is not] |
| Linked issue title/body | [untrusted: GitHub] resolvable same-repo issues only |
| PR title/body | [untrusted: GitHub] |
| PR state key | [deterministic: `head_sha` + digest of diff statistics] |
| Feature model choice | [deterministic: the workspace's feature-model registry entry for the brief feature] |

## Untrusted inputs

The PR title, PR body, linked issue title/body and file paths all originate
outside this system's control, and the model output is itself untrusted content
derived from them.

- Every untrusted source shall be wrapped as untrusted content using the
  repository's single existing wrapping primitive before it reaches the model,
  each with its own source label, exactly as the intent module already does.
  Denylists, regex scanning or keyword filtering of untrusted text are forbidden
  by repository convention — the shared injection guard is the only defence.
- The model's own output shall not be trusted for grounding: `path`, `line` and
  endpoint references are validated against server-derived sets (AC-12, AC-13)
  before storage, so injected text cannot cause the UI to link at an arbitrary
  path.
- `risk_level` shall be constrained to a closed enum (AC-15) rather than rendered
  as free text.
- Brief text is rendered as text by the client's escaping default; it shall not
  be passed to any raw-HTML rendering path.
- The brief endpoints are workspace-scoped (AC-22); a PR id from another
  workspace must not disclose whether it exists.

## Module interactions

```mermaid
sequenceDiagram
  participant GH as GitHub
  participant SRV as server (brief use case)
  participant INT as server intent (L03)
  participant BL as server blast (L04)
  participant LLM as LLM provider (port)
  participant DB as Postgres
  participant CL as client (Overview)

  Note over SRV: triggered in background on PR import
  SRV->>DB: read changed files (paths, +/-, patch → line numbers)
  SRV->>INT: read derived intent (may be null)
  SRV->>BL: read blast summary (may be degraded/null)
  SRV->>GH: fetch linked issue (optional)
  GH-->>SRV: issue title/body — untrusted
  SRV->>LLM: one structured call (no hunk bodies)
  LLM-->>SRV: Brief candidate — untrusted
  SRV->>SRV: validate paths/lines/endpoints against input sets
  alt validation + persistence succeed
    SRV->>DB: store brief + pr_state_key
  else any failure
    Note over SRV,DB: nothing persisted; import/review unaffected
  end
  CL->>SRV: read brief
  SRV-->>CL: brief, or explicit "none yet" (200)
  CL->>CL: Review Focus click → Files Changed tab, line anchor
```

- **client ↔ server** — read the brief; trigger regeneration. Direction:
  client → server only. Server slow/unavailable → card shows error + retry
  (AC-32); server returns "none yet" → card shows the not-generated state
  (AC-33).
- **server brief use case ↔ intent (L03)** — read-only, in-process. Intent
  absent is a normal state (AC-17), never an error.
- **server brief use case ↔ blast (L04)** — read-only, in-process, and
  **consume-only**: the brief uses a blast summary if one is already available
  and never triggers or awaits a blast computation (AC-18a). Blast is itself
  computed on demand with no cache, and is degraded in practice on this branch,
  so "no blast summary" is the normal path (AC-18), not an error path.
- **server ↔ GitHub** — outbound issue fetch through the existing client port;
  failure or cross-repo reference degrades to "no issue" (AC-19).
- **server ↔ LLM provider** — one structured call through the existing port;
  timeout, schema-validation failure or provider error all route to AC-2.
- **server ↔ Postgres** — brief storage keyed to the PR with its state key.
  The existing `pr_brief` table holds a single JSON column and carries no state-key
  column, so this feature's storage needs a state-key column of its own; it must
  not silently overload the existing table's meaning (AC-23's spirit).
- **client Overview card ↔ client diff viewer** — a new addressable-line
  capability is required in the diff viewer. Today no diff line carries an
  addressable anchor and no URL parameter targets a file/line; the existing
  finding chip navigates in the opposite direction (diff → findings tab). This
  is new surface, not reuse, and it is shared between two areas of the page —
  so the addressing convention belongs at the shared layer, not inside the
  brief card.

## Proposed UX improvements

Proposals, not decisions — none of these were in the described design:

- **Show the brief's freshness.** A brief computed at import time from diff
  stats alone reads identically to one computed after a review run with a full
  intent. Displaying which sources contributed (and when it was generated) tells
  the reviewer how much to trust it, and closes the gap where AC-17/AC-18
  degradation is invisible.
- **Mark visited Review Focus entries.** The block is a worklist; a reviewer
  returning to Overview mid-review currently cannot tell which entries they have
  already opened.
- **Make the regenerate button state-aware.** When the stored state key no
  longer matches the PR, labelling the control "Out of date — regenerate"
  turns a manual guess into an informed action.

## Traceability

| User story | Acceptance criteria |
|---|---|
| US-1 | AC-7, AC-17, AC-18, AC-19, AC-20, AC-23, AC-24, AC-31, AC-32, AC-33 |
| US-2 | AC-15, AC-26 |
| US-3 | AC-9, AC-10, AC-11, AC-12, AC-12a, AC-14, AC-16, AC-25, AC-34, AC-35, AC-36 |
| US-4 | AC-13, AC-27, AC-28, AC-29 |
| US-5 | AC-3, AC-4, AC-5, AC-6, AC-21, AC-30, AC-37, AC-38, AC-39 |
| US-6 | AC-1, AC-2, AC-8, AC-18a, AC-22 |

## Verification

No executable tests are authored by this spec. The lanes referenced above map to
`TESTING.md` as follows, and the implementation plan owns the actual test design:

- **server-unit** — state-key derivation, grounding validation (path/line/
  endpoint, including rename dual-path), enum and cap enforcement, input file
  selection and the top-40 cut with full-set validation, input assembly excluding
  hunk bodies, blast consume-only behaviour.
- **server-integration** — background trigger on import, cache hit/miss,
  forced regeneration, regeneration rate limit and `429`/`Retry-After`, failure
  isolation, workspace scoping, "none yet" response.
- **client** — card states (loading/error/none/rendered), risk-level rendering,
  risks appearing only in the Intent block, truncation counts, Review Focus
  navigation building the correct URL, the "brief updated" notice instead of an
  in-place swap, and the two distinct disabled states of the regenerate control.
- **e2e** — one browser flow: open a PR's Overview, assert the brief card and its
  risk level, click a Review Focus entry, assert the Files Changed tab opens with
  the target line in view; plus the unanchored fallback (AC-29) against seed data
  whose patches are absent.
- **manual-qa** — the non-colour risk cue and keyboard reachability.
- **architecture-review** — contract additivity, vendored-copy parity, and ring
  placement of the brief use case.

## Tunable constants

| Constant | Value | Set by |
|---|---|---|
| `MAX_RISKS` | 8 | AC-16 |
| `MAX_REVIEW_FOCUS` | 6 | AC-16 |
| `MAX_INPUT_FILES` | 40 | AC-36 |
| `MAX_REGEN` | 3 per minute per PR | AC-38 |
