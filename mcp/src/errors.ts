/** A tool's own execution failure — "not found", "invalid input", etc. */
export class ToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolError';
  }
}

/**
 * The single point that turns any thrown error into an MCP tool result.
 * Always `isError: true` in a normal result — NEVER a JSON-RPC protocol
 * error. Protocol-level errors stay reserved for "unknown tool" / malformed
 * request; a tool that ran and failed is not that (mcp-server-best-practices
 * §1–2).
 */
export function toToolResult(err: unknown): {
  isError: true;
  content: [{ type: 'text'; text: string }];
} {
  const message = err instanceof Error ? err.message : String(err);
  return {
    isError: true,
    content: [{ type: 'text', text: message }],
  };
}
