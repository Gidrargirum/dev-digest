import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { EvalCaseInput, EvalCaseInputShape, refineMustNotFlagExpectedOutput } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { EvalService } from './service.js';
import { EvalBatchExecutor } from './batch-executor.js';

/**
 * A5 — eval module. Every route is workspace-scoped via `getContext`, every
 * body/params shape validated by the route schema (never `.parse()` inside
 * the handler — AC-7's `400` on a non-parsing `expected_output` comes from
 * `EvalCaseInput`'s `expected_output: z.array(EvalExpectedFinding)`).
 *
 *   GET|POST   /agents/:id/eval-cases          list / create (agent-owned)
 *   GET|POST   /skills/:id/eval-cases          list / create (skill-owned, Amendment A AC-54)
 *   GET|PUT|DELETE /eval-cases/:caseId         one case — owner-agnostic
 *   POST       /eval-cases/:caseId/run         single-case run (AC-9 Run on save) —
 *                                               branches on owner_kind (AC-41/AC-54):
 *                                               agent-owned → one pass, skill-owned → two
 *   POST       /agents/:id/eval-runs           start an agent batch → { batch_id } (AC-12)
 *   GET        /agents/:id/eval-runs           agent batch history, newest first
 *   POST       /skills/:id/eval-runs           start a skill batch → { batch_id } (Amendment A AC-54)
 *   GET        /skills/:id/eval-runs           skill batch history, newest first
 *   GET        /eval-runs/:batchId             batch aggregate + per-case detail — owner-agnostic
 *   GET        /evals/dashboard                workspace-wide AGENT list + recent runs (A-4: agent-only)
 *
 * Never imports `repository.ts` directly — always through the service.
 */

const CaseIdParams = z.object({ caseId: z.string().uuid() });
const BatchIdParams = z.object({ batchId: z.string().uuid() });

const UpdateEvalCaseBody = EvalCaseInputShape.partial().superRefine(refineMustNotFlagExpectedOutput);

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new EvalService(app.container);
  const executor = new EvalBatchExecutor(app.container);

  // ---- Cases ------------------------------------------------------------

  app.get('/agents/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const cases = await service.listCases(workspaceId, req.params.id);
    if (!cases) throw new NotFoundError('Agent not found');
    return cases;
  });

  app.post(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createCase(workspaceId, req.params.id, req.body);
      if (!created) throw new NotFoundError('Agent not found');
      reply.status(201);
      return created;
    },
  );

  // Amendment A (AC-36/AC-37/AC-54) — the skill-owned equivalent of the two
  // routes above. Deliberately a SECOND family, not a generalisation of
  // `/agents/:id/eval-*` (A-3): the agent routes already shipped and stay
  // byte-compatible for existing callers.
  app.get('/skills/:id/eval-cases', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const cases = await service.listCasesForSkill(workspaceId, req.params.id);
    if (!cases) throw new NotFoundError('Skill not found');
    return cases;
  });

  app.post(
    '/skills/:id/eval-cases',
    { schema: { params: IdParams, body: EvalCaseInput } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const created = await service.createCaseForSkill(workspaceId, req.params.id, req.body);
      if (!created) throw new NotFoundError('Skill not found');
      reply.status(201);
      return created;
    },
  );

  app.get('/eval-cases/:caseId', { schema: { params: CaseIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const evalCase = await service.getCase(workspaceId, req.params.caseId);
    if (!evalCase) throw new NotFoundError('Eval case not found');
    return evalCase;
  });

  app.put(
    '/eval-cases/:caseId',
    { schema: { params: CaseIdParams, body: UpdateEvalCaseBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const updated = await service.updateCase(workspaceId, req.params.caseId, req.body);
      if (!updated) throw new NotFoundError('Eval case not found');
      return updated;
    },
  );

  app.delete('/eval-cases/:caseId', { schema: { params: CaseIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const ok = await service.deleteCase(workspaceId, req.params.caseId);
    if (!ok) throw new NotFoundError('Eval case not found');
    return { ok: true };
  });

  // Single-case run — "Run on save" (AC-9). Reuses the batch executor with a
  // one-case filter so scoring/persistence stay in one code path. Same
  // route/response shape for both owner kinds (AC-41/AC-54): branches
  // internally on `owner_kind` to call the two-pass executor for a
  // skill-owned case, never restricted to agent-owned cases.
  app.post('/eval-cases/:caseId/run', { schema: { params: CaseIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const evalCase = await service.getCase(workspaceId, req.params.caseId);
    if (!evalCase) throw new NotFoundError('Eval case not found');
    return evalCase.owner_kind === 'skill'
      ? executor.runSkillBatch(workspaceId, evalCase.owner_id, { caseIds: [evalCase.id] })
      : executor.runBatch(workspaceId, evalCase.owner_id, { caseIds: [evalCase.id] });
  });

  // ---- Batches / runs -----------------------------------------------------

  app.post('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const started = await executor.runBatch(workspaceId, req.params.id);
    reply.status(202);
    return started;
  });

  app.get('/agents/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const batches = await service.listBatchesForAgent(workspaceId, req.params.id);
    if (!batches) throw new NotFoundError('Agent not found');
    return batches;
  });

  // Amendment A (AC-54) — skill batch equivalents.
  app.post('/skills/:id/eval-runs', { schema: { params: IdParams } }, async (req, reply) => {
    const { workspaceId } = await getContext(app.container, req);
    const started = await executor.runSkillBatch(workspaceId, req.params.id);
    reply.status(202);
    return started;
  });

  app.get('/skills/:id/eval-runs', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const batches = await service.listBatchesForSkill(workspaceId, req.params.id);
    if (!batches) throw new NotFoundError('Skill not found');
    return batches;
  });

  app.get('/eval-runs/:batchId', { schema: { params: BatchIdParams } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    const detail = await service.getBatchDetail(workspaceId, req.params.batchId);
    if (!detail) throw new NotFoundError('Eval batch not found');
    return detail;
  });

  // ---- Dashboard ----------------------------------------------------------

  app.get('/evals/dashboard', async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.dashboard(workspaceId);
  });
}
