# insights/ — what we learned (cross-package)

Write-ups, measurements, postmortems, experiment outcomes. Dated entries with a
conclusion, not living documentation.

| Entry | Conclusion |
|---|---|
| _(empty)_ | — |

## INSIGHTS.md

`INSIGHTS.md` in this folder is a running, append-only log maintained by the
[`engineering-insights`](../.claude/skills/engineering-insights/SKILL.md)
skill — short, dated entries for insights that span more than one package or
touch root-level config (scripts, CI, Docker). It's distinct from the
deep-dive write-ups below: those are one-off investigations, `INSIGHTS.md` is
continuous capture.

## What belongs here

Naming: `YYYY-MM-topic.md`. Each entry answers three questions: what was
measured or broken · what we found · what changed as a result.

Once a finding becomes a **rule**, it moves into the relevant `CLAUDE.md` and
only its justification stays here.
