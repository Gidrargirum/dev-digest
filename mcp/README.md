# @devdigest/mcp

A local MCP server (stdio transport) for DevDigest. It exposes review
workflows to any MCP-capable client (Claude Code, Claude Desktop, …) as 5
tools, all of which talk to the existing DevDigest API over HTTP — this
package never touches Postgres directly.

## Tools

| Tool | Purpose | Stub |
|---|---|---|
| `list_agents` | List the configured review agents. | no |
| `run_agent_on_pull_request` | Run an agent against an imported PR and return the resulting findings. | no |
| `get_findings` | Fetch findings for a past review run. | no |
| `get_conventions` | Fetch the repo's convention drafts. | no |
| `get_blast_radius` | Maps a PR's impact: changed symbols → callers → affected HTTP endpoints/cron jobs, up to two hops. | no |

## Requirements

The DevDigest API must be running before this server is useful — start it
from the **repo root**, not from `mcp/`:

```sh
./scripts/dev.sh   # Postgres + migrate + seed + API (:3001) + web
```

The MCP server is an HTTP client of that API (see `mcp/AGENTS.md`); with the
API down, every tool call fails.

## Commands

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm start   # runs src/server.ts with tsx
```

## Registering the server with an MCP client

### Option 1 — `.mcp.json` (recommended, already set up)

The repo root ships a project-scoped `.mcp.json` that Claude Code picks up
automatically for anyone working in this checkout — no manual registration
needed. Treat it as the canonical way this server is wired up; the flag
syntax below is the alternative when you need a different client or a
one-off registration.

### Option 2 — `claude mcp add`

Claude Code also supports registering an MCP server imperatively with the
`claude mcp add` command (run from the repo root). At a high level this
registers a named server with a launch command, equivalent to one entry in
`.mcp.json` — see that file for the exact command/args/env this project
uses, and consult `claude mcp add --help` for the current flag syntax rather
than guessing it here.

## Troubleshooting

**"API unreachable" / every tool call errors out**

- Confirm `./scripts/dev.sh` is running from the repo root.
- Confirm something is actually listening on `:3001`:
  ```sh
  curl http://localhost:3001/agents
  ```
  No response, connection refused, or a hang means the API isn't up (or
  `DEVDIGEST_API_URL` points somewhere else) — start/restart the stack
  before retrying the tool call.

**`get_findings` returns an empty list**

- Findings only exist after an agent has actually run against the PR. Call
  `run_agent_on_pull_request` first, then retry `get_findings` for that run.
  An imported-but-never-reviewed PR is expected to come back empty — that
  is not a bug.

### `get_blast_radius` returns `status: 'degraded'` for an unindexed repo

This is a normal, successful result — not an error — the same way
`get_conventions` returns an empty page for a repo that was never scanned.
`reason` names the next step (run a Resync in Studio); `symbols` comes back
empty. It relies entirely on the server's repo-intel index
(`GET /pulls/:id/blast`) — no blast-radius logic is duplicated in this
package.

See [AGENTS.md](./AGENTS.md) for conventions and invariants.
