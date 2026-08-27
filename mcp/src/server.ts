// stdio entry point for the DevDigest MCP server. Registers the 5 tools from
// `tools/schemas.ts` against the SDK's high-level `McpServer`, in the exact
// order `TOOL_DEFINITIONS` declares them — see
// docs/agent-prompts/mcp-server-best-practices.md §6.3: a cached `tools/list`
// must never be resorted, so new tools go to the end of that array, not here.
//
// Never write to stdout: stdout is the JSON-RPC channel for this transport.
// Diagnostics go to stderr only (`console.error`/`process.stderr.write`).

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import type { z } from 'zod';

import { toToolResult } from './errors.js';
import { getBlastRadius } from './tools/get-blast-radius.js';
import { getConventions } from './tools/get-conventions.js';
import { getFindings } from './tools/get-findings.js';
import { listAgents } from './tools/list-agents.js';
import { runAgentOnPullRequest } from './tools/run-agent.js';
import { TOOL_DEFINITIONS, type ToolDefinition } from './tools/schemas.js';

/** One handler per tool name, in the same order/identity as `TOOL_DEFINITIONS`. */
const TOOL_HANDLERS: Record<string, (input: never) => Promise<unknown>> = {
  list_agents: listAgents,
  run_agent_on_pull_request: runAgentOnPullRequest,
  get_findings: getFindings,
  get_conventions: getConventions,
  get_blast_radius: getBlastRadius,
};

/**
 * `McpServer.registerTool`'s generic overload instantiates a full
 * `ShapeOutput`/`ToolCallback` chain per call site, which blows up
 * ("Type instantiation is excessively deep") once the schema comes from a
 * runtime-selected `ToolDefinition` instead of a schema literal. The tool
 * definitions are already validated by `schemas.test.ts` and the input/output
 * shape is re-checked at runtime by the SDK itself (`validateToolInput` /
 * `validateToolOutput`), so a loosened call-site type here costs no real
 * safety — only the overload resolution that TS can't do statically for a
 * dynamic definition list.
 */
type LooseRegisterTool = (
  name: string,
  config: {
    description?: string;
    inputSchema?: z.ZodTypeAny;
    outputSchema?: z.ZodTypeAny;
  },
  cb: (args: unknown) => Promise<{
    content: [{ type: 'text'; text: string }];
    structuredContent?: Record<string, unknown>;
    isError?: boolean;
  }>,
) => void;

function registerTool(server: McpServer, definition: ToolDefinition): void {
  const handler = TOOL_HANDLERS[definition.name];
  if (!handler) {
    // Defensive only — every name in TOOL_DEFINITIONS has a handler above;
    // this would be a wiring bug caught immediately by the smoke test.
    throw new Error(`No handler registered for tool '${definition.name}'`);
  }

  const registerToolLoose = server.registerTool.bind(server) as unknown as LooseRegisterTool;

  registerToolLoose(
    definition.name,
    {
      description: definition.description,
      inputSchema: definition.inputSchema as z.ZodTypeAny,
      outputSchema: definition.outputSchema as z.ZodTypeAny,
    },
    async (args) => {
      try {
        const result = await handler(args as never);
        return {
          content: [{ type: 'text', text: JSON.stringify(result) }],
          structuredContent: result as Record<string, unknown>,
        };
      } catch (err) {
        return toToolResult(err);
      }
    },
  );
}

function createServer(): McpServer {
  const server = new McpServer({ name: 'devdigest-mcp', version: '0.1.0' });

  for (const definition of TOOL_DEFINITIONS) {
    registerTool(server, definition);
  }

  return server;
}

async function main(): Promise<void> {
  const server = createServer();
  const transport = new StdioServerTransport();

  const shutdown = (signal: NodeJS.Signals) => {
    process.stderr.write(`devdigest-mcp: received ${signal}, shutting down\n`);
    server
      .close()
      .catch((err: unknown) => {
        process.stderr.write(`devdigest-mcp: error during shutdown — ${String(err)}\n`);
      })
      .finally(() => {
        process.exit(0);
      });
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));

  await server.connect(transport);
  process.stderr.write('devdigest-mcp: connected on stdio\n');
}

// Only run the stdio entry point when this file is executed directly (`pnpm
// start` / `tsx src/server.ts`), never as a side effect of importing
// `createServer` — the smoke test imports it in-process via
// `InMemoryTransport` and must not also spin up a real stdio transport
// competing for the test runner's own stdin/stdout.
const isMainModule = process.argv[1] !== undefined && import.meta.url === new URL(process.argv[1], 'file://').href;

if (isMainModule) {
  main().catch((err: unknown) => {
    process.stderr.write(`devdigest-mcp: fatal error — ${String(err)}\n`);
    process.exit(1);
  });
}

export { createServer };
