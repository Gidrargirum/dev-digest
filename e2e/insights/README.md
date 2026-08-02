# e2e/insights/ — what we learned about run stability

Dated write-ups on flakes, timeouts, and which locators turned out to be brittle.

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

Naming: `YYYY-MM-topic.md`. Typical topics: why a given flow failed and what the
real cause turned out to be · which `--text` locators broke when copy changed ·
actual step timings versus `E2E_STEP_TIMEOUT`.

Read before raising timeouts or adding retries — slowness is usually not the cause.
