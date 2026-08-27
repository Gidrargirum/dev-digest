# mcp/ — local MCP server (stdio)

A local Model Context Protocol server exposing 5 tools (`list_agents`,
`run_agent_on_pull_request`, `get_findings`, `get_conventions`,
`get_blast_radius`) to MCP clients (Claude Code, Claude Desktop, …).
Consumes the existing DevDigest API over HTTP — it is a client of `server/`,
not a second copy of it.

## Stack

TypeScript 5.7 · `@modelcontextprotocol/sdk` · Zod 3 · tsx · vitest 2 ·
Node ≥ 22, pnpm ≥ 10. Same package-manager choice as `server/`.

## Commands

```sh
pnpm install
pnpm typecheck
pnpm test
pnpm start   # tsx src/server.ts — the stdio MCP server
```

Requires `./scripts/dev.sh` running so the API answers on `:3001`; this
package has no database of its own and nothing to migrate or seed.

## Map

- `src/server.ts` — stdio transport entry point (later step).
- `src/tools/` — one file per tool (later step).
- `src/client.ts` — thin HTTP client for the DevDigest API (later step).

## Non-default conventions

- Types for `@devdigest/shared` are **not** a third vendored copy: the
  `tsconfig.json` path alias points straight at
  `../server/src/vendor/shared/index.ts` (same approach as
  `reviewer-core/tsconfig.json`). Edit the server or client vendor copy as
  usual; this package never needs its own.
- **Never write to stdout** (`console.log` or otherwise). stdout is the
  JSON-RPC channel for the stdio transport — any stray byte on it corrupts
  every message after it. Diagnostics go to stderr only.

## Do not touch / invariants

- **No `drizzle-orm`, `postgres`, or `fastify` dependency, ever.** This
  package reaches DevDigest only through the API's HTTP port (`:3001`),
  never through Postgres directly. `run_agent_on_pull_request` needs to
  reuse `ReviewRunExecutor`, which lives only inside the `server/` process —
  a direct DB connection here would bypass workspace scoping and the
  grounding gate that `server/` enforces on every review run. If a tool
  seems to need direct DB access, the fix is a new `server/` route, not a
  Postgres client in this package.

## Read when

Read [docs/agent-prompts/mcp-server-best-practices.md](../docs/agent-prompts/mcp-server-best-practices.md)
for this package's tool-design conventions: naming, `isError` vs protocol
errors, the stub-tool pattern, pagination, and the four tool-interface
principles (result not operation, flat args, terse structured responses,
actionable errors).
