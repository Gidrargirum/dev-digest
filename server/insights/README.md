# server/insights/ — what we learned about the server

Dated write-ups: measurements, incidents, experiment outcomes on the server layer.

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

Naming: `YYYY-MM-topic.md`. Typical topics: drop rate at the grounding gate ·
indexer-pipeline latency on large repos · behaviour of stale-run reaping ·
cost and token usage per model.

Read before optimizing or changing behaviour that has already been measured here,
so the experiment isn't repeated.
