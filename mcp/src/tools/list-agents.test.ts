import { describe, it, expect, vi, afterEach } from 'vitest';
import { listAgents } from './list-agents.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('listAgents', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns a projected, paginated page of agents (happy path)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(
      jsonResponse([
        { id: 'a1', name: 'Security Reviewer', description: 'Finds vulns', provider: 'anthropic', model: 'claude', enabled: true },
        { id: 'a2', name: 'Style Bot', description: null, provider: 'openai', model: 'gpt', enabled: false },
      ]),
    );

    const result = await listAgents({ limit: 20 });

    expect(result).toEqual({
      agents: [
        { id: 'a1', name: 'Security Reviewer', description: 'Finds vulns', provider: 'anthropic', model: 'claude', enabled: true },
        { id: 'a2', name: 'Style Bot', description: null, provider: 'openai', model: 'gpt', enabled: false },
      ],
      next_cursor: null,
    });
  });

  it('returns an empty page — not an error — when no agents are configured', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([]));

    const result = await listAgents({ limit: 20 });

    expect(result).toEqual({ agents: [], next_cursor: null });
  });
});
