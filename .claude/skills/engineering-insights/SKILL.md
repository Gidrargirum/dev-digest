---
name: engineering-insights
description: Captures durable engineering insights into the touched module's insights/INSIGHTS.md — what worked, what failed, codebase conventions, library quirks, recurring errors and their fixes, and open questions. Invoked automatically and unconditionally at the end of every session per this repo's CLAUDE.md session protocol. Also use mid-session when the user corrects the agent's approach, and when the user types /engineering-insights.
---

# Engineering Insights

Captures what a session learned into the `INSIGHTS.md` of the module it
touched, so the next session in that module starts already knowing it. This
is durable, cross-session memory — not a summary of the conversation.

This skill runs **every session, unconditionally** (see the root
`CLAUDE.md` session protocol). It is not a signal that something interesting
happened — deciding that is this skill's own first job, not the caller's.
Most sessions will produce nothing worth recording, and exiting cleanly with
no write is the normal, correct outcome, not a shortfall.

## Insight capture checklist

Copy this checklist into your response and check items off as you go:

```
Insight capture:
- [ ] 0. Decide if this session produced anything worth capturing at all
- [ ] 1. Collect candidates (max 5, user corrections rank highest)
- [ ] 2. Screen out anything generic (references/entry-quality.md)
- [ ] 3. Pick the target file (references/routing.md)
- [ ] 4. Read the target file IN FULL and check for duplicates
- [ ] 5. Append via Edit — never Write over an existing file
- [ ] 6. State in one line what was added and where (or that nothing qualified)
```

Step 5 does not wait for approval: a candidate that has passed steps 0–4 gets
written immediately, not proposed for sign-off. The gates are steps 0–4
(worth capturing, not generic, not a duplicate) — once a candidate clears
those, appending it is routine, not a decision that needs a human in the
loop. The one exception is a direct contradiction with an existing entry
(see dedup-and-append.md) — that genuinely can't be resolved unilaterally, so
it does pause for the user.

If step 0 finds nothing, stop there: say "nothing worth recording this
session" in one line and do nothing else — don't force an entry to justify
having run. Step 4 feeds back into step 2: if a candidate turns out to be a
duplicate or too generic once checked, drop it or fold it into an existing
entry — only what survives both filters gets appended.

## What counts as a candidate (step 0–1)

In descending order of signal:

1. **The user corrected the agent's approach** — highest-signal source.
2. A non-trivial problem got solved, or an approach was tried and abandoned —
   record why.
3. A repo convention, a library quirk, or a decision with consequences
   surfaced.
4. An error occurred for the second time.
5. A question came up that stayed unresolved.

Do not write: trivial edits, anything obvious from reading the code, anything
already in the file. A session that was pure execution with no surprises has
zero candidates — that's expected, not a miss. Cap candidates at 5 per
session even when more qualify; without a cap the file fills with noise
faster than it fills with signal.

## References

- [references/entry-quality.md](references/entry-quality.md) — the cold-read
  test, good vs. bad entry examples. Read before drafting any entry.
- [references/dedup-and-append.md](references/dedup-and-append.md) — the
  duplicate-check procedure and the append-only rules. Read before touching
  the target file; this is a blocking step, not a suggestion.
- [references/routing.md](references/routing.md) — which `insights/` file a
  given set of changed paths routes to, including multi-package cases.
- [references/file-template.md](references/file-template.md) — the canonical
  section structure every `INSIGHTS.md` follows. Every package already has one
  by default; use this only if a new package's is somehow missing.

## Non-negotiables

- Never `Write` over an existing `INSIGHTS.md`. Only `Edit` — append a new
  entry or extend an existing line in place.
- Never delete another entry, even one that looks outdated. Supersede it with
  a dated correction note instead (see dedup-and-append.md).
- Never reorder sections or existing entries — order is chronology.
- Consolidate similar entries only when the user explicitly asks for it,
  never as a side effect of an append.
- If the target file exceeds ~150 entries total, or one section exceeds ~30,
  propose consolidation to the user — don't do it silently and don't ignore it.
