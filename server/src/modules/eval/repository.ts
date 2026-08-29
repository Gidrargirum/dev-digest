import { and, desc, eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalBatchRow, EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import { EVAL_CASE_OWNER_KIND, DASHBOARD_RECENT_RUNS_LIMIT } from './constants.js';

/**
 * Eval data-access. The ONLY file in this module touching `db/schema` —
 * `eval_cases`, `eval_batches`, `eval_runs`. Every query is workspace-scoped;
 * a cross-workspace id resolves to `undefined`/`[]` so the service/route maps
 * that to 404 (AC-34) rather than leaking a row across tenants.
 */

export interface InsertEvalCase {
  workspaceId: string;
  ownerId: string;
  name: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectationType: 'must_find' | 'must_not_flag';
  expectedOutput: unknown;
  notes?: string | null;
}

export interface UpdateEvalCase {
  name?: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectationType?: 'must_find' | 'must_not_flag';
  expectedOutput?: unknown;
  notes?: string | null;
}

export interface InsertEvalBatch {
  workspaceId: string;
  agentId: string;
  agentVersion: number;
}

export interface FinishEvalBatch {
  status: 'done' | 'failed' | 'cancelled';
  casesTotal: number;
  casesPassed: number;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  noFlagRate: number | null;
  costUsd: number | null;
  durationMs: number;
}

export interface InsertEvalRun {
  caseId: string;
  batchId: string;
  actualOutput?: unknown;
  pass: boolean | null;
  recall: number | null;
  precision: number | null;
  citationAccuracy: number | null;
  matched?: unknown;
  unmatched?: unknown;
  durationMs: number | null;
  costUsd: number | null;
}

/** One run row joined with its case's name, for history/detail views. */
export type EvalRunWithCaseName = EvalRunRow & { caseName?: string };

/** One `recentRunsForWorkspace` row: a run joined with its case name AND the
 *  owning agent's name + the batch's agent version — the dashboard's
 *  `Recent runs` table spans every agent, so each row must name its own
 *  agent (AC-32). */
export type EvalRunWithAgent = EvalRunWithCaseName & {
  agentId: string;
  agentName: string;
  agentVersion: number;
};

/** One dashboard agent-list row: an agent plus its most recent batch, or
 *  `null` if it has never run one. */
export interface EvalAgentDashboardEntry {
  agentId: string;
  agentName: string;
  agentModel: string;
  latestBatch: EvalBatchRow | null;
}

export class EvalRepository {
  constructor(private db: Db) {}

  async listCasesForAgent(workspaceId: string, agentId: string): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, EVAL_CASE_OWNER_KIND),
          eq(t.evalCases.ownerId, agentId),
        ),
      );
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)));
    return row;
  }

  async insertCase(values: InsertEvalCase): Promise<EvalCaseRow> {
    const [row] = await this.db
      .insert(t.evalCases)
      .values({
        workspaceId: values.workspaceId,
        ownerKind: EVAL_CASE_OWNER_KIND,
        ownerId: values.ownerId,
        name: values.name,
        inputDiff: values.inputDiff ?? '',
        inputFiles: (values.inputFiles as object | undefined) ?? null,
        inputMeta: (values.inputMeta as object | undefined) ?? null,
        expectationType: values.expectationType,
        expectedOutput: values.expectedOutput as object,
        notes: values.notes ?? null,
      })
      .returning();
    return row!;
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: UpdateEvalCase,
  ): Promise<EvalCaseRow | undefined> {
    const [row] = await this.db
      .update(t.evalCases)
      .set({
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.inputDiff !== undefined ? { inputDiff: patch.inputDiff } : {}),
        ...(patch.inputFiles !== undefined ? { inputFiles: patch.inputFiles as object } : {}),
        ...(patch.inputMeta !== undefined ? { inputMeta: patch.inputMeta as object } : {}),
        ...(patch.expectationType !== undefined ? { expectationType: patch.expectationType } : {}),
        ...(patch.expectedOutput !== undefined ? { expectedOutput: patch.expectedOutput as object } : {}),
        ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
      })
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning();
    return row;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    const rows = await this.db
      .delete(t.evalCases)
      .where(and(eq(t.evalCases.workspaceId, workspaceId), eq(t.evalCases.id, caseId)))
      .returning({ id: t.evalCases.id });
    return rows.length > 0;
  }

  async insertBatch(values: InsertEvalBatch): Promise<EvalBatchRow> {
    const [row] = await this.db
      .insert(t.evalBatches)
      .values({
        workspaceId: values.workspaceId,
        agentId: values.agentId,
        agentVersion: values.agentVersion,
        status: 'running',
      })
      .returning();
    return row!;
  }

  async getBatch(workspaceId: string, batchId: string): Promise<EvalBatchRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.id, batchId)));
    return row;
  }

  async finishBatch(batchId: string, patch: FinishEvalBatch): Promise<void> {
    await this.db
      .update(t.evalBatches)
      .set({
        status: patch.status,
        finishedAt: new Date(),
        casesTotal: patch.casesTotal,
        casesPassed: patch.casesPassed,
        recall: patch.recall,
        precision: patch.precision,
        citationAccuracy: patch.citationAccuracy,
        noFlagRate: patch.noFlagRate,
        costUsd: patch.costUsd,
        durationMs: patch.durationMs,
      })
      .where(eq(t.evalBatches.id, batchId));
  }

  async listBatchesForAgent(workspaceId: string, agentId: string): Promise<EvalBatchRow[]> {
    return this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.agentId, agentId)))
      .orderBy(desc(t.evalBatches.startedAt));
  }

  async insertRun(values: InsertEvalRun): Promise<EvalRunRow> {
    const [row] = await this.db
      .insert(t.evalRuns)
      .values({
        caseId: values.caseId,
        batchId: values.batchId,
        actualOutput: (values.actualOutput as object | undefined) ?? null,
        pass: values.pass,
        recall: values.recall,
        precision: values.precision,
        citationAccuracy: values.citationAccuracy,
        matched: (values.matched as object | undefined) ?? null,
        unmatched: (values.unmatched as object | undefined) ?? null,
        durationMs: values.durationMs,
        costUsd: values.costUsd,
      })
      .returning();
    return row!;
  }

  /** Every run for a batch, joined with its case's name, oldest first. */
  async listRunsForBatch(batchId: string): Promise<EvalRunWithCaseName[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .leftJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(eq(t.evalRuns.batchId, batchId))
      .orderBy(t.evalRuns.ranAt);
    return rows.map((r) => ({ ...r.run, caseName: r.caseName ?? undefined }));
  }

  /** The most recent run for each case belonging to an agent (one row per
   *  case, newest first) — used for the case list's "last run" column. */
  async latestRunPerCase(agentId: string): Promise<EvalRunWithCaseName[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(and(eq(t.evalCases.ownerKind, EVAL_CASE_OWNER_KIND), eq(t.evalCases.ownerId, agentId)))
      .orderBy(desc(t.evalRuns.ranAt));
    const seen = new Set<string>();
    const latest: EvalRunWithCaseName[] = [];
    for (const r of rows) {
      if (seen.has(r.run.caseId)) continue;
      seen.add(r.run.caseId);
      latest.push({ ...r.run, caseName: r.caseName ?? undefined });
    }
    return latest;
  }

  /** Most recent runs across the whole workspace (any agent), newest first —
   *  the dashboard's "Recent runs" panel (AC-31/32). */
  async recentRunsForWorkspace(
    workspaceId: string,
    limit = DASHBOARD_RECENT_RUNS_LIMIT,
  ): Promise<EvalRunWithAgent[]> {
    const rows = await this.db
      .select({
        run: t.evalRuns,
        caseName: t.evalCases.name,
        agentId: t.evalBatches.agentId,
        agentVersion: t.evalBatches.agentVersion,
        agentName: t.agents.name,
      })
      .from(t.evalRuns)
      .innerJoin(t.evalBatches, eq(t.evalRuns.batchId, t.evalBatches.id))
      .innerJoin(t.agents, eq(t.evalBatches.agentId, t.agents.id))
      .leftJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(eq(t.evalBatches.workspaceId, workspaceId))
      .orderBy(desc(t.evalRuns.ranAt))
      .limit(limit);
    return rows.map((r) => ({
      ...r.run,
      caseName: r.caseName ?? undefined,
      agentId: r.agentId,
      agentName: r.agentName,
      agentVersion: r.agentVersion,
    }));
  }

  /** Every agent in the workspace, paired with its most recent batch (or
   *  `null` if it has never run one) — the workspace-wide dashboard agent
   *  list (AC-31). A LEFT JOIN-equivalent: agents without a batch still get
   *  an entry, so the client can render "Configure eval cases →" for them
   *  instead of silently omitting the agent. */
  async listAgentDashboardEntries(workspaceId: string): Promise<EvalAgentDashboardEntry[]> {
    const [agentRows, batchRows] = await Promise.all([
      this.db
        .select({ id: t.agents.id, name: t.agents.name, model: t.agents.model })
        .from(t.agents)
        .where(eq(t.agents.workspaceId, workspaceId)),
      this.db
        .select()
        .from(t.evalBatches)
        .where(eq(t.evalBatches.workspaceId, workspaceId))
        .orderBy(desc(t.evalBatches.startedAt)),
    ]);
    const latestByAgent = new Map<string, EvalBatchRow>();
    for (const row of batchRows) {
      if (!latestByAgent.has(row.agentId)) latestByAgent.set(row.agentId, row);
    }
    return agentRows.map((agent) => ({
      agentId: agent.id,
      agentName: agent.name,
      agentModel: agent.model,
      latestBatch: latestByAgent.get(agent.id) ?? null,
    }));
  }
}
