import type { Container } from '../../platform/container.js';
import type {
  EvalExpectationType,
  EvalExpectedFinding,
  EvalMarginalEffect,
  EvalPassResult,
  Finding,
  Provider,
  ReviewStrategy,
} from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
// Diff parsing imported directly here, mirroring `modules/reviews/diff-loader.ts`
// prior art (Risks: `service.ts` never imports the adapter — only this file does).
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import { EvalRepository, type FinishEvalBatch } from './repository.js';
import { parseExpectedFindings } from './helpers.js';
import { scoreCase, aggregate, aggregateMarginal, marginalEffect, type CaseAggregateInput } from './scorer.js';
import { EVAL_CASE_OWNER_KIND_AGENT, EVAL_CASE_OWNER_KIND_SKILL } from './constants.js';

/**
 * The agent/case shapes `executeBatch` needs — deliberately NOT `AgentRow` /
 * `EvalCaseRow` (onion-architecture: a Drizzle row type must not cross into
 * an application-ring method's signature). `runBatch` maps the repositories'
 * row results into these before handing off to `executeBatch`; the row types
 * stay confined to `runBatch`, which is where they were fetched.
 */
interface EvalBatchAgentInput {
  id: string;
  provider: Provider;
  model: string;
  systemPrompt: string;
  strategy: ReviewStrategy | null;
}

interface EvalBatchCaseInput {
  id: string;
  name: string;
  inputDiff: string | null;
  expectationType: EvalExpectationType;
  expectedOutput: EvalExpectedFinding[];
}

/** One `agent_skills` link resolved to what a review pass needs — ordered,
 *  filtered to `link.enabled && skill.enabled` (mirrors `buildSkillBodies`). */
interface ActiveSkillLink {
  skillId: string;
  name: string;
  body: string;
}

/** Outcome of one review pass — success carries the scored result, failure
 *  carries only the error (AC-46: a pass-level isolation, not a case-level one). */
type PassOutcome =
  | {
      ok: true;
      findings: Finding[];
      scoreResult: ReturnType<typeof scoreCase>;
      durationMs: number;
      costUsd: number | null;
    }
  | { ok: false; error: string; durationMs: number };

/**
 * Async batch executor — kicks off an eval run for an agent's or a skill's
 * cases over `RunBus`, keyed by the batch id (Non-functional: Responsiveness
 * — no new SSE route needed, `GET /runs/:id/events` already takes an
 * arbitrary id).
 *
 * Never reads live GitHub/git at run time (AC-14/AC-43): each case's diff is
 * parsed from its OWN frozen `input_diff` column. Stored diff/meta reach the
 * prompt only through `reviewPullRequest`'s existing wrapping — no second
 * injection path.
 */
export class EvalBatchExecutor {
  private repo: EvalRepository;

  constructor(private container: Container) {
    this.repo = new EvalRepository(container.db);
  }

  /**
   * Load the agent (404 if not in workspace) and its eval cases; fewer than
   * one case → 400, nothing persisted (AC-16). Otherwise insert the batch row
   * with `agentVersion` snapshotted up front (AC-13) and return `{ batch_id }`
   * immediately — the loop runs fire-and-forget (AC-12), mirroring
   * `ReviewService.runReview`.
   */
  async runBatch(
    workspaceId: string,
    agentId: string,
    opts?: { caseIds?: string[] },
  ): Promise<{ batch_id: string }> {
    const agentRow = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agentRow) throw new NotFoundError('Agent not found');

    let caseRows = await this.repo.listCasesForOwner(workspaceId, EVAL_CASE_OWNER_KIND_AGENT, agentId);
    if (opts?.caseIds) {
      const wanted = new Set(opts.caseIds);
      caseRows = caseRows.filter((c) => wanted.has(c.id));
    }
    if (caseRows.length === 0) throw new BadRequestError('No eval cases to run');

    const batch = await this.repo.insertBatch({
      workspaceId,
      agentId,
      agentVersion: agentRow.version,
      ownerKind: EVAL_CASE_OWNER_KIND_AGENT,
      ownerId: agentId,
      skillVersion: null,
    });

