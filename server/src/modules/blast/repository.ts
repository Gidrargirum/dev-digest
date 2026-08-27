import { and, eq, inArray, ne, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import { PRIOR_PRS_LIMIT, PRIOR_PRS_PATH_LIMIT } from './constants.js';

/** `resolvePr`'s result — just enough to call `repoIntel.getBlastRadius`. */
export interface ResolvedPr {
  id: string;
  repoId: string;
}

/** One row of `findPriorPrs` — mapped into `PriorPrRef` by `helpers.ts`. */
export interface PriorPrRow {
  number: number;
  title: string;
  updatedAt: Date | null;
  overlapCount: number;
}

/**
 * `blast` data access — two workspace-scoped reads, no new tables.
 *
 * Tenancy is enforced IN the query, not checked afterwards: `resolvePr` joins
 * `pull_requests` → `repos` and filters on `repos.workspace_id` in the same
 * `WHERE`, so a `prId` that does not exist and a `prId` that belongs to
 * another workspace both come back `undefined` — indistinguishable, by
 * design (mirrors `IntentRepository.findIntentForWorkspace` and
 * `ConventionsRepository`'s workspace-scoped lookups).
 */
export class BlastRepository {
  constructor(private db: Db) {}

  async resolvePr(workspaceId: string, prId: string): Promise<ResolvedPr | undefined> {
    const [row] = await this.db
      .select({ id: t.pullRequests.id, repoId: t.pullRequests.repoId })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.id, prId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }

  async getChangedFiles(prId: string): Promise<string[]> {
    const rows = await this.db
      .select({ path: t.prFiles.path })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
    return rows.map((r) => r.path);
  }

  /**
   * "Prior PRs touching these files" — any PR in `repoId` (any status,
   * excluding `prId` itself) that shares at least one changed file with the
   * current PR, ranked by overlap and recency. Independent of repo-intel —
   * this is a plain aggregate over `pr_files`/`pull_requests`.
   *
   * `paths` is truncated to `PRIOR_PRS_PATH_LIMIT` before the query
   * (deterministically, same order `getChangedFiles` returns) so a giant PR
   * doesn't build an `IN (...)` with thousands of params. An empty `paths`
   * returns `[]` without touching the DB — an empty `IN ()` is a SQL/Drizzle
   * syntax trap, not a "no rows" query.
   */
  async findPriorPrs(repoId: string, prId: string, paths: string[]): Promise<PriorPrRow[]> {
    if (paths.length === 0) return [];
    const boundedPaths = paths.slice(0, PRIOR_PRS_PATH_LIMIT);

    const rows = await this.db
      .select({
        number: t.pullRequests.number,
        title: t.pullRequests.title,
        updatedAt: t.pullRequests.updatedAt,
        overlapCount: sql<number>`count(distinct ${t.prFiles.path})`.mapWith(Number),
      })
      .from(t.prFiles)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prFiles.prId))
      .where(
        and(
          eq(t.pullRequests.repoId, repoId),
          ne(t.pullRequests.id, prId),
          inArray(t.prFiles.path, boundedPaths),
        ),
      )
      .groupBy(t.pullRequests.id, t.pullRequests.number, t.pullRequests.title, t.pullRequests.updatedAt)
      .orderBy(sql`${t.pullRequests.updatedAt} desc nulls last`)
      .limit(PRIOR_PRS_LIMIT);

    return rows;
  }
}
