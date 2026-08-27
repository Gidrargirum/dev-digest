# Gates — the mechanical half

Cheap, deterministic, no model involved. They run **before** the skill fan-out
because a red `tsc` makes every model finding beneath it noise.

Everything here is an existing repo script. This skill adds no new checker — it
decides *which* ones this diff deserves and reads their exit codes.

## Which gates for which slices

Run a gate only if its package was touched. A server-only branch must not pay
for a client test run.

| Run when | Command | cwd | Fails as |
|---|---|---|---|
| `server/**` or `reviewer-core/**` touched | `pnpm typecheck` | `server` | B4 |
| `server/**` or `reviewer-core/**` touched | `pnpm arch:check` | `server` | B2 |
| `server/**` or `reviewer-core/**` touched | `pnpm arch:ratchet` | `server` | B3 |
| `server/**` touched | `pnpm exec vitest run --exclude '**/*.it.test.ts'` | `server` | B4 |
| `server/src/db/**` or `server/**/*.it.test.ts` touched | `pnpm exec vitest run .it.test` | `server` | B4 |
| `client/**` touched | `pnpm typecheck` | `client` | B4 |
| `client/**` touched | `pnpm lint` | `client` | B4 |
| `client/**` touched | `pnpm test` | `client` | B4 |
| `reviewer-core/**` touched | `npm run typecheck` && `npm test` | `reviewer-core` | B4 |
| `mcp/**` touched | `pnpm typecheck` | `mcp` | B4 |
| `mcp/**` touched | `pnpm test` | `mcp` | B4 |
| any `vendor/shared/**` touched | `node scripts/sync-shared.mjs --check` | repo root | B1 |
| `.claude/skills/**` or `skills-lock.json` touched | `node scripts/check-skills-lock.mjs` | repo root | B10 |

Package managers differ and it matters: `server` and `client` use **pnpm 10**,
`reviewer-core` and `e2e` use **npm**. Running the wrong one installs a second
lockfile and is itself a finding.

`arch:check` also covers `../reviewer-core/src` — that is why a `reviewer-core`
change triggers the server-side arch gates, not just its own.

## Order

1. `sync-shared.mjs --check` — milliseconds, and B1 makes every downstream type
   error meaningless anyway.
2. typechecks.
3. `arch:check`, then `arch:ratchet`.
4. `client` lint.
5. test suites — slowest, last.

Stop early only for B1: if the contracts are out of sync, say so and skip the
rest rather than reporting the cascade it causes.

## Reading the results

- exit 0 → `✅`
- non-zero → `❌`, CRITICAL, with the **first** failing line of output quoted.
  Not the whole log — one line and a count ("+ 23 more errors").
- package untouched → `⏭️ not touched`
- **cannot run** → `⚠️ SKIPPED (<why>)` and the run is **incomplete**.

That last state is the one to get right. Docker absent for the integration lane,
`node_modules` missing, a script throwing — none of those are a pass. An
incomplete run may still reach PASS if nothing else failed, but the report says
so on its own line and the receipt records `"incomplete": true`, so the next
reader knows which parts were never actually checked.

## The integration lane

`pnpm exec vitest run .it.test` needs Docker (testcontainers). It self-skips
without it. Run it only when the diff plausibly touches persistence —
`server/src/db/**`, a repository, or an existing `*.it.test.ts`. For everything
else the unit lane is the honest gate, and the report notes that integration was
not exercised.

## Fingerprint

The receipt's staleness fields come from one place, so the skill and the hook
cannot drift apart:

```sh
node .claude/hooks/pr-self-review-gate.mjs --fingerprint
# → 9f2c1ab…  4d5e6f…      (HEAD sha, worktree hash)
```

The worktree hash covers `git diff HEAD` **and** the untracked file set, so
adding a new unstaged file invalidates a PASS just as editing a tracked one does.
Never compute it by hand.

## Gate cache — do not re-run what already ran on this worktree

The same test suite gets run by more than one agent in a typical
spec-driven cycle: `implementer` (after each pass), `plan-verifier`
(re-verifying), and this skill (the pre-PR gate). Without caching, that is
the same `vitest` run 3-4 times over a worktree that never changed between
them — most of the token cost in that pipeline is repeated gate output, not
new information.

`.claude/pr-self-review/gates-receipt.json` (git-ignored, same directory as
the review receipt) holds the last **actually executed** result for each
gate command, keyed to the fingerprint that was true when it ran:

```json
{
  "head": "9f2c1ab…",
  "worktreeHash": "4d5e6f…",
  "gates": {
    "server:typecheck": "PASS",
    "server:arch:check": "PASS",
    "server:arch:ratchet": "PASS",
    "server:unit": "PASS",
    "server:integration": "SKIPPED (no Docker)",
    "client:typecheck": "PASS",
    "client:lint": "PASS",
    "client:test": "PASS"
  },
  "writtenBy": "implementer"
}
```

**Before running any gate**, an agent with `Read` access checks this file:

1. Compute the current fingerprint (`--fingerprint` above).
2. If it matches the receipt's `head`/`worktreeHash` **and** the gate key is
   present with a `PASS`/`SKIPPED (<why>)` value, cite that cached result
   instead of re-running the command — say so in the report (e.g. "PASS
   (cached from implementer's run, same worktree)").
3. If the fingerprint differs, the key is absent, or the cached value is a
   `FAIL`, run the gate for real. A cached `FAIL` is never trusted as final
   — the whole point of re-running is to see whether it still fails.

**After running a gate for real**, an agent with `Write` access
(`implementer`, this skill) updates the receipt: overwrite `head` /
`worktreeHash` with the fresh fingerprint and set the gate's key to what
actually happened. A stale fingerprint means the *entire* cache is
untrustworthy, not just the gates that changed — overwrite the whole file,
never patch one key onto an old fingerprint.

An agent with no `Write` (`plan-verifier`, `architecture-reviewer`) may
**read and cite** the cache under the same fingerprint-match rule above,
but can never write it — if it needs a gate that was never cached, it runs
the gate itself and reports the result without persisting it. This is fine:
the next `Write`-capable agent in the chain will refresh the cache.

Never hand-write this file, never mark a key `PASS` without having actually
seen the command exit 0 (in this run or a still-matching cached one), and
never widen a cache hit past its literal command — a cached
`server:unit` result says nothing about `server:integration`.
