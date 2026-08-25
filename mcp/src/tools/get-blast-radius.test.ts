import { describe, it, expect, vi, afterEach } from 'vitest';
import { getBlastRadius } from './get-blast-radius.js';
import { ToolError } from '../errors.js';

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

describe('getBlastRadius', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('resolves repo/PR and maps a successful blast response into the flat symbols shape', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/pulls': [{ id: 'pr-1', number: 42, title: 'Fix bug' }],
      '/pulls/pr-1/blast': {
        status: 'ok',
        reason: null,
        blast: {
          changed_symbols: [{ name: 'doThing', file: 'src/x.ts', kind: 'function' }],
          downstream: [
            {
              symbol: 'doThing',
              callers: [{ name: 'caller1', file: 'src/y.ts', line: 10 }],
              endpoints_affected: ['GET /things'],
              crons_affected: [],
              callers_truncated: false,
            },
          ],
          summary: '1 symbols · 1 callers · 1 endpoints',
        },
        counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
      },
      '/repos': [{ id: 'repo-1', full_name: 'acme/widgets' }],
    });

    const result = await getBlastRadius({ repo: 'acme/widgets', pr: 42 });

    expect(result.status).toBe('ok');
    expect(result.reason).toBeUndefined();
    expect(result.summary).toBe('1 symbols · 1 callers · 1 endpoints');
    expect(result.symbols).toEqual([
      {
        name: 'doThing',
        file: 'src/x.ts',
        kind: 'function',
        callers: [{ name: 'caller1', file: 'src/y.ts', line: 10 }],
        endpoints: ['GET /things'],
        crons: [],
        callers_truncated: false,
      },
    ]);
    expect(result.counts).toEqual({ symbols: 1, callers: 1, endpoints: 1, crons: 0 });
  });

  it('returns status: degraded with a reason, without throwing, when the repo is not indexed', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/pulls': [{ id: 'pr-1', number: 42, title: 'Fix bug' }],
      '/pulls/pr-1/blast': {
        status: 'degraded',
        reason: 'no index for this repo yet',
        blast: null,
        counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      },
      '/repos': [{ id: 'repo-1', full_name: 'acme/widgets' }],
    });

    const result = await getBlastRadius({ repo: 'acme/widgets', pr: 42 });

    expect(result.status).toBe('degraded');
    expect(result.reason).toBe('no index for this repo yet');
    expect(result.symbols).toEqual([]);
  });

  it('throws a ToolError with a hint when the repo is unknown', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos': [],
    });

    await expect(getBlastRadius({ repo: 'nobody/nothing', pr: 1 })).rejects.toThrow(ToolError);
  });

  it('throws a ToolError with a hint when the PR is unknown', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/pulls': [],
      '/repos': [{ id: 'repo-1', full_name: 'acme/widgets' }],
    });

    await expect(getBlastRadius({ repo: 'acme/widgets', pr: 999 })).rejects.toThrow(ToolError);
  });
});
