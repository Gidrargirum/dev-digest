import { z } from 'zod';
import { BlastStatus } from '@devdigest/shared';
import { config } from '../config.js';

/**
 * Thin HTTP client for the DevDigest API. This is the only place in the
 * package that talks to the network — `mcp/AGENTS.md` forbids a direct
 * Postgres/Fastify dependency, so every read/write goes through here.
 *
 * Two error classes on purpose: `ApiError` is a response the API itself
 * produced (a validation 400, a 404 — the server is up and disagrees);
 * `ApiUnavailableError` is "the API never answered at all" (down, unreachable,
 * timed out) and always names the next step, per
 * docs/agent-prompts/mcp-server-best-practices.md §7 ("помилка веде далі").
 */

/** An HTTP error response the API itself returned (status + parsed body). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = 'ApiError';
  }
}

/** The API could not be reached at all — network failure or timeout. */
export class ApiUnavailableError extends Error {
  constructor(cause?: unknown) {
    super(
      `DevDigest API недоступний на ${config.apiUrl} — запусти ./scripts/dev.sh, потім повтори виклик.`,
    );
    this.name = 'ApiUnavailableError';
    if (cause !== undefined) this.cause = cause;
  }
}

/**
 * Base request: fetch + JSON parse. Never logs headers (sanitization —
 * request/response headers are never surfaced to callers or diagnostics).
 * Returns `unknown` — callers validate the shape they need with their own
 * narrow Zod schema below.
 *
 * Uses `requestTimeoutMs` (short, default 15s) — a single HTTP call, even one
 * that kicks off a review run, returns almost immediately. `runTimeoutMs`
 * (default 180s) bounds the separate poll-until-done loop in the
 * `run_agent_on_pull_request` tool, not any individual request here.
 */
export async function request(path: string, init?: RequestInit): Promise<unknown> {
  let response: Response;
  try {
    response = await fetch(`${config.apiUrl}${path}`, {
      ...init,
      signal: AbortSignal.timeout(config.requestTimeoutMs),
    });
  } catch (err) {
    throw new ApiUnavailableError(err);
  }

  const text = await response.text();
  let body: unknown;
  try {
    body = text.length > 0 ? JSON.parse(text) : undefined;
  } catch {
    body = text;
  }

  if (!response.ok) {
    throw new ApiError(response.status, body, `DevDigest API повернула ${response.status} для ${path}`);
  }

  return body;
}

/**
 * Narrow, local contracts for the fields resolvers/tools actually consume —
 * deliberately NOT the full vendored `@devdigest/shared` contracts. The
 * server is free to add fields; `.passthrough()` means an unrelated schema
 * evolution over there never breaks parsing here.
 */
export const RepoSummary = z
  .object({
    id: z.string(),
    full_name: z.string(),
  })
  .passthrough();
export type RepoSummary = z.infer<typeof RepoSummary>;

export const PullSummary = z
  .object({
    id: z.string().nullish(),
    number: z.number().int(),
    title: z.string().optional(),
  })
  .passthrough();
export type PullSummary = z.infer<typeof PullSummary>;

export const AgentSummary = z
  .object({
    id: z.string(),
    name: z.string(),
    description: z.string().nullish(),
    provider: z.string().optional(),
    model: z.string().optional(),
    enabled: z.boolean().optional(),
  })
  .passthrough();
export type AgentSummary = z.infer<typeof AgentSummary>;

export async function getRepos(): Promise<RepoSummary[]> {
  const body = await request('/repos');
  return z.array(RepoSummary).parse(body);
}

export async function getPulls(repoId: string): Promise<PullSummary[]> {
  const body = await request(`/repos/${encodeURIComponent(repoId)}/pulls`);
  return z.array(PullSummary).parse(body);
}

export async function getAgents(): Promise<AgentSummary[]> {
  const body = await request('/agents');
  return z.array(AgentSummary).parse(body);
}

/**
 * `GET /pulls/:id/reviews` → persisted reviews + findings for a PR
 * (`server/src/modules/reviews/routes.ts:129`). Narrow projection of
 * `ReviewDto` (`server/src/modules/reviews/helpers.ts`) — only the fields
 * `get_findings` actually consumes.
 */
export const ReviewFinding = z
  .object({
    severity: z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']),
    category: z.string(),
    title: z.string(),
    file: z.string(),
    start_line: z.number().int(),
    end_line: z.number().int(),
    rationale: z.string(),
    suggestion: z.string().nullable(),
  })
  .passthrough();
export type ReviewFinding = z.infer<typeof ReviewFinding>;

export const ReviewSummary = z
  .object({
    id: z.string(),
    agent_id: z.string().nullable(),
    agent_name: z.string().nullish(),
    // Ties a persisted review back to the `agent_runs` row that produced it
    // (`server/src/modules/reviews/helpers.ts` `ReviewDto.run_id`) — needed to
    // match the review for a just-finished run rather than guessing "newest".
    run_id: z.string().nullable(),
    verdict: z.string().nullable(),
    score: z.number().nullable(),
    created_at: z.string(),
    findings: z.array(ReviewFinding),
  })
  .passthrough();
export type ReviewSummary = z.infer<typeof ReviewSummary>;

export async function getReviews(pullId: string): Promise<ReviewSummary[]> {
  const body = await request(`/pulls/${encodeURIComponent(pullId)}/reviews`);
  return z.array(ReviewSummary).parse(body);
}

