import { getConventionsPage } from '../api/client.js';
import { resolveRepo } from '../api/resolve.js';
import { paginate } from './pagination.js';
import type { GetConventionsInput, GetConventionsOutput } from './schemas.js';

/**
 * Fetches learned coding conventions for a repo, optionally filtered by
 * category/status, paginated. `scan === null` (never scanned) is a
 * successful, empty response — not an error, same rule as `list_agents`.
 */
export async function getConventions(input: GetConventionsInput): Promise<GetConventionsOutput> {
  const repo = await resolveRepo(input.repo);
  const conventionsPage = await getConventionsPage(repo.id);

  if (conventionsPage.scan === null) {
    return { scan: null, conventions: [], next_cursor: null };
  }

  const filtered = conventionsPage.candidates.filter((candidate) => {
    if (input.category && candidate.category !== input.category) return false;
    if (input.status && candidate.status !== input.status) return false;
    return true;
  });

  const projected = filtered.map((candidate) => ({
    id: candidate.id,
    category: candidate.category,
    rule: candidate.rule,
    confidence: candidate.confidence,
    support: candidate.support,
    violations: candidate.violations,
    origin: candidate.origin,
    status: candidate.status,
    applied_as_skill: candidate.skill_id !== null,
  }));

  const { page, next_cursor } = paginate(projected, input.cursor, input.limit);

  return {
    scan: {
      status: conventionsPage.scan.status,
      finished_at: conventionsPage.scan.finished_at,
    },
    conventions: page,
    next_cursor,
  };
}
