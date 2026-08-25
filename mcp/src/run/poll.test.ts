import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest';
import { pollUntilTerminal } from './poll.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function runRow(overrides: Partial<{ run_id: string; status: string | null; error: string | null }>) {
  return { run_id: 'run-1', status: 'running', error: null, ...overrides };
}

describe('pollUntilTerminal', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
    vi.useRealTimers();
  });

  it('resolves immediately when the run is already terminal on the first check (no leading sleep)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([runRow({ status: 'done' })]));

    const result = await pollUntilTerminal('pull-1', 'run-1', { timeoutMs: 10_000, intervalMs: 2_000 });

    expect(result).toMatchObject({ run_id: 'run-1', status: 'done' });
    expect(globalThis.fetch).toHaveBeenCalledTimes(1);
  });

  it('polls across several iterations before the run turns terminal', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'running' })]))
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'running' })]))
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'done' })]));
    globalThis.fetch = fetchMock;

    const promise = pollUntilTerminal('pull-1', 'run-1', { timeoutMs: 30_000, intervalMs: 2_000 });

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).toMatchObject({ run_id: 'run-1', status: 'done' });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("returns 'timeout' without throwing when the deadline elapses first", async () => {
    globalThis.fetch = vi.fn().mockImplementation(async () => jsonResponse([runRow({ status: 'running' })]));

    const promise = pollUntilTerminal('pull-1', 'run-1', { timeoutMs: 5_000, intervalMs: 2_000 });

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).toBe('timeout');
  });

  it('calls onTick once per non-terminal iteration, not on the final terminal check', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'running' })]))
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'running' })]))
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'done' })]));
    globalThis.fetch = fetchMock;
    const onTick = vi.fn();

    const promise = pollUntilTerminal('pull-1', 'run-1', { timeoutMs: 30_000, intervalMs: 2_000, onTick });

    await vi.advanceTimersByTimeAsync(2_000);
    await vi.advanceTimersByTimeAsync(2_000);
    await promise;

    expect(onTick).toHaveBeenCalledTimes(2);
  });

  it('keeps polling even when onTick rejects', async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'running' })]))
      .mockResolvedValueOnce(jsonResponse([runRow({ status: 'done' })]));
    globalThis.fetch = fetchMock;
    const onTick = vi.fn().mockRejectedValue(new Error('notification channel closed'));

    const promise = pollUntilTerminal('pull-1', 'run-1', { timeoutMs: 30_000, intervalMs: 2_000, onTick });

    await vi.advanceTimersByTimeAsync(2_000);
    const result = await promise;

    expect(result).toMatchObject({ run_id: 'run-1', status: 'done' });
  });
});
