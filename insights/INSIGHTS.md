# DevDigest — engineering insights (cross-package)

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../AGENTS.md for the session protocol.

## What Works

## What Doesn't Work

## Codebase Patterns

- **2026-08-02** — A field added to `PrMeta` (`server/src/vendor/shared/contracts/platform.ts` + client copy) that's populated by only one endpoint must be `.nullish()`, not `.nullable()`. `PrMeta` is also built by the GitHub import adapter (`server/src/adapters/github/octokit.ts`), test mocks (`server/src/adapters/mocks.ts`), and the PR-detail route — none of these set list-only fields like `score` or `cost_usd`, so `.nullable()` fails `pnpm typecheck` in all three.

- **2026-08-13** — Adding a screen to the sidebar **requires** editing
  `client/src/vendor/ui/nav.ts`, which `pr-self-review` rule B6 marks
  do-not-touch on sight. There is no legal alternative: `vendor/ui/shell/Sidebar.tsx`
  imports `NAV` directly and exposes no prop to inject items, and the precedent
  commit `6b9b35d` added the whole SKILLS LAB section the same way. So B6 as
  written fires on the only possible implementation. Expect the conflict on every
  new screen; the fix belongs in `.claude/skills/pr-self-review/blocking-rules.md`
  (carve out the `NAV`/`SHORTCUTS` arrays, keep the rest of `nav.ts` blocking),
  not in a per-PR `--override`.

## Tool & Library Notes

- **2026-08-12** — Claude Code (checked on v2.1.228) loads `CLAUDE.md` only; it never looks for `AGENTS.md`. The two bridges its docs sanction are a `@AGENTS.md` import inside `CLAUDE.md` and a symlink. This repo picked the symlink (`git mv CLAUDE.md AGENTS.md && ln -s AGENTS.md CLAUDE.md && git add CLAUDE.md` per package dir) because the import form collides with the repo-wide "No `@import` in any `AGENTS.md`" rule. Verify with `git ls-files -s | grep 120000` — five entries; if a `CLAUDE.md` shows up as mode `100644` someone replaced the link with a copy and the two files will silently drift.

- **2026-08-13** — The two vendored `@devdigest/shared` copies had drifted in 5 of 12 files, but the drift was **latent, not live**: everything the client actually imports was identical, and the divergent names (`AgentManifest`, `AgentVersion`, `CommitFilesPayload`, the narrowed `provider` enums in `eval-ci.ts`/`productionize.ts`) had no client consumer. Note `contracts/knowledge.ts` already carried `'openrouter'` on **both** sides — so "the client can't type openrouter" was wrong; it was true only of enums nothing referenced. Before pricing a contract-drift fix as urgent, grep whether the diverged symbol is imported at all. The one-time realignment changed no behaviour: `pnpm typecheck` and all 38 client tests passed unchanged.
- **2026-08-13** — The drift is now mechanical, not cultural: `scripts/sync-shared.mjs` copies server → client (`server/src/vendor/shared` is canonical — `reviewer-core/tsconfig.json` resolves the alias there), `--check` fails on divergence, and `guards.yml` runs it on pushes touching **either** copy. Editing one side alone is now a red build rather than a silent type break. The prose did not follow: root, `server/` and `client/` `AGENTS.md` all still say the copies "have already diverged", which is what a reader hits first and is no longer true — `node scripts/sync-shared.mjs --check` reports 12 files in sync. Trust the script, not the doc.

- **2026-08-13** — `.claude/pr-self-review/` must stay in `.gitignore` for correctness, not tidiness. The receipt that gates `gh pr create` stores a staleness hash from `.claude/hooks/pr-self-review-gate.mjs --fingerprint`, which hashes `git diff HEAD` **plus every untracked file's name and contents** (otherwise a whole new module nobody ran `git add` on escapes the gate). Untrack that directory and the receipt enters its own hash: writing it changes the fingerprint, so a fresh PASS reports itself stale and every PR is blocked. Symptom is a receipt that never validates even one second after being written.

- **2026-08-27** — `.claude/pr-self-review/receipt.json` must be written with **separate `head` and `worktreeHash` string fields**, not a single `"fingerprint": "<head> <worktreeHash>"` line. `pr-self-review-gate.mjs:124` compares `receipt.head` / `receipt.worktreeHash` against a fresh fingerprint; a combined `fingerprint` key leaves both `undefined`, so every `gh pr create` is blocked as "stale" no matter how fresh the review is. The hook's own docstring claims skill and hook "can never disagree" — they do, on the receipt schema. SKILL.md doesn't spell the field names out; copy them from the hook.

- **2026-08-27** — When the session runs under auto-mode / a sandbox classifier, `implementer` and other subagents cannot `Write` to `.claude/pr-self-review/gates-receipt.json` — the write is silently denied by the classifier, so every subagent that runs gates leaves the receipt carrying a stale fingerprint even though the gates were really run and green. Observed 3× in one `/run-plan` session. Not a real failure: the gates were executed and reported in each Implementation Report. The next `/pr-self-review` (which has Write access in the main loop) regenerates the receipt from scratch, so don't chase it mid-run — just note in wrap-up that the receipt is stale-by-tooling and `/pr-self-review` still needs to run.

## Recurring Errors & Fixes

- **2026-08-13** — Never undo a throwaway probe edit with `git checkout -- <file>` in this repo. Its working tree routinely carries large, long-lived **unstaged** work (the pr-self-review session started with ~40 modified files, none staged), so `git checkout --` silently discards the human's edits along with the probe — unstaged content is not in the object database and `git fsck` cannot recover it. Probe on a scratch file under the session scratchpad, or `git stash push -- <file>` before touching a tracked one.

## Session Notes

## Open Questions
