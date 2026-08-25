# mcp/insights/ — what we learned building the MCP server

Dated write-ups on this package: tool-design decisions, MCP client quirks,
and anything that cost real debugging time.

| Entry | Conclusion |
|---|---|
| _(empty)_ | — |

## INSIGHTS.md

`INSIGHTS.md` in this folder is a running, append-only log maintained by the
[`engineering-insights`](../../.claude/skills/engineering-insights/SKILL.md)
skill — short, dated entries captured as sessions touch this package. It's
distinct from the deep-dive write-ups above: those are one-off
investigations, `INSIGHTS.md` is continuous capture.

## What belongs here

Naming: `YYYY-MM-topic.md`. Typical topics: MCP host/client quirks hit while
testing tools manually · stdio transport gotchas · trade-offs made between
the 5 planned tools and the `mcp-server-best-practices.md` recommendations.
