# Deduplication and append-only

These are the two rules the skill exists to enforce. Treat this procedure as
blocking: no entry gets written until it has been followed.

## Step 1 — read the target file in full

Not a `grep` for a keyword — a full read. A similar case is almost never
phrased the same way twice, so keyword search misses duplicates that a full
read catches immediately. These files stay small by design (see the hygiene
note in SKILL.md), so a full read is cheap.

## Step 2 — match by substance, not by wording

Treat a new candidate as a duplicate of an existing entry if **any** of these
hold, even when the phrasing is completely different:

- same underlying symbol, file, or command;
- same root cause behind a differently-described symptom
  ("times out past 30 items" vs. "hangs on large batches");
- same rule stated from the opposite angle
  ("always use X" vs. "Y breaks here").

## Step 3 — pick an action; "overwrite" is not one of them

| Situation | Action |
|---|---|
| No match found | Append the new entry to the end of the relevant section |
| Same case, nothing new | **Write nothing.** Tell the user the knowledge is already captured and point at the existing line |
| Same case, new detail surfaced | Extend the existing entry's line in place — keep the original wording, add the new detail |
| Existing entry turns out to be wrong or stale | Don't delete it. Add a dated correction note directly under it: `— **YYYY-MM-DD** correction: …` |
| New candidate directly contradicts an existing entry | Don't silently keep both. Surface the conflict to the user and wait for a decision |

## Hard rules

- Never `Write` over an existing `INSIGHTS.md`. Only `Edit` — append, or
  extend one line in place.
- Never delete another entry, even one that looks obsolete. Retire it with a
  correction note, not by removing it.
- Never reorder sections or existing entries. Order is chronological history.
- Consolidate similar entries only on an explicit user request — never as a
  side effect of appending something new.
- The skill never edits its own files (`SKILL.md`, `references/*`).

## Hygiene thresholds

If the target file exceeds ~150 entries total, or a single section exceeds
~30, **propose** consolidation to the user instead of appending silently.
Candidates worth flagging as prune-able (never remove without confirmation):

- the entry references a bug that has since been fixed;
- the entry duplicates another one that survived the dedup check earlier
  (i.e. the file already has drift);
- the entry has never been relevant again since it was written.
