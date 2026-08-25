import { describe, it, expect, vi, afterEach, beforeEach, beforeAll } from 'vitest';
import { ToolError } from '../errors.js';

// `config.ts` reads env vars once at module load, so the small
// timeout/interval this file needs (to keep the timeout test fast under fake
// timers) must be set BEFORE `run-agent.js` (which imports `config.js`
// transitively) is ever imported — hence the dynamic import below instead of
// a static one.
process.env.DEVDIGEST_RUN_TIMEOUT_MS = '5000';
process.env.DEVDIGEST_POLL_INTERVAL_MS = '1000';
let runAgentOnPullRequest: typeof import('./run-agent.js').runAgentOnPullRequest;

beforeAll(async () => {
  ({ runAgentOnPullRequest } = await import('./run-agent.js'));
});

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

const REPO = { id: 'repo-1', full_name: 'acme/widgets' };
const PULL = { id: 'pull-1', number: 42, title: 'Fix bug' };
const AGENT = { id: 'agent-1', name: 'Security Reviewer' };

/**
 * Routes a stubbed fetch by method + path so each test only has to describe
 * the handful of responses it cares about; resolveRepo/resolvePull/resolveAgent
 * always hit the same three GETs before any tool-specific behavior kicks in.
 */
function stubFetch(overrides: Partial<Record<string, () => Response>>) {
  const handlers: Record<string, () => Response> = {
    'GET /repos': () => jsonResponse([REPO]),
    'GET /repos/repo-1/pulls': () => jsonResponse([PULL]),
    'GET /agents': () => jsonResponse([AGENT]),
    ...overrides,
  };

  globalThis.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const method = (init?.method ?? 'GET').toUpperCase();
    const key = `${method} ${path}`;
    const handler = handlers[key];
    if (!handler) {
      throw new Error(`No stub for ${key}`);
    }
    return handler();
  }) as unknown as typeof fetch;
}

