import { describe, it, expect, vi, afterEach } from 'vitest';
import { getFindings } from './get-findings.js';

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

describe('getFindings', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('aggregates the latest review per agent and returns their findings (happy path)', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/pulls': [{ id: 'pr-1', number: 42, title: 'Fix bug' }],
      '/pulls/pr-1/reviews': [
        {
          id: 'rev-old',
          agent_id: 'agent-1',
          agent_name: 'Security Reviewer',
          run_id: 'run-old',
          verdict: 'REQUEST_CHANGES',
          score: 2,
          created_at: '2026-01-01T00:00:00Z',
          findings: [],
        },
        {
          id: 'rev-new',
          agent_id: 'agent-1',
          agent_name: 'Security Reviewer',
          run_id: 'run-new',
          verdict: 'APPROVE',
          score: 9,
          created_at: '2026-02-01T00:00:00Z',
          findings: [
            {
              severity: 'WARNING',
              category: 'security',
              title: 'Missing validation',
              file: 'src/x.ts',
              start_line: 1,
              end_line: 2,
              rationale: 'no check',
              suggestion: null,
            },
          ],
        },
      ],
      '/repos': [{ id: 'repo-1', full_name: 'acme/widgets' }],
    });

    const result = await getFindings({ repo: 'acme/widgets', pr: 42, limit: 50 });

    expect(result.verdict).toBe('APPROVE');
    expect(result.score).toBe(9);
    expect(result.reviews).toEqual([
      { review_id: 'rev-new', agent_name: 'Security Reviewer', verdict: 'APPROVE', score: 9 },
    ]);
    expect(result.findings).toHaveLength(1);
    expect(result.findings[0]?.title).toBe('Missing validation');
    expect(result.next_cursor).toBeNull();
  });

  it('returns an empty, successful response when the PR has no reviews yet', async () => {
    globalThis.fetch = stubFetchByPath({
      '/repos/repo-1/pulls': [{ id: 'pr-1', number: 42, title: 'Fix bug' }],
      '/pulls/pr-1/reviews': [],
      '/repos': [{ id: 'repo-1', full_name: 'acme/widgets' }],
    });

    const result = await getFindings({ repo: 'acme/widgets', pr: 42, limit: 50 });

    expect(result).toEqual({
      verdict: null,
      score: null,
      reviews: [],
      findings: [],
      next_cursor: null,
    });
  });
});
