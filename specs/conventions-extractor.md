# Conventions extractor

Extracts a repository's house coding conventions, has a human accept or reject
each one, and merges the accepted set into a single `<repo>-conventions` skill
that can be attached to a review agent. Spans `@devdigest/shared`, `server/` and
`client/`.

The governing rule of the whole feature: **the model proposes, code decides.**
A candidate is a claim until code has found its evidence in the clone and
counted how well it holds. This mirrors the review engine, where grounding is
mandatory and the model's self-reported score is discarded.

## Contract

- `ConventionCandidate` (`contracts/knowledge.ts`) **must** carry `category`,
  `evidence_line`, `evidence_end_line`, `support`, `violations`, `origin` and
  `status`. `status` is `pending | accepted | rejected` — a boolean `accepted`
  cannot express a rejection, which is the state a re-scan most needs to know.
- `confidence` **must** be a measured value: `support / (support + violations)`
  for `origin: 'model'`, exactly `1` for `origin: 'config'`. The model's own
  number **must** be stored as `model_confidence` and **may not** be shown in
  the UI or used for ordering.
- `ConventionScan.candidates_raw` **must** count what the model proposed, before
  the gate; `candidates_kept` counts what survived. `raw > kept` is the normal
  case, not an anomaly.
- `ConventionsPage.scan` **must** be `null` before a repo's first scan — never a
  synthetic zeroed scan.
- Both vendored copies of the contract (`server/src/vendor/shared`,
  `client/src/vendor/shared`) **must** be edited together; the server copy is
  canonical and `node scripts/sync-shared.mjs` propagates it.

## Sampling

1. Sample selection **must** be pure code — no model call decides which files
   exist. Config files come from a fixed list; source files come from
   `repoIntel.getConventionSamples(repoId, n)`.
2. An unindexed repo **must not** fail the scan. `repo-intel` degrades to `[]`
   (its documented contract), and the scan **must** still complete `done` with
   whatever the config files yielded.
3. Config-derived rules **must** be emitted without any model call, with
   `origin: 'config'` and `confidence: 1`.

## Verification gate

These rules run on every model-proposed candidate and are not removable — they
are what separates this feature from a rumour generator.

1. A candidate whose `evidence_path` is absent from (or empty in) the clone
   **must** be dropped.
2. Snippet matching **must** be whitespace-insensitive and multi-line. If the
   snippet is present but on a different line than claimed, the line **must** be
   repaired and the candidate kept — a correct rule **may not** be discarded
   over an off-by-three line number.
3. A candidate whose snippet is nowhere in the file **must** be dropped.
4. Confidence **must** be measured by running the model's `positive_pattern` and
   `counter_pattern` over the clone. A pattern that cannot be counted **must**
   drop the candidate, never be treated as zero — a `counter_pattern` silently
   counted as zero violations would award a perfect confidence precisely
   because the check failed.
5. Model-supplied input is untrusted and **must** be gated before it reaches the
   filesystem or a subprocess: an `evidence_path` that escapes the clone is
   rejected, and a regex that is absurdly long, uncompilable, ReDoS-shaped, or
   starts with `-` (ripgrep flag smuggling) is refused. Repository file content
   fed to the model **must** be wrapped as untrusted, per the review engine's
   one-guard convention.
6. A candidate with `support < MIN_SUPPORT` **must** be dropped — one occurrence
   is a coincidence, not a convention.
7. A candidate whose normalized rule hash matches one already **accepted or
   rejected** for that repo **may not** be proposed again. A still-`pending`
   candidate **must not** enter that set — otherwise a re-scan filters out
   exactly what it just re-derived and leaves the user with nothing.
   Editing a rule **must** recompute its hash, or the edited text is re-proposed
   while an unrelated rule is suppressed.
8. At most `MAX_CANDIDATES_PER_CATEGORY` candidates of one category survive,
   highest confidence first.
9. Every drop, repair and cap **must** be reported on the scan's event stream
   with its reason. The pipeline **may not** go silent about what it discarded.

## Execution

- `POST /repos/:id/conventions/extract` **must** return `202` with a `scan_id`
  before any model call, so the UI can subscribe to the scan's events without a
  race.
- One failed extraction batch **must not** fail the scan; the remaining batches
  still contribute.
- A re-scan **must** replace the previous scan's still-`pending` candidates in
  ONE transaction, and **must not** touch accepted or rejected ones. A failed
  insert **may not** leave the user with an empty list.
- The scan event stream **must** verify the scan belongs to the caller's
  workspace and to the repo in the path — the bus is keyed by a bare uuid.
- `POST …/extract` **must** 404 for a repo outside the workspace, before any
  scan row is written.

## Skill assembly

- The skill body **must** be assembled deterministically in code. It **may not**
  be generated by a model call: the user approved that exact text, and a rewrite
  would reintroduce claims they rejected.
- The created skill **must** have `type: 'convention'`, `source: 'extracted'`,
  and `evidence_files` set to the deduplicated evidence paths.
- Each source convention **must** be stamped with the resulting `skill_id`.
- Every requested convention id **must** resolve within the same repo and
  workspace. A partially resolving set **must** be refused, never silently
  built from the subset that matched.
- The body **must** cite the *repaired* `file:line`, never the line the model
  originally claimed.

## UI

- Card order **must** be `pending → accepted → rejected`, and within a group by
  `confidence` descending.
- Confidence **must** be rendered as text as well as a bar; colour **may not**
  be the only carrier of meaning (WCAG AA).
- `Create skill` **must** be disabled while nothing is accepted.
- Editing a rule **must not** reset its accept/reject decision.
- A finished scan with zero candidates **must** get its own empty state naming
  the likely cause (repo not indexed), distinct from the never-scanned state.

## Acceptance

- A scan against a repo with no index finishes `done`, reports 0 model
  candidates, still returns the config-derived rules, and records no error.
- A candidate citing a file that is not in the clone never reaches the UI, and
  the reason appears in the scan's event stream.
- A candidate whose snippet is real but whose line number is wrong appears with
  the corrected line, and the generated skill cites the corrected line.
- Accepting three candidates and creating the skill produces one skill in the
  Skills Lab whose body has three sections with `file:line` citations; a
  re-scan afterwards proposes none of those three again.
