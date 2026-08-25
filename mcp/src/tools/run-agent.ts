import { resolveAgent, resolvePull, resolveRepo } from '../api/resolve.js';
import { getReviews, postReview } from '../api/client.js';
import { config } from '../config.js';
import { ToolError } from '../errors.js';
import { pollUntilTerminal } from '../run/poll.js';
import type { Finding, RunAgentInput, RunAgentOutput } from './schemas.js';

/**
 * In-process guard against two concurrent runs on the same `repo#pr`. Keyed
 * on the resolved, stable `${repo.id}:${pull.id}` — not the raw input
 * strings, so "owner/name" vs the GitHub URL vs case differences can't slip
 * past it. Only guards this process; a second MCP server instance or a
 * manual "Run" click in the DevDigest UI is not covered (documented, not a
 * bug — the plan scopes this to an in-process guard).
 *
 * Released in `finally`, including on timeout: the run keeps going on the
 * server regardless of what the client does, so holding the guard past a
 * client-side timeout would only block the user from checking on it via
 * `get_findings` — the exact tool the timeout branch tells them to call
 * next. Keeping the guard held until server-side completion would need a
 * second poll outliving the tool call, which the client protocol here has
 * no place to run.
 */
const runsInFlight = new Set<string>();

function guardKey(repoId: string, pullId: string): string {
  return `${repoId}:${pullId}`;
}

/**
 * Emits one MCP progress notification per poll tick. Optional: a caller with
 * no `progressToken` on its request (or a client that never sends one) just
 * skips this — the tool still works, it only loses the client-side
 * timeout-reset benefit `pollUntilTerminal`'s doc comment describes.
 */
export interface ProgressReporter {
  report(progress: number, message?: string): Promise<void>;
}

export async function runAgentOnPullRequest(
  input: RunAgentInput,
  progress?: ProgressReporter,
): Promise<RunAgentOutput> {
  const repo = await resolveRepo(input.repo);
  const pull = await resolvePull(repo.id, input.pr);
  const agent = await resolveAgent(input.agent);

  const key = guardKey(repo.id, pull.id);
  if (runsInFlight.has(key)) {
    throw new ToolError(
      `Прогін для PR #${input.pr} у '${repo.full_name}' вже виконується — виклич get_findings(repo, pr), щоб перевірити результат пізніше.`,
    );
  }
  runsInFlight.add(key);

  try {
    const { runs } = await postReview(pull.id, agent.id);
    const run = runs[0];
    if (!run) {
      throw new ToolError(
        `DevDigest API не повернула жодного прогону для агента '${agent.name}' — спробуй ще раз.`,
      );
    }

    let tick = 0;
    const result = await pollUntilTerminal(pull.id, run.run_id, {
      timeoutMs: config.runTimeoutMs,
      intervalMs: config.pollIntervalMs,
      onTick: progress
        ? () => {
            tick += 1;
            return progress.report(tick, `Waiting on run ${run.run_id}…`);
          }
        : undefined,
    });

    if (result === 'timeout') {
      return {
        status: 'timeout',
        run_id: run.run_id,
        agent: agent.name,
        verdict: null,
        score: null,
        findings_count: 0,
        findings: [],
        next: `Прогін ще триває — виклич get_findings(repo, pr) за хвилину, щоб перевірити результат.`,
      };
    }

    // `pollUntilTerminal` only returns `result` once `asTerminalStatus`
    // recognized its status, so this is exhaustive over `RunTerminalStatus`
    // today — the `default` case exists so a status added to that set later
    // (e.g. a new `'expired'`) can't silently fall through as `'done'`
    // without at least a signal in the logs.
    switch (result.status) {
      case 'failed':
        throw new ToolError(
          `Прогін агента '${agent.name}' для PR #${input.pr} провалився${result.error ? `: ${result.error}` : ''} — спробуй ще раз або перевір логи API.`,
        );
      case 'cancelled':
        throw new ToolError(
          `Прогін агента '${agent.name}' для PR #${input.pr} скасовано — запусти run_agent_on_pull_request ще раз.`,
        );
      case 'done':
        break;
      default:
        console.error(
          `run_agent_on_pull_request: невідомий термінальний статус '${result.status}' для прогону ${result.run_id} — трактую як 'done'.`,
        );
    }

    const reviews = await getReviews(pull.id);
    const review =
      reviews.find((r) => r.run_id === result.run_id) ??
      reviews
        .filter((r) => r.agent_id === agent.id)
        .sort((a, b) => (a.created_at < b.created_at ? 1 : -1))[0];

    if (!review) {
      throw new ToolError(
        `Прогін завершився, але review для агента '${agent.name}' не знайдено — спробуй get_findings(repo, pr) напряму.`,
      );
    }

    const findings: Finding[] = review.findings.map((f) => ({
      severity: f.severity,
      category: f.category,
      title: f.title,
      file: f.file,
      start_line: f.start_line,
      end_line: f.end_line,
      rationale: f.rationale,
      suggestion: f.suggestion,
    }));

    return {
      status: 'completed',
      run_id: result.run_id,
      agent: agent.name,
      verdict: review.verdict,
      score: review.score,
      findings_count: findings.length,
      findings,
      next: null,
    };
  } finally {
    runsInFlight.delete(key);
  }
}
