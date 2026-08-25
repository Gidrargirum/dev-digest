import { and, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** `resolvePr`'s result — just enough to call `repoIntel.getBlastRadius`. */
export interface ResolvedPr {
  id: string;
  repoId: string;
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
}
