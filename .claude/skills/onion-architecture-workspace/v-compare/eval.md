# A/B — onion-architecture OLD vs NEW

**Change under test:** the NEW skill adds a "Module ownership — one module, one
aggregate" section to `SKILL.md`, anti-pattern **§11 "Cross-module data reach-in
— writing another module's table"**, a `decision-tree.md` line, and a
quick-review checkbox. The OLD skill (snapshot in `skill-OLD/`) has none of this;
its closest coverage is anti-pattern §7, which is about cross-module *imports*.

**Baseline for this A/B = the OLD skill** (not "no skill"). Both runs read a
skill; the only difference is which version.

## Fixture — `fixtures/digests/`

A PR adding a `digests` feature module (scheduled weekly/daily digest emails).
Files: `schema.ts` (→ `server/src/db/schema/digests.ts`), `service.ts`,
`repository.ts` (→ `server/src/modules/digests/`).

Repo context the reviewer is given: **the repo already has a `notifications`
module that owns all outbound notifications**, including the
`notification_outbox` table.

## Prompt (identical, run once per skill version)

> Review this PR for Onion architecture / ring-boundary violations. Files are in
> `fixtures/digests/`: `schema.ts`, `service.ts`, `repository.ts`. The repo
> already has a `notifications` module that owns outbound notifications and the
> `notification_outbox` table. For each problem: name the exact rule it breaks
> and which file the fix goes in. Do not pad with speculative issues; if a file
> is fine, leave it alone.

## Grading

`expected-findings.json` — one **discriminator** (`cross-module-data-reachin`,
expected NEW-only) and three **controls** both versions should catch
(no-regression check). Score = caught / 4 for each version; the interesting
number is whether NEW catches the discriminator and OLD does not, with the
controls even.