/**
 * `GET /repos/:id/conventions` → `ConventionsPage` (`server/src/modules/
 * conventions/routes.ts:93`). Narrow projection of `ConventionCandidate`
 * (`server/src/vendor/shared/contracts/knowledge.ts:211`).
 */
export const ConventionCandidateSummary = z
  .object({
    id: z.string(),
    category: z.string(),
    rule: z.string(),
    confidence: z.number(),
    support: z.number().int(),
    violations: z.number().int(),
    origin: z.string(),
    status: z.string(),
    skill_id: z.string().nullable(),
  })
  .passthrough();
export type ConventionCandidateSummary = z.infer<typeof ConventionCandidateSummary>;

export const ConventionsPageSummary = z
  .object({
    scan: z
      .object({
        status: z.string(),
        finished_at: z.string().nullable(),
      })
      .passthrough()
      .nullable(),
    candidates: z.array(ConventionCandidateSummary),
  })
  .passthrough();
export type ConventionsPageSummary = z.infer<typeof ConventionsPageSummary>;

export async function getConventionsPage(repoId: string): Promise<ConventionsPageSummary> {
  const body = await request(`/repos/${encodeURIComponent(repoId)}/conventions`);
  return ConventionsPageSummary.parse(body);
}

/**
 * `POST /pulls/:id/review` `{agentId}` → kicks off one review run and
 * returns immediately with the run's identity; the run itself finishes
 * asynchronously (`server/src/modules/reviews/routes.ts:27`,
 * `service.ts:103` `runReview`). Narrow projection of the `runs[]` entry —
 * only `run_id`/`agent_id`/`agent_name`, which is all `run_agent_on_pull_request`
 * needs to start polling.
 */
export const PostReviewRun = z
  .object({
    run_id: z.string(),
    agent_id: z.string(),
    agent_name: z.string(),
  })
  .passthrough();
export type PostReviewRun = z.infer<typeof PostReviewRun>;

export const PostReviewResponse = z
  .object({
    pr_id: z.string(),
    runs: z.array(PostReviewRun),
  })
  .passthrough();
export type PostReviewResponse = z.infer<typeof PostReviewResponse>;

export async function postReview(pullId: string, agentId: string): Promise<PostReviewResponse> {
  const body = await request(`/pulls/${encodeURIComponent(pullId)}/review`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ agentId }),
  });
  return PostReviewResponse.parse(body);
}

/**
 * `GET /pulls/:id/runs` → the PR's whole run history, any status
 * (`server/src/modules/reviews/routes.ts:101`). Narrow projection of the
 * vendored `RunSummary` (`server/src/vendor/shared/contracts/trace.ts:97`) —
 * only the fields `pollUntilTerminal` and `run_agent_on_pull_request` need to
 * decide whether a run is done, failed, cancelled, or still running.
 */
export const RunSummary = z
  .object({
    run_id: z.string(),
    status: z.string().nullable(), // running | done | failed | cancelled
    error: z.string().nullable(),
  })
  .passthrough();
export type RunSummary = z.infer<typeof RunSummary>;

export async function getRuns(pullId: string): Promise<RunSummary[]> {
  const body = await request(`/pulls/${encodeURIComponent(pullId)}/runs`);
  return z.array(RunSummary).parse(body);
}

/**
 * `GET /pulls/:id/blast` → `PrBlastResponse` (`server/src/modules/blast/
 * routes.ts`, contract at `server/src/vendor/shared/contracts/brief.ts`).
 * Narrow local projection, not the full vendored contract — same style as
 * the rest of this file. `blast` is nullable (only on `status: 'degraded'`,
 * per the server contract).
 */
export const BlastCallerSummary = z
  .object({
    name: z.string(),
    file: z.string(),
    line: z.number().int(),
  })
  .passthrough();
export type BlastCallerSummary = z.infer<typeof BlastCallerSummary>;

export const ChangedSymbolSummary = z
  .object({
    name: z.string(),
    file: z.string(),
    kind: z.string(),
  })
  .passthrough();
export type ChangedSymbolSummary = z.infer<typeof ChangedSymbolSummary>;

export const DownstreamImpactSummary = z
  .object({
    symbol: z.string(),
    callers: z.array(BlastCallerSummary),
    endpoints_affected: z.array(z.string()),
    crons_affected: z.array(z.string()),
    callers_truncated: z.boolean(),
  })
  .passthrough();
export type DownstreamImpactSummary = z.infer<typeof DownstreamImpactSummary>;

export const BlastRadiusSummary = z
  .object({
    changed_symbols: z.array(ChangedSymbolSummary),
    downstream: z.array(DownstreamImpactSummary),
    summary: z.string(),
  })
  .passthrough();
export type BlastRadiusSummary = z.infer<typeof BlastRadiusSummary>;

export const PrBlastResponseSummary = z
  .object({
    status: BlastStatus,
    reason: z.string().nullable(),
    blast: BlastRadiusSummary.nullable(),
    counts: z
      .object({
        symbols: z.number().int(),
        callers: z.number().int(),
        endpoints: z.number().int(),
        crons: z.number().int(),
      })
      .passthrough(),
  })
  .passthrough();
export type PrBlastResponseSummary = z.infer<typeof PrBlastResponseSummary>;

export async function getBlast(pullId: string): Promise<PrBlastResponseSummary> {
  const body = await request(`/pulls/${encodeURIComponent(pullId)}/blast`);
  return PrBlastResponseSummary.parse(body);
}
