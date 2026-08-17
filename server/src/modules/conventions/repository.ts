import { and, desc, eq, inArray } from 'drizzle-orm';
import type { ConventionCategory, ConventionOrigin, ConventionStatus } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';

/**
 * Conventions data-access layer — the ONLY place touching `conventions` and
 * `convention_scans`. Every workspace-owned query carries `workspaceId`
 * (tenancy guard), mirroring `SkillsRepository`.
 */

export interface InsertConvention {
  workspaceId: string;
  repoId: string;
  scanId: string;
  category: ConventionCategory;
  rule: string;
  ruleHash: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceEndLine: number;
  evidenceSnippet: string;
  confidence: number;
  modelConfidence: number | null;
  support: number;
  violations: number;
  origin: ConventionOrigin;
}

export interface UpdateConvention {
  status?: ConventionStatus;
  rule?: string;
  category?: ConventionCategory;
}

export interface FinishScan {
  status: 'done' | 'failed';
  sampleFiles?: number;
  candidatesRaw?: number;
  candidatesKept?: number;
  model?: string | null;
  tokensIn?: number | null;
  tokensOut?: number | null;
  costUsd?: number | null;
  error?: string | null;
}

export class ConventionsRepository {
  constructor(private db: Db) {}

  // ------------------------------------------------------------------ repos

  /**
   * The `owner/name` pair a `GitClient` needs to read files out of the clone.
   * Reading another module's table from a repository is the sanctioned shape
   * here (`SkillsRepository` reads `agents`/`findings`/`reviews` the same way);
   * what is forbidden is importing another module's data layer.
   */
  async getRepoRef(
    workspaceId: string,
    repoId: string,
  ): Promise<{ owner: string; name: string } | undefined> {
    const [row] = await this.db
      .select({ owner: t.repos.owner, name: t.repos.name })
      .from(t.repos)
      .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.id, repoId)));
    return row;
  }

  /**
   * The workspace's `feature_models` blob, unparsed. Read here rather than
   * imported from the settings module: modules are siblings, not a hierarchy
   * (`no-cross-module-imports`), and the registry of defaults already lives in
   * `@devdigest/shared`, which every ring may import.
   */
  async featureModels(workspaceId: string): Promise<unknown> {
    const [row] = await this.db
      .select({ value: t.settings.value })
      .from(t.settings)
      .where(and(eq(t.settings.workspaceId, workspaceId), eq(t.settings.key, 'feature_models')));
    return row?.value;
  }

  // ------------------------------------------------------------------ scans

  async createScan(workspaceId: string, repoId: string): Promise<ConventionScanRow> {
    const [row] = await this.db
      .insert(t.conventionScans)
      .values({ workspaceId, repoId, status: 'queued' })
      .returning();
    return row!;
  }

  async markScanRunning(scanId: string): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ status: 'running' })
      .where(eq(t.conventionScans.id, scanId));
  }

  async finishScan(scanId: string, patch: FinishScan): Promise<void> {
    await this.db
      .update(t.conventionScans)
      .set({ ...patch, finishedAt: new Date() })
      .where(eq(t.conventionScans.id, scanId));
  }

  async getScan(workspaceId: string, scanId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.id, scanId)));
    return row;
  }

  /**
   * Mark scans left `running`/`queued` by a dead process as failed. Without
   * this the UI polls a row that will never resolve — the same orphan problem
   * `ReviewRepository.reapStaleRunningRuns` solves for agent runs.
   */
  async reapStaleScans(): Promise<number> {
    const rows = await this.db
      .update(t.conventionScans)
      .set({
        status: 'failed',
        error: 'Interrupted — the API restarted while this scan was running.',
        finishedAt: new Date(),
      })
      .where(inArray(t.conventionScans.status, ['queued', 'running']))
      .returning({ id: t.conventionScans.id });
    return rows.length;
  }

  async latestScan(workspaceId: string, repoId: string): Promise<ConventionScanRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventionScans)
      .where(
        and(eq(t.conventionScans.workspaceId, workspaceId), eq(t.conventionScans.repoId, repoId)),
      )
      .orderBy(desc(t.conventionScans.createdAt))
      .limit(1);
    return row;
  }

  // ------------------------------------------------------------- candidates

  async insertCandidates(values: InsertConvention[]): Promise<ConventionRow[]> {
    if (values.length === 0) return [];
    return this.db.insert(t.conventions).values(values).returning();
  }

  async listByRepo(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.repoId, repoId)))
      .orderBy(desc(t.conventions.confidence));
  }

  async listByIds(workspaceId: string, repoId: string, ids: string[]): Promise<ConventionRow[]> {
    if (ids.length === 0) return [];
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          inArray(t.conventions.id, ids),
        ),
      );
  }

  async listAccepted(workspaceId: string, repoId: string): Promise<ConventionRow[]> {
    return this.db
      .select()
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          eq(t.conventions.status, 'accepted'),
        ),
      )
      .orderBy(desc(t.conventions.confidence));
  }

  async getById(workspaceId: string, id: string): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.conventions)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)));
    return row;
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateConvention,
  ): Promise<ConventionRow | undefined> {
    const [row] = await this.db
      .update(t.conventions)
      .set(patch)
      .where(and(eq(t.conventions.workspaceId, workspaceId), eq(t.conventions.id, id)))
      .returning();
    return row;
  }

  /**
   * Rule hashes already decided in this repo — the dedup set a re-scan filters
   * against, so an accepted or rejected rule is never proposed twice.
   */
  async decidedRuleHashes(workspaceId: string, repoId: string): Promise<Set<string>> {
    const rows = await this.db
      .select({ ruleHash: t.conventions.ruleHash })
      .from(t.conventions)
      .where(
        and(
          eq(t.conventions.workspaceId, workspaceId),
          eq(t.conventions.repoId, repoId),
          // DECIDED only. Including `pending` here would make every re-scan
          // filter out the candidates it just re-derived, and the subsequent
          // `replacePending` would then leave the user with an empty list.
          inArray(t.conventions.status, ['accepted', 'rejected']),
        ),
      );
    return new Set(rows.map((r) => r.ruleHash));
  }

  /**
   * Supersede the previous scan's undecided candidates with this scan's, in ONE
   * transaction. Split across two statements, a failed insert would leave the
   * user with nothing, and a read landing between them would see an empty list
   * for a scan that is about to succeed.
   */
  async replacePending(
    workspaceId: string,
    repoId: string,
    values: InsertConvention[],
  ): Promise<ConventionRow[]> {
    return this.db.transaction(async (tx) => {
      await tx
        .delete(t.conventions)
        .where(
          and(
            eq(t.conventions.workspaceId, workspaceId),
            eq(t.conventions.repoId, repoId),
            eq(t.conventions.status, 'pending'),
          ),
        );
      if (values.length === 0) return [];
      return tx.insert(t.conventions).values(values).returning();
    });
  }

  async markLinkedToSkill(workspaceId: string, ids: string[], skillId: string): Promise<void> {
    if (ids.length === 0) return;
    await this.db
      .update(t.conventions)
      .set({ skillId })
      .where(and(eq(t.conventions.workspaceId, workspaceId), inArray(t.conventions.id, ids)));
  }
}
