import { and, desc, eq, isNull, or } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { EvalBatchRow, EvalCaseRow, EvalRunRow } from '../../db/rows.js';
import { EVAL_CASE_OWNER_KIND_AGENT, DASHBOARD_RECENT_RUNS_LIMIT } from './constants.js';

type EvalOwnerKind = 'agent' | 'skill';

/**
 * Eval data-access. The ONLY file in this module touching `db/schema` —
 * `eval_cases`, `eval_batches`, `eval_runs`. Every query is workspace-scoped;
 * a cross-workspace id resolves to `undefined`/`[]` so the service/route maps
 * that to 404 (AC-34) rather than leaking a row across tenants.
 */

export interface InsertEvalCase {
  workspaceId: string;
  ownerKind: EvalOwnerKind;
  ownerId: string;
  /** Required for `ownerKind: 'skill'` (AC-38); enforced by the service. */
  baselineAgentId?: string | null;
  name: string;
  inputDiff?: string;
  inputFiles?: unknown;
  inputMeta?: unknown;
  expectationType: 'must_find' | 'must_not_flag';
  expectedOutput: unknown;
  notes?: string | null;
}

export interface UpdateEvalCase {
  baselineAgentId?: string | null;
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
  /** What the batch measures (AC-40) — defaults to 'agent' behavior when
   *  omitted, matching every batch inserted before Amendment A. */
  ownerKind: EvalOwnerKind;
  ownerId: string;
  /** The skill's version in force at execution time — null for an agent batch. */
  skillVersion?: number | null;
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
  /** Batch-level marginal effect (AC-50) — null for an agent batch. */
  marginalRecall?: number | null;
  marginalPrecision?: number | null;
  marginalCitationAccuracy?: number | null;
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

  async listCasesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalCaseRow[]> {
    return this.db
      .select()
      .from(t.evalCases)
      .where(
        and(
          eq(t.evalCases.workspaceId, workspaceId),
          eq(t.evalCases.ownerKind, ownerKind),
          eq(t.evalCases.ownerId, ownerId),
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
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        baselineAgentId: values.baselineAgentId ?? null,
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
        ...(patch.baselineAgentId !== undefined ? { baselineAgentId: patch.baselineAgentId } : {}),
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
        ownerKind: values.ownerKind,
        ownerId: values.ownerId,
        skillVersion: values.skillVersion ?? null,
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
        ...(patch.marginalRecall !== undefined ? { marginalRecall: patch.marginalRecall } : {}),
        ...(patch.marginalPrecision !== undefined ? { marginalPrecision: patch.marginalPrecision } : {}),
        ...(patch.marginalCitationAccuracy !== undefined
          ? { marginalCitationAccuracy: patch.marginalCitationAccuracy }
          : {}),
      })
      .where(eq(t.evalBatches.id, batchId));
  }

  /**
   * A batch's history for its owner. For `ownerKind: 'agent'`, includes both
   * (a) batches explicitly recorded with `ownerKind = 'agent' AND ownerId =
   * agentId` and (b) historical rows from before this column existed, which
   * have `ownerId IS NULL` but a matching `agentId` — without the fallback an
   * agent's pre-Amendment-A run history would silently disappear.
   */
  async listBatchesForOwner(
    workspaceId: string,
    ownerKind: EvalOwnerKind,
    ownerId: string,
  ): Promise<EvalBatchRow[]> {
    const ownerMatch =
      ownerKind === EVAL_CASE_OWNER_KIND_AGENT
        ? or(
            and(eq(t.evalBatches.ownerKind, ownerKind), eq(t.evalBatches.ownerId, ownerId)),
            and(isNull(t.evalBatches.ownerId), eq(t.evalBatches.agentId, ownerId)),
          )
        : and(eq(t.evalBatches.ownerKind, ownerKind), eq(t.evalBatches.ownerId, ownerId));
    return this.db
      .select()
      .from(t.evalBatches)
      .where(and(eq(t.evalBatches.workspaceId, workspaceId), ownerMatch))
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

  /** The most recent run for each case belonging to an owner (agent or
   *  skill, one row per case, newest first) — used for the case list's "last
   *  run" column. */
  async latestRunPerOwner(ownerKind: EvalOwnerKind, ownerId: string): Promise<EvalRunWithCaseName[]> {
    const rows = await this.db
      .select({ run: t.evalRuns, caseName: t.evalCases.name })
      .from(t.evalRuns)
      .innerJoin(t.evalCases, eq(t.evalRuns.caseId, t.evalCases.id))
      .where(and(eq(t.evalCases.ownerKind, ownerKind), eq(t.evalCases.ownerId, ownerId)))
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
      // A-4: the workspace dashboard is agent-only — skill batches never
      // appear here, only on the skill's own Evals tab.
      .where(
        and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.ownerKind, EVAL_CASE_OWNER_KIND_AGENT)),
      )
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
      // A-4: agent-only dashboard — a skill batch must never surface here as
      // if it were an agent's own run.
      this.db
        .select()
        .from(t.evalBatches)
        .where(
          and(eq(t.evalBatches.workspaceId, workspaceId), eq(t.evalBatches.ownerKind, EVAL_CASE_OWNER_KIND_AGENT)),
        )
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
