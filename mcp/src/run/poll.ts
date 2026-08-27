import { getRuns, type RunSummary } from '../api/client.js';

/**
 * Statuses `agent_runs.status` can settle into; anything else keeps polling.
 * `RunSummary.status` is `z.string().nullable()` (see `api/client.ts`), so
 * this type is not checked against the server — it only keeps this set and
 * the `switch` in `tools/run-agent.ts` from drifting apart from each other.
 */
export type RunTerminalStatus = 'done' | 'failed' | 'cancelled';
const TERMINAL_STATUSES: ReadonlySet<RunTerminalStatus> = new Set(['done', 'failed', 'cancelled']);

/** Narrows a raw `RunSummary.status` string to `RunTerminalStatus`, or `undefined` if it isn't one. */
export function asTerminalStatus(status: string | null): RunTerminalStatus | undefined {
  return TERMINAL_STATUSES.has(status as RunTerminalStatus) ? (status as RunTerminalStatus) : undefined;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Polls `GET /pulls/:id/runs` until the given `runId` reaches a terminal
 * status (`done` | `failed` | `cancelled`) or `timeoutMs` elapses.
 *
 * Checks the status FIRST, with no leading sleep — a run that is already
 * terminal (or terminal by the time the first response lands) resolves
 * immediately instead of paying one wasted `intervalMs` wait.
 *
 * A timeout is a normal, successful outcome (`'timeout'`), not a thrown
 * error: the run is still going on the server, the caller already paid for
 * the LLM call, and `run_agent_on_pull_request` reports this back to the
 * user as a status, not a failure. This function never cancels the run on
 * timeout — that decision belongs to the caller, and cancelling something
 * the user is still paying to complete would be a surprising side effect of
 * a client-side deadline (docs/agent-prompts/mcp-server-best-practices.md
 * §4 — long operations degrade, they do not fail, on a client timeout).
 */
export async function pollUntilTerminal(
  pullId: string,
  runId: string,
  options: { timeoutMs: number; intervalMs: number },
): Promise<RunSummary | 'timeout'> {
  const { timeoutMs, intervalMs } = options;
  const start = Date.now();

  while (true) {
    const runs = await getRuns(pullId);
    const run = runs.find((r) => r.run_id === runId);

    if (run && asTerminalStatus(run.status) !== undefined) {
      return run;
    }

    if (Date.now() - start > timeoutMs) {
      return 'timeout';
    }

    await sleep(intervalMs);
  }
}
