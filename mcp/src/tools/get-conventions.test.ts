import { describe, it, expect, vi, afterEach } from 'vitest';
import { getConventions } from './get-conventions.js';

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

describe('getConventions', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('returns filtered, projected conventions with the latest scan (happy path)', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/conventions': {
        scan: { status: 'done', finished_at: '2026-02-01T00:00:00Z' },
        candidates: [
          {
            id: 'c1',
            category: 'naming',
            rule: 'use camelCase',
            confidence: 0.9,
            support: 10,
            violations: 1,
            origin: 'model',
            status: 'accepted',
            skill_id: 'skill-1',
          },
          {
            id: 'c2',
            category: 'security',
            rule: 'validate input',
            confidence: 0.8,
            support: 5,
            violations: 0,
            origin: 'config',
            status: 'pending',
            skill_id: null,
          },
        ],
      },
      '/repos': [{ id: 'repo-1', full_name: 'acme/widgets' }],
    });

    const result = await getConventions({ repo: 'acme/widgets', category: 'naming', limit: 50 });

    expect(result.scan).toEqual({ status: 'done', finished_at: '2026-02-01T00:00:00Z' });
    expect(result.conventions).toEqual([
      {
        id: 'c1',
        category: 'naming',
        rule: 'use camelCase',
        confidence: 0.9,
        support: 10,
        violations: 1,
        origin: 'model',
        status: 'accepted',
        applied_as_skill: true,
      },
    ]);
    expect(result.next_cursor).toBeNull();
  });

  it('returns an empty, successful response when the repo has never been scanned', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/conventions': { scan: null, candidates: [] },
      '/repos': [{ id: 'repo-1', full_name: 'acme/widgets' }],
    });

    const result = await getConventions({ repo: 'acme/widgets', limit: 50 });

    expect(result).toEqual({ scan: null, conventions: [], next_cursor: null });
  });
});
