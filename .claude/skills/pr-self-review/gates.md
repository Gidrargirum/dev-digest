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
