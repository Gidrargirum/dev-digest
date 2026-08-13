# INSIGHTS.md template

Every package (`server/`, `client/`, `reviewer-core/`, `e2e/`) and the repo
root already has an `insights/INSIGHTS.md` following this skeleton by
default. You should never need to create one from scratch — just append to
the right section of the existing file (see routing.md).

Use this skeleton only if a package's `INSIGHTS.md` is somehow missing (a
new package added after this skill existed, or a file deleted by accident).
Recreate it with exactly these seven sections, in this order, all empty
except the one receiving the first entry. Don't pre-fill empty sections with
placeholder text — an empty `##` heading is the correct empty state.

```markdown
# <package> — engineering insights

Append-only. Newest entries at the bottom of each section.
Maintained by the `engineering-insights` skill; see ../AGENTS.md for layer rules.

## What Works

## What Doesn't Work

## Codebase Patterns

## Tool & Library Notes

## Recurring Errors & Fixes

## Session Notes

## Open Questions
```

## Section meanings

- **What Works** — an approach or pattern that was tried and held up.
- **What Doesn't Work** — an approach that failed, and why. This is the
  section people skip most often, and the one most worth reading before
  repeating someone else's mistake. Always check whether this session has
  something for it before finishing capture.
- **Codebase Patterns** — a convention specific to this repo that isn't
  visible just from reading nearby code (naming, layering, a rule enforced
  by review rather than by the compiler).
- **Tool & Library Notes** — a quirk of a dependency, SDK, or external
  service — version-specific, config-specific, or otherwise non-obvious.
- **Recurring Errors & Fixes** — an error that has now happened more than
  once, with its fix. Promote an entry here (don't duplicate it) once you
  see the same failure a second time.
- **Session Notes** — a dated, short narrative summary of a session, for
  entries that don't cleanly fit the categories above.
- **Open Questions** — something left unresolved that a future session
  should pick up. Remove an entry from here once it's answered — move the
  answer into the relevant section instead.

## Entry format

All sections except Session Notes:

```markdown
- **YYYY-MM-DD** — <specific, actionable statement>. `path/to/file.ts:42`
```

Session Notes:

```markdown
### YYYY-MM-DD

1–3 sentences: what the session worked on and what came out of it.
```

Omit the file:line citation only when the insight genuinely isn't tied to one
place in code (e.g. a cross-cutting workflow note).
