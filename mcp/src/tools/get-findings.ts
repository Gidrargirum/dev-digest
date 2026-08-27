import { getReviews, type ReviewSummary } from '../api/client.js';
import { resolvePull, resolveRepo } from '../api/resolve.js';
import { paginate } from './pagination.js';
import type { Finding, GetFindingsInput, GetFindingsOutput } from './schemas.js';

function toFinding(f: ReviewSummary['findings'][number]): Finding {
  return {
    severity: f.severity,
    category: f.category,
    title: f.title,
    file: f.file,
    start_line: f.start_line,
    end_line: f.end_line,
    rationale: f.rationale,
    suggestion: f.suggestion ?? null,
  };
}

/** Most recent review wins, by `created_at`. */
function latestOf(reviews: readonly ReviewSummary[]): ReviewSummary | undefined {
  return reviews.reduce<ReviewSummary | undefined>((latest, review) => {
    if (!latest) return review;
    return new Date(review.created_at) > new Date(latest.created_at) ? review : latest;
  }, undefined);
}

/**
 * Fetches findings and verdicts for a PR. No `review_id` → aggregates the
 * latest review per agent (grouped by `agent_id`); `verdict`/`score` come
 * from the single most recent review across all agents. An empty result
 * (no reviews have ever run) is a successful, empty response — not an
 * error — same rule as `list_agents`.
 */
export async function getFindings(input: GetFindingsInput): Promise<GetFindingsOutput> {
  const repo = await resolveRepo(input.repo);
  const pull = await resolvePull(repo.id, input.pr);
  const allReviews = await getReviews(pull.id);

  let selected: ReviewSummary[];
  if (input.review_id) {
    selected = allReviews.filter((r) => r.id === input.review_id);
  } else {
    const latestPerAgent = new Map<string, ReviewSummary>();
    for (const review of allReviews) {
      const key = review.agent_id ?? review.id;
      const existing = latestPerAgent.get(key);
      if (!existing || new Date(review.created_at) > new Date(existing.created_at)) {
        latestPerAgent.set(key, review);
      }
    }
    selected = [...latestPerAgent.values()];
  }

  const overall = latestOf(selected);
  const allFindings = selected.flatMap((r) => r.findings.map(toFinding));
  const { page, next_cursor } = paginate(allFindings, input.cursor, input.limit);

  return {
    verdict: overall?.verdict ?? null,
    score: overall?.score ?? null,
    reviews: selected.map((r) => ({
      review_id: r.id,
      agent_name: r.agent_name ?? null,
      verdict: r.verdict ?? null,
      score: r.score ?? null,
    })),
    findings: page,
    next_cursor,
  };
}
