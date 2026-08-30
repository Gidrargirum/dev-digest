import type { Container } from '../../platform/container.js';
import type {
  EvalBatch,
  EvalCase,
  EvalCaseInput,
  EvalDashboard,
  EvalRunRecord,
} from '@devdigest/shared';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import { EvalRepository } from './repository.js';
import { toEvalBatchDto, toEvalCaseDto, toEvalDashboardRunDto, toEvalRunRecordDto } from './helpers.js';
import { EVAL_CASE_OWNER_KIND_AGENT, EVAL_CASE_OWNER_KIND_SKILL } from './constants.js';

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
    const rows = await this.repo.listCasesForOwner(workspaceId, EVAL_CASE_OWNER_KIND_AGENT, agentId);
    return rows.map(toEvalCaseDto);
  }

  /** Amendment A (AC-54) — the skill-owned equivalent of `listCases`. */
  async listCasesForSkill(workspaceId: string, skillId: string): Promise<EvalCase[] | undefined> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listCasesForOwner(workspaceId, EVAL_CASE_OWNER_KIND_SKILL, skillId);
    return rows.map(toEvalCaseDto);
  }

  async getCase(workspaceId: string, caseId: string): Promise<EvalCase | undefined> {
    const row = await this.repo.getCase(workspaceId, caseId);
    return row ? toEvalCaseDto(row) : undefined;
  }

  /**
   * Resolve and validate a skill-owned case's `baseline_agent_id` (AC-38):
   * required, and must name an agent in the caller's workspace. Shared by
   * `createCase`/`updateCase` (skill path) so the rule is enforced once.
   */
  private async requireBaselineAgent(workspaceId: string, baselineAgentId: string | null | undefined) {
    if (!baselineAgentId) {
      throw new BadRequestError('baseline_agent_id is required when owner_kind is "skill"');
    }
    const agent = await this.container.agentsRepo.getById(workspaceId, baselineAgentId);
    if (!agent) throw new NotFoundError(`baseline agent ${baselineAgentId} not found in this workspace`);
    return agent;
  }

  /**
   * Create an eval case for an agent OR, since Amendment A (AC-36), for a
   * skill. `owner_kind` must match the route's owner (`agentId`/`skillId`
   * below is the id resolved from the route path, not from the body) — a
   * mismatch means the caller is trying to attach the case to a different
   * owner than the URL names, which is a client error, not a lookup miss.
   * Persists the frozen diff/files/meta verbatim (AC-5) — never re-reads
   * GitHub.
   */
  async createCase(
    workspaceId: string,
    agentId: string,
    input: EvalCaseInput,
  ): Promise<EvalCase | undefined> {
    if (input.owner_kind !== EVAL_CASE_OWNER_KIND_AGENT) {
      throw new BadRequestError(`owner_kind must be '${EVAL_CASE_OWNER_KIND_AGENT}'`);
    }
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) return undefined;
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: EVAL_CASE_OWNER_KIND_AGENT,
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

  /** Amendment A (AC-36/AC-37/AC-38) — the skill-owned equivalent of `createCase`. */
  async createCaseForSkill(
    workspaceId: string,
    skillId: string,
    input: EvalCaseInput,
  ): Promise<EvalCase | undefined> {
    if (input.owner_kind !== EVAL_CASE_OWNER_KIND_SKILL) {
      throw new BadRequestError(`owner_kind must be '${EVAL_CASE_OWNER_KIND_SKILL}'`);
    }
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) return undefined; // AC-37: 404, not a lookup miss on the case.
    await this.requireBaselineAgent(workspaceId, input.baseline_agent_id);
    const row = await this.repo.insertCase({
      workspaceId,
      ownerKind: EVAL_CASE_OWNER_KIND_SKILL,
      ownerId: skillId,
      baselineAgentId: input.baseline_agent_id,
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
    // Amendment A (AC-36): 'skill' is a valid owner_kind — the CRUD path no
    // longer hard-rejects it. A patch changing `baseline_agent_id` on a
    // skill-owned case is re-validated the same way case creation is.
    if (patch.baseline_agent_id !== undefined) {
      const existing = await this.repo.getCase(workspaceId, caseId);
      const ownerKind = patch.owner_kind ?? existing?.ownerKind;
      if (ownerKind === EVAL_CASE_OWNER_KIND_SKILL) {
        await this.requireBaselineAgent(workspaceId, patch.baseline_agent_id);
      }
    }
    const row = await this.repo.updateCase(workspaceId, caseId, {
      ...(patch.baseline_agent_id !== undefined ? { baselineAgentId: patch.baseline_agent_id } : {}),
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
    const rows = await this.repo.listBatchesForOwner(workspaceId, EVAL_CASE_OWNER_KIND_AGENT, agentId);
    return rows.map(toEvalBatchDto);
  }

  /** Amendment A (AC-54) — the skill-owned equivalent of `listBatchesForAgent`. */
  async listBatchesForSkill(workspaceId: string, skillId: string): Promise<EvalBatch[] | undefined> {
    const skill = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listBatchesForOwner(workspaceId, EVAL_CASE_OWNER_KIND_SKILL, skillId);
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
