// Protocol-level smoke test. `tools/list` never touches a handler, so it
// stays network-free. Every tool handler — including `get_blast_radius`,
// which is now a thin HTTP client of `GET /pulls/:id/blast` — goes through
// `../api/client.js`, so the one test that calls a handler stubs `fetch`.
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { describe, it, expect, afterEach, vi } from 'vitest';

import { createServer } from './server.js';
import { TOOL_DEFINITIONS } from './tools/schemas.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function stubFetchByPath(routes: Record<string, unknown>) {
  return vi.fn().mockImplementation((url: string) => {
    const path = new URL(url).pathname;
    for (const [route, body] of Object.entries(routes)) {
      if (path.startsWith(route)) return Promise.resolve(jsonResponse(body));
    }
    throw new Error(`no stub for ${path}`);
  });
}

describe('devdigest-mcp server (protocol smoke test)', () => {
  let client: Client | undefined;
  const originalFetch = globalThis.fetch;

  afterEach(async () => {
    await client?.close();
    client = undefined;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  async function connectedClient(): Promise<Client> {
    const server = createServer();
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();

    client = new Client({ name: 'smoke-test-client', version: '0.0.0' });
    await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);
    return client;
  }

  it('lists exactly the 5 tools, in TOOL_DEFINITIONS order, each with a description and inputSchema', async () => {
    const c = await connectedClient();

    const { tools } = await c.listTools();

    expect(tools).toHaveLength(5);
    expect(tools.map((t) => t.name)).toEqual(TOOL_DEFINITIONS.map((d) => d.name));

    for (const tool of tools) {
      expect(tool.description).toBeTruthy();
      expect(tool.inputSchema).toBeTruthy();
    }
  });

  it('calls get_blast_radius through the protocol and returns the mapped, structured result', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/pulls': [{ id: 'pr-1', number: 1, title: 'Fix bug' }],
      '/pulls/pr-1/blast': {
        status: 'degraded',
        reason: 'no index for this repo yet',
        blast: null,
        counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      },
      '/repos': [{ id: 'repo-1', full_name: 'a/b' }],
    });

    const c = await connectedClient();

    const result = await c.callTool({
      name: 'get_blast_radius',
      arguments: { repo: 'a/b', pr: 1 },
    });

    expect(result.isError).toBeFalsy();

    const structured = result.structuredContent as { status?: string; reason?: string } | undefined;
    if (structured) {
      expect(structured.status).toBe('degraded');
      expect(structured.reason).toBe('no index for this repo yet');
    } else {
      const text = (result.content as Array<{ type: string; text?: string }>)[0]?.text ?? '';
      const parsed = JSON.parse(text) as { status?: string; reason?: string };
      expect(parsed.status).toBe('degraded');
      expect(parsed.reason).toBe('no index for this repo yet');
    }
  });
});
