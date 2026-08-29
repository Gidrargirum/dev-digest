# Retro ledger

One row per `workflow-retro` run, appended by the skill itself — see
`.claude/skills/workflow-retro/references/ledger-format.md` for the column
definitions. Append-only: newest row at the bottom, never reordered, never
deleted. A correction to an old row is a new row that says what it
corrects, not an edit to the old one.

| Date | Pipeline | Mode | Total tokens (in/out) | Cache read | Wall-clock | Top action |
|---|---|---|---|---|---|---|
| 2026-08-27 | ad-hoc `/run-plan`-style pipeline (Project Context Folder) + `/pr-self-review` | quick* | ~1.85M combined* | unknown* | ~47 min subagent critical path (session total higher, untracked)* | Remove duplicated Constraints/Skills-table context re-pasted into 3 fresh implementer/test-writer prompts |