describe('runAgentOnPullRequest', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('completes: postReview -> getRuns(done) -> getReviews, returns findings', async () => {
    stubFetch({
      'POST /pulls/pull-1/review': () =>
        jsonResponse({
          pr_id: 'pull-1',
          runs: [{ run_id: 'run-1', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
        }),
      'GET /pulls/pull-1/runs': () =>
        jsonResponse([{ run_id: 'run-1', status: 'done', error: null }]),
      'GET /pulls/pull-1/reviews': () =>
        jsonResponse([
          {
            id: 'review-1',
            agent_id: 'agent-1',
            agent_name: 'Security Reviewer',
            run_id: 'run-1',
            verdict: 'approve',
            score: 92,
            created_at: '2026-08-01T00:00:00.000Z',
            findings: [
              {
                severity: 'WARNING',
                category: 'style',
                title: 'Nit',
                file: 'a.ts',
                start_line: 1,
                end_line: 1,
                rationale: 'because',
                suggestion: null,
              },
            ],
          },
        ]),
    });

    const result = await runAgentOnPullRequest({ repo: 'acme/widgets', pr: 42, agent: 'Security Reviewer' });

    expect(result).toEqual({
      status: 'completed',
      run_id: 'run-1',
      agent: 'Security Reviewer',
      verdict: 'approve',
      score: 92,
      findings_count: 1,
      findings: [
        {
          severity: 'WARNING',
          category: 'style',
          title: 'Nit',
          file: 'a.ts',
          start_line: 1,
          end_line: 1,
          rationale: 'because',
          suggestion: null,
        },
      ],
      next: null,
    });
  });

  it('throws a ToolError when the run fails', async () => {
    stubFetch({
      'POST /pulls/pull-1/review': () =>
        jsonResponse({
          pr_id: 'pull-1',
          runs: [{ run_id: 'run-2', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
        }),
      'GET /pulls/pull-1/runs': () =>
        jsonResponse([{ run_id: 'run-2', status: 'failed', error: 'LLM timeout' }]),
    });

    await expect(
      runAgentOnPullRequest({ repo: 'acme/widgets', pr: 42, agent: 'Security Reviewer' }),
    ).rejects.toThrow(ToolError);
    await expect(
      runAgentOnPullRequest({ repo: 'acme/widgets', pr: 42, agent: 'Security Reviewer' }),
    ).rejects.toThrow(/LLM timeout/);
  });

  it("returns a 'timeout' status without throwing when the run outlives the deadline", async () => {
    stubFetch({
      'POST /pulls/pull-1/review': () =>
        jsonResponse({
          pr_id: 'pull-1',
          runs: [{ run_id: 'run-3', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
        }),
      'GET /pulls/pull-1/runs': () =>
        jsonResponse([{ run_id: 'run-3', status: 'running', error: null }]),
    });

    const promise = runAgentOnPullRequest({ repo: 'acme/widgets', pr: 42, agent: 'Security Reviewer' });

    for (let i = 0; i < 6; i++) {
      await vi.advanceTimersByTimeAsync(1_000);
    }
    const result = await promise;

    expect(result.status).toBe('timeout');
    expect(result.run_id).toBe('run-3');
    expect(result.next).toMatch(/get_findings/);
  });

  it('reports progress on every poll tick when a reporter is given, and none once terminal', async () => {
    stubFetch({
      'POST /pulls/pull-1/review': () =>
        jsonResponse({
          pr_id: 'pull-1',
          runs: [{ run_id: 'run-5', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
        }),
      'GET /pulls/pull-1/runs': vi
        .fn()
        .mockReturnValueOnce(jsonResponse([{ run_id: 'run-5', status: 'running', error: null }]))
        .mockReturnValueOnce(jsonResponse([{ run_id: 'run-5', status: 'done', error: null }])),
      'GET /pulls/pull-1/reviews': () =>
        jsonResponse([
          {
            id: 'review-5',
            agent_id: 'agent-1',
            agent_name: 'Security Reviewer',
            run_id: 'run-5',
            verdict: 'approve',
            score: 100,
            created_at: '2026-08-01T00:00:00.000Z',
            findings: [],
          },
        ]),
    });
    const report = vi.fn().mockResolvedValue(undefined);

    const promise = runAgentOnPullRequest(
      { repo: 'acme/widgets', pr: 42, agent: 'Security Reviewer' },
      { report },
    );
    await vi.advanceTimersByTimeAsync(1_000);
    await promise;

    expect(report).toHaveBeenCalledTimes(1);
    expect(report).toHaveBeenCalledWith(1, expect.stringContaining('run-5'));
  });

  it('rejects a second concurrent call for the same repo#pr while the first is still in flight', async () => {
    let resolveRunsCall!: (r: Response) => void;
    const pendingRuns = new Promise<Response>((resolve) => {
      resolveRunsCall = resolve;
    });

    stubFetch({
      'POST /pulls/pull-1/review': () =>
        jsonResponse({
          pr_id: 'pull-1',
          runs: [{ run_id: 'run-4', agent_id: 'agent-1', agent_name: 'Security Reviewer' }],
        }),
    });

    // Override the runs handler to hang until we release it, so the first
    // call is still "in flight" when we fire the second.
    const originalFetchImpl = globalThis.fetch;
    globalThis.fetch = vi.fn(async (input: string | URL, init?: RequestInit) => {
      const url = typeof input === 'string' ? input : input.toString();
      const path = url.replace(/^https?:\/\/[^/]+/, '');
      if (path === '/pulls/pull-1/runs') {
        return pendingRuns;
      }
      return (originalFetchImpl as unknown as (i: string | URL, init?: RequestInit) => Promise<Response>)(
        input,
        init,
      );
    }) as unknown as typeof fetch;

    const first = runAgentOnPullRequest({ repo: 'acme/widgets', pr: 42, agent: 'Security Reviewer' });
    // Let the first call get past resolve + postReview and into the poll loop's
    // first (pending) getRuns() call before firing the second.
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(0);

    await expect(
      runAgentOnPullRequest({ repo: 'acme/widgets', pr: 42, agent: 'Security Reviewer' }),
    ).rejects.toThrow(/вже виконується/);

    resolveRunsCall(jsonResponse([{ run_id: 'run-4', status: 'done', error: null }]));
    // Let the resolved fetch flow through, and getReviews() (unstubbed => throws) —
    // that's fine, we only assert the guard already rejected the second call.
    await expect(first).rejects.toThrow();
  });
});