    const agent: EvalBatchAgentInput = {
      id: agentRow.id,
      provider: agentRow.provider as Provider,
      model: agentRow.model,
      systemPrompt: agentRow.systemPrompt,
      strategy: (agentRow.strategy as ReviewStrategy | null) ?? null,
    };
    const cases: EvalBatchCaseInput[] = caseRows.map((row) => ({
      id: row.id,
      name: row.name,
      inputDiff: row.inputDiff,
      expectationType: row.expectationType as EvalExpectationType,
      expectedOutput: parseExpectedFindings(row.expectedOutput),
    }));

    void this.executeBatch(agent, batch.id, cases);

    return { batch_id: batch.id };
  }

  /**
   * Amendment A (AC-40/AC-41) — start a skill batch. Resolves the shared
   * baseline agent from the skill's cases and refuses (400, nothing
   * persisted) rather than picking one, splitting the batch, or forcing an
   * absent/disabled link:
   *   - AC-39: no baseline recorded, or the recorded one is deleted / in
   *     another workspace.
   *   - AC-40: the cases in this batch name DIFFERENT baseline agents.
   *   - AC-45: the skill under test is not present in the resolved
   *     (enabled link + enabled skill) list of the baseline agent.
   * Also used for the owner-agnostic single-case run route (AC-41/AC-54) via
   * `opts.caseIds`.
   */
  async runSkillBatch(
    workspaceId: string,
    skillId: string,
    opts?: { caseIds?: string[] },
  ): Promise<{ batch_id: string }> {
    const skillRow = await this.container.skillsRepo.getById(workspaceId, skillId);
    if (!skillRow) throw new NotFoundError('Skill not found');

    let caseRows = await this.repo.listCasesForOwner(workspaceId, EVAL_CASE_OWNER_KIND_SKILL, skillId);
    if (opts?.caseIds) {
      const wanted = new Set(opts.caseIds);
      caseRows = caseRows.filter((c) => wanted.has(c.id));
    }
    if (caseRows.length === 0) throw new BadRequestError('No eval cases to run');

    const missingBaseline = caseRows.filter((c) => !c.baselineAgentId);
    if (missingBaseline.length > 0) {
      throw new BadRequestError(
        `No baseline agent recorded for case(s): ${missingBaseline.map((c) => c.name).join(', ')}`,
      );
    }
    const baselineIds = new Set(caseRows.map((c) => c.baselineAgentId as string));
    if (baselineIds.size > 1) {
      throw new BadRequestError(
        `Cases in this batch name different baseline agents: ${caseRows
          .map((c) => `${c.name} -> ${c.baselineAgentId}`)
          .join('; ')}`,
      );
    }
    const baselineAgentId = [...baselineIds][0]!;
    const baselineAgentRow = await this.container.agentsRepo.getById(workspaceId, baselineAgentId);
    if (!baselineAgentRow) {
      throw new BadRequestError(`Baseline agent ${baselineAgentId} not found in this workspace`);
    }

    const activeLinks = await this.resolveActiveLinks(baselineAgentId);
    const underTest = activeLinks.find((l) => l.skillId === skillId);
    if (!underTest) {
      throw new BadRequestError(
        `Skill "${skillRow.name}" is not linked and enabled on baseline agent "${baselineAgentRow.name}"`,
      );
    }

    const batch = await this.repo.insertBatch({
      workspaceId,
      agentId: baselineAgentId,
      agentVersion: baselineAgentRow.version,
      ownerKind: EVAL_CASE_OWNER_KIND_SKILL,
      ownerId: skillId,
      skillVersion: skillRow.version,
    });

    const agent: EvalBatchAgentInput = {
      id: baselineAgentRow.id,
      provider: baselineAgentRow.provider as Provider,
      model: baselineAgentRow.model,
      systemPrompt: baselineAgentRow.systemPrompt,
      strategy: (baselineAgentRow.strategy as ReviewStrategy | null) ?? null,
    };
    const cases: EvalBatchCaseInput[] = caseRows.map((row) => ({
      id: row.id,
      name: row.name,
      inputDiff: row.inputDiff,
      expectationType: row.expectationType as EvalExpectationType,
      expectedOutput: parseExpectedFindings(row.expectedOutput),
    }));

    void this.executeSkillBatch(agent, skillId, activeLinks, batch.id, cases);

    return { batch_id: batch.id };
  }

  /** Background execution (NOT awaited by the caller). Per-case failures are
   *  isolated (AC-15): a failed case persists `pass: false` and the loop
   *  continues to the next case. */
  private async executeBatch(
    agent: EvalBatchAgentInput,
    batchId: string,
    cases: EvalBatchCaseInput[],
  ): Promise<void> {
    const start = Date.now();
    const caseResults: CaseAggregateInput[] = [];
    let knownCostUsd = 0;
    let anyCostKnown = false;

    // Linked skills — same enabled-links-only, ordered resolution as
    // `ReviewRunExecutor.buildSkillBodies`. Resolved once per batch (the
    // agent is fixed for the whole batch) so a regression caused by a change
    // to the agent's skill configuration is exercised by every case, not
    // just the system prompt.
    const skillBodies = await this.buildSkillBodies(agent.id, batchId);

    for (const evalCase of cases) {
      const caseStart = Date.now();
      this.container.runBus.publish(batchId, 'tool', `Running case "${evalCase.name}"…`);

      try {
        const diff = parseUnifiedDiff(evalCase.inputDiff ?? '');
        const llm = await this.container.llm(agent.provider);

        const outcome = await reviewPullRequest({
          systemPrompt: agent.systemPrompt,
          model: agent.model,
          diff,
          llm,
          strategy: agent.strategy ?? 'single-pass',
          // Linked-skills-in-prompt, same omit-when-empty contract as the
          // review pipeline (`ReviewRunExecutor.runOneAgent`) — a skill
          // regression must be exercised by evals, not just the system prompt.
          ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
          task: `Eval case "${evalCase.name}"`,
          onEvent: (e) => this.container.runBus.publish(batchId, e.kind, e.msg, e.data),
          checkCancelled: () => {
            if (this.container.runBus.isCancelled(batchId)) throw new Error('Eval batch cancelled');
          },
        });

        // citation_accuracy comes from reviewPullRequest's own grounding
        // outcome (AC-23) — never re-implemented here.
        const groundedTotal = outcome.review.findings.length + outcome.dropped.length;
        const citationAccuracy = groundedTotal === 0 ? null : outcome.review.findings.length / groundedTotal;

        const scoreResult = scoreCase({
          expectationType: evalCase.expectationType,
          findings: outcome.review.findings,
          expectations: evalCase.expectedOutput,
          citationAccuracy,
        });

        if (outcome.costUsd != null) {
          knownCostUsd += outcome.costUsd;
          anyCostKnown = true;
        }

        await this.repo.insertRun({
          caseId: evalCase.id,
          batchId,
          actualOutput: outcome.review.findings,
          pass: scoreResult.pass,
          recall: scoreResult.recall,
          precision: scoreResult.precision,
          citationAccuracy: scoreResult.citation_accuracy,
          matched: scoreResult.matched,
          unmatched: scoreResult.unmatched,
          durationMs: Date.now() - caseStart,
          costUsd: outcome.costUsd,
        });

        caseResults.push({
          expectationType: evalCase.expectationType,
          recall: scoreResult.recall,
          precision: scoreResult.precision,
          citation_accuracy: scoreResult.citation_accuracy,
          pass: scoreResult.pass,
        });

        this.container.runBus.publish(
          batchId,
          'result',
          `Case "${evalCase.name}": ${scoreResult.pass ? 'pass' : 'fail'}`,
        );
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.repo
          .insertRun({
            caseId: evalCase.id,
            batchId,
            actualOutput: { error: message },
            pass: false,
            recall: null,
            precision: null,
            citationAccuracy: null,
            matched: [],
            unmatched: [],
            durationMs: Date.now() - caseStart,
            costUsd: null,
          })
          .catch(() => undefined);
        caseResults.push({
          expectationType: evalCase.expectationType,
          recall: null,
          precision: null,
          citation_accuracy: null,
          pass: false,
        });
        this.container.runBus.publish(batchId, 'error', `Case "${evalCase.name}" failed: ${message}`);
      }
    }

    const agg = aggregate(caseResults);
    const finish: FinishEvalBatch = {
      status: 'done',
      casesTotal: agg.cases_total,
      casesPassed: agg.cases_passed,
      recall: agg.recall,
      precision: agg.precision,
      citationAccuracy: agg.citation_accuracy,
      noFlagRate: agg.no_flag_rate,
      costUsd: anyCostKnown ? knownCostUsd : null,
      durationMs: Date.now() - start,
    };

    await this.finalizeBatch(batchId, finish);
  }

  /**
   * Amendment A (AC-41…AC-51) — background execution of a skill batch. Two
   * ordinary `reviewPullRequest` passes per case (`with` includes the skill
   * under test, `without` is the same ordered list minus it), scored by the
   * SAME scorer as the agent path (AC-48). A failed pass does not fail its
   * sibling pass (AC-46) — whichever pass produced output is retained, and
   * the loop always continues to the next case.
   */
  private async executeSkillBatch(
    agent: EvalBatchAgentInput,
    skillUnderTestId: string,
    activeLinks: ActiveSkillLink[],
    batchId: string,
    cases: EvalBatchCaseInput[],
  ): Promise<void> {
    const start = Date.now();
    const caseResults: CaseAggregateInput[] = [];
    const marginalResults: EvalMarginalEffect[] = [];
    let knownCostUsd = 0;
    let anyCostKnown = false;

    const withBodies = activeLinks.map((l) => l.body);
    const withoutBodies = activeLinks.filter((l) => l.skillId !== skillUnderTestId).map((l) => l.body);

    for (const evalCase of cases) {
      this.container.runBus.publish(batchId, 'tool', `Running case "${evalCase.name}"…`);

      let diff;
      try {
        // Parsed once (AC-42/AC-43) — both passes see the identical diff.
        diff = parseUnifiedDiff(evalCase.inputDiff ?? '');
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        await this.persistFailedSkillCase(evalCase, batchId, message);
        caseResults.push({
          expectationType: evalCase.expectationType,
          recall: null,
          precision: null,
          citation_accuracy: null,
          pass: false,
        });
        marginalResults.push({ recall: null, precision: null, citation_accuracy: null });
        this.container.runBus.publish(batchId, 'error', `Case "${evalCase.name}" failed: ${message}`);
        continue;
      }

      const withOutcome = await this.runPass(agent, diff, withBodies, evalCase, batchId);
      const withoutOutcome = await this.runPass(agent, diff, withoutBodies, evalCase, batchId);

      const withPass = this.toPassResult(withOutcome);
      const withoutPass = this.toPassResult(withoutOutcome);
      const marginal = marginalEffect(withPass, withoutPass);
      marginalResults.push(marginal);

      if (withOutcome.ok && withOutcome.costUsd != null) {
        knownCostUsd += withOutcome.costUsd;
        anyCostKnown = true;
      }
      if (withoutOutcome.ok && withoutOutcome.costUsd != null) {
        knownCostUsd += withoutOutcome.costUsd;
        anyCostKnown = true;
      }

      // AC-49: headline metrics + pass come from the `with` pass. AC-46: if
      // EITHER pass failed, the case as a whole is persisted as failed —
      // the successful side's output is still retained in `actual_output`.
      const casePass = withOutcome.ok && withoutOutcome.ok ? withOutcome.scoreResult.pass : false;
      const caseRecall = withOutcome.ok ? withOutcome.scoreResult.recall : null;
      const casePrecision = withOutcome.ok ? withOutcome.scoreResult.precision : null;
      const caseCitation = withOutcome.ok ? withOutcome.scoreResult.citation_accuracy : null;
      const caseMatched = withOutcome.ok ? withOutcome.scoreResult.matched : [];
      const caseUnmatched = withOutcome.ok ? withOutcome.scoreResult.unmatched : [];

      const durationMs = withPass.duration_ms + withoutPass.duration_ms;
      const costUsd =
        withPass.cost_usd == null && withoutPass.cost_usd == null
          ? null
          : (withPass.cost_usd ?? 0) + (withoutPass.cost_usd ?? 0);

      await this.repo.insertRun({
        caseId: evalCase.id,
        batchId,
        actualOutput: { with: withPass, without: withoutPass, marginal },
        pass: casePass,
        recall: caseRecall,
        precision: casePrecision,
        citationAccuracy: caseCitation,
        matched: caseMatched,
        unmatched: caseUnmatched,
        durationMs,
        costUsd,
      });

      caseResults.push({
        expectationType: evalCase.expectationType,
        recall: caseRecall,
        precision: casePrecision,
        citation_accuracy: caseCitation,
        pass: casePass,
      });

      this.container.runBus.publish(batchId, 'result', `Case "${evalCase.name}": ${casePass ? 'pass' : 'fail'}`);
    }

    const agg = aggregate(caseResults);
    const marginalAgg = aggregateMarginal(marginalResults);
    const finish: FinishEvalBatch = {
      status: 'done',
      casesTotal: agg.cases_total,
      casesPassed: agg.cases_passed,
      recall: agg.recall,
      precision: agg.precision,
      citationAccuracy: agg.citation_accuracy,
      noFlagRate: agg.no_flag_rate,
      // AC-47: sum over BOTH passes of every case.
      costUsd: anyCostKnown ? knownCostUsd : null,
      durationMs: Date.now() - start,
      marginalRecall: marginalAgg.recall,
      marginalPrecision: marginalAgg.precision,
      marginalCitationAccuracy: marginalAgg.citation_accuracy,
    };

    await this.finalizeBatch(batchId, finish);
  }

  /** One review pass (`with` or `without`) — never throws; a failure is
   *  reported as `{ ok: false, error }` so its sibling pass can still
   *  succeed (AC-46). */
  private async runPass(
    agent: EvalBatchAgentInput,
    diff: Parameters<typeof reviewPullRequest>[0]['diff'],
    skillBodies: string[],
    evalCase: EvalBatchCaseInput,
    batchId: string,
  ): Promise<PassOutcome> {
    const passStart = Date.now();
    try {
      const llm = await this.container.llm(agent.provider);
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        strategy: agent.strategy ?? 'single-pass',
        ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
        task: `Eval case "${evalCase.name}"`,
        onEvent: (e) => this.container.runBus.publish(batchId, e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(batchId)) throw new Error('Eval batch cancelled');
        },
      });
      const groundedTotal = outcome.review.findings.length + outcome.dropped.length;
      const citationAccuracy = groundedTotal === 0 ? null : outcome.review.findings.length / groundedTotal;
      const scoreResult = scoreCase({
        expectationType: evalCase.expectationType,
        findings: outcome.review.findings,
        expectations: evalCase.expectedOutput,
        citationAccuracy,
      });
      return {
        ok: true,
        findings: outcome.review.findings,
        scoreResult,
        durationMs: Date.now() - passStart,
        costUsd: outcome.costUsd,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return { ok: false, error: message, durationMs: Date.now() - passStart };
    }
  }

  private toPassResult(outcome: PassOutcome): EvalPassResult {
    if (outcome.ok) {
      return {
        findings: outcome.findings,
        recall: outcome.scoreResult.recall,
        precision: outcome.scoreResult.precision,
        citation_accuracy: outcome.scoreResult.citation_accuracy,
        pass: outcome.scoreResult.pass,
        duration_ms: outcome.durationMs,
        cost_usd: outcome.costUsd,
        error: null,
      };
    }
    return {
      findings: [],
      recall: null,
      precision: null,
      citation_accuracy: null,
      pass: false,
      duration_ms: outcome.durationMs,
      cost_usd: null,
      error: outcome.error,
    };
  }

  /** Both passes failed before either could run (e.g. the diff itself did
   *  not parse) — persist the case as failed, mirroring the agent path's
   *  whole-case failure handling (AC-15/AC-46). */
  private async persistFailedSkillCase(
    evalCase: EvalBatchCaseInput,
    batchId: string,
    message: string,
  ): Promise<void> {
    const failedPass: EvalPassResult = {
      findings: [],
      recall: null,
      precision: null,
      citation_accuracy: null,
      pass: false,
      duration_ms: 0,
      cost_usd: null,
      error: message,
    };
    await this.repo
      .insertRun({
        caseId: evalCase.id,
        batchId,
        actualOutput: {
          with: failedPass,
          without: failedPass,
          marginal: { recall: null, precision: null, citation_accuracy: null },
        },
        pass: false,
        recall: null,
        precision: null,
        citationAccuracy: null,
        matched: [],
        unmatched: [],
        durationMs: 0,
        costUsd: null,
      })
      .catch(() => undefined);
  }

  /** Persist the batch aggregate BEFORE publishing completion (insights/
   *  INSIGHTS.md 2026-08-28), with the same best-effort failure handling
   *  both executors share. */
  private async finalizeBatch(batchId: string, finish: FinishEvalBatch): Promise<void> {
    try {
      await this.repo.finishBatch(batchId, finish);
      this.container.runBus.complete(batchId);
    } catch (err) {
      // Runs after the fire-and-forget `void this.execute*Batch(...)` call —
      // nothing awaits this promise, so an uncaught rejection here would be
      // an unhandled promise rejection rather than a caught error.
      // Best-effort mark the batch failed instead of leaving it stuck
      // 'running' forever, and still signal SSE subscribers that it's done.
      const message = err instanceof Error ? err.message : String(err);
      this.container.runBus.publish(batchId, 'error', `Failed to finalize eval batch: ${message}`);
      await this.repo.finishBatch(batchId, { ...finish, status: 'failed' }).catch(() => undefined);
      this.container.runBus.complete(batchId);
    }
  }

  /**
   * Linked-skills-in-prompt (mirrors `ReviewRunExecutor.buildSkillBodies`).
   * Loads the agent's linked skills (ordered), keeps only links AND skills
   * that are both enabled, and returns their bodies in order. Best-effort:
   * any failure degrades to no skills rather than failing the batch — this
   * is the AGENT path's contract, unchanged from before Amendment A.
   */
  private async buildSkillBodies(agentId: string, batchId: string): Promise<string[]> {
    try {
      const active = await this.resolveActiveLinks(agentId);
      if (active.length === 0) return [];
      this.container.runBus.publish(
        batchId,
        'tool',
        `Loaded ${active.length} skill(s): ${active.map((l) => l.name).join(', ')}`,
      );
      return active.map((l) => l.body);
    } catch {
      return [];
    }
  }

  /**
   * Ordered, doubly-filtered (`link.enabled && skill.enabled`) resolution of
   * an agent's linked skills — the shared primitive behind `buildSkillBodies`
   * (agent path, degrades to `[]` on failure) and `runSkillBatch` (skill
   * path). Deliberately has NO try/catch of its own: the skill path needs to
   * see a real failure to resolve, tell it apart from "zero active links",
   * and refuse the batch (AC-45) rather than silently scoring a
   * configuration no real review would run.
   */
  private async resolveActiveLinks(agentId: string): Promise<ActiveSkillLink[]> {
    const links = await this.container.agentsRepo.linkedSkills(agentId); // already ordered by `order` ascending
    return links
      .filter((l) => l.enabled && l.skill.enabled)
      .map((l) => ({ skillId: l.skill.id, name: l.skill.name, body: l.skill.body }));
  }
}
