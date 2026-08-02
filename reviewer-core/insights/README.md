# reviewer-core/insights/ — what we learned about review quality

Dated write-ups on quality: what the model catches, what it invents, and how
prompt edits move those numbers.

| Entry | Conclusion |
|---|---|
| _(empty)_ | — |

## INSIGHTS.md

`INSIGHTS.md` in this folder is a running, append-only log maintained by the
[`engineering-insights`](../../.claude/skills/engineering-insights/SKILL.md)
skill — short, dated entries captured as sessions touch this package. It's
distinct from the deep-dive write-ups below: those are one-off investigations,
`INSIGHTS.md` is continuous capture.

## What belongs here

Naming: `YYYY-MM-topic.md`. Typical topics: how many findings grounding drops
and why · which prompt phrasings produced false positives · attempts to bypass
`INJECTION_GUARD` and their outcome · model comparisons on the same diff.

Read before editing `prompt.ts` or the thresholds in `grounding.ts` — most
"obvious improvements" have been tried here already.
