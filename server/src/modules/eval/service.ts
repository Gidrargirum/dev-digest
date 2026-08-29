import type { Container } from '../../platform/container.js';
import type {
  EvalBatch,
  EvalCase,
  EvalCaseInput,
  EvalDashboard,
  EvalRunRecord,
} from '@devdigest/shared';
import { BadRequestError } from '../../platform/errors.js';
import { EvalRepository } from './repository.js';
import { toEvalBatchDto, toEvalCaseDto, toEvalDashboardRunDto, toEvalRunRecordDto } from './helpers.js';
import { EVAL_CASE_OWNER_KIND } from './constants.js';

/**
 * Eval service — case CRUD + read-side of batches/runs. Batch EXECUTION
 * (kicking off a run) lives in `batch-executor.ts`; this class owns the
 * simpler CRUD/read use cases so `routes.ts` has one place to construct.
 * Takes `Container`; must not import `adapters/**` or `db/schema` directly.
 */
export class EvalService {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  // ---- Cases ----------------------------------------------------------

  async listCases(workspaceId: string, agentId: string): Promise<EvalCase[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listCasesForAgent(workspaceId, agentId);
    return rows.map(toEvalCaseDto);
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getCase(workspaceId, caseId);
    return row ? toEvalCaseDto(row) : undefined;
  }

  /**
   * Create an eval case for an agent. Rejects a non-'agent' owner_kind with
   * `400` (Non-goal: `owner_kind='skill'` is out of scope) and persists the
   * frozen diff/files/meta verbatim (AC-5) — never re-reads GitHub.
   */
  async createCase(
    workspaceId: string,
    agentId: string,
    input: EvalCaseInput,
  ): Promise<EvalCase | undefined> {
    if (input.owner_kind !== EVAL_CASE_OWNER_KIND) {
      throw new BadRequestError(`owner_kind must be '${EVAL_CASE_OWNER_KIND}'`);
    }
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.insertCase({
      workspaceId,
      ownerId: agentId,
      name: input.name,
      inputDiff: input.input_diff,
      inputFiles: input.input_files,
      inputMeta: input.input_meta,
      expectationType: input.expectation_type,
      expectedOutput: input.expected_output,
      notes: input.notes,
    });
    return toEvalCaseDto(row);
  }

  async updateCase(
    workspaceId: string,
    caseId: string,
    patch: Partial<EvalCaseInput>,
  ): Promise<EvalCase | undefined> {
    if (patch.owner_kind !== undefined && patch.owner_kind !== EVAL_CASE_OWNER_KIND) {
      throw new BadRequestError(`owner_kind must be '${EVAL_CASE_OWNER_KIND}'`);
    }
    const row = await this.repo.updateCase(workspaceId, caseId, {
      ...(patch.name !== undefined ? { name: patch.name } : {}),
      ...(patch.input_diff !== undefined ? { inputDiff: patch.input_diff } : {}),
      ...(patch.input_files !== undefined ? { inputFiles: patch.input_files } : {}),
      ...(patch.input_meta !== undefined ? { inputMeta: patch.input_meta } : {}),
      ...(patch.expectation_type !== undefined ? { expectationType: patch.expectation_type } : {}),
      ...(patch.expected_output !== undefined ? { expectedOutput: patch.expected_output } : {}),
      ...(patch.notes !== undefined ? { notes: patch.notes } : {}),
    });
    return row ? toEvalCaseDto(row) : undefined;
  }

  async deleteCase(workspaceId: string, caseId: string): Promise<boolean> {
    return this.repo.deleteCase(workspaceId, caseId);
  }

  // ---- Batches / runs (reads) ------------------------------------------

  async listBatchesForAgent(workspaceId: string, agentId: string): Promise<EvalBatch[] | undefined> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const rows = await this.repo.listBatchesForAgent(workspaceId, agentId);
    return rows.map(toEvalBatchDto);
  }

  async getBatchDetail(
    workspaceId: string,
    batchId: string,
  ): Promise<{ batch: EvalBatch; runs: EvalRunRecord[] } | undefined> {
    const batchRow = await this.repo.getBatch(workspaceId, batchId);
    if (!batchRow) return undefined;
    const runRows = await this.repo.listRunsForBatch(batchId);
    return {
      batch: toEvalBatchDto(batchRow),
      runs: runRows.map(toEvalRunRecordDto),
    };
  }

  /** Workspace-wide dashboard: every agent in the workspace (with its latest
   *  batch, or `null` if it has never run one) + the most recent runs across
   *  the workspace (AC-31/32). Return type is the contract's `EvalDashboard`,
   *  not an ad-hoc shape — see `@devdigest/shared`. */
  async dashboard(workspaceId: string): Promise<EvalDashboard> {
    const [agentEntries, recentRuns] = await Promise.all([
      this.repo.listAgentDashboardEntries(workspaceId),
      this.repo.recentRunsForWorkspace(workspaceId),
    ]);
    return {
      agents: agentEntries.map((entry) => ({
        agent_id: entry.agentId,
        agent_name: entry.agentName,
        agent_model: entry.agentModel,
        latest_batch: entry.latestBatch ? toEvalBatchDto(entry.latestBatch) : null,
      })),
      recent_runs: recentRuns.map(toEvalDashboardRunDto),
    };
  }
}
