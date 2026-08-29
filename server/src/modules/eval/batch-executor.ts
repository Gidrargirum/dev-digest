import type { Container } from '../../platform/container.js';
import type { EvalExpectationType, EvalExpectedFinding, Provider, ReviewStrategy } from '@devdigest/shared';
import { reviewPullRequest } from '@devdigest/reviewer-core';
// Diff parsing imported directly here, mirroring `modules/reviews/diff-loader.ts`
// prior art (Risks: `service.ts` never imports the adapter — only this file does).
import { parseUnifiedDiff } from '../../adapters/git/diff-parser.js';
import { BadRequestError, NotFoundError } from '../../platform/errors.js';
import { EvalRepository, type FinishEvalBatch } from './repository.js';
import { parseExpectedFindings } from './helpers.js';
import { scoreCase, aggregate, type CaseAggregateInput } from './scorer.js';

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

/**
 * Async batch executor — kicks off an eval run for an agent's cases over
 * `RunBus`, keyed by the batch id (Non-functional: Responsiveness — no new
 * SSE route needed, `GET /runs/:id/events` already takes an arbitrary id).
 *
 * Never reads live GitHub/git at run time (AC-14): each case's diff is
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

    let caseRows = await this.repo.listCasesForAgent(workspaceId, agentId);
    if (opts?.caseIds) {
      const wanted = new Set(opts.caseIds);
      caseRows = caseRows.filter((c) => wanted.has(c.id));
    }
    if (caseRows.length === 0) throw new BadRequestError('No eval cases to run');

    const batch = await this.repo.insertBatch({
      workspaceId,
      agentId,
      agentVersion: agentRow.version,
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

    try {
      // Persist the batch aggregate BEFORE publishing completion
      // (insights/INSIGHTS.md 2026-08-28).
      await this.repo.finishBatch(batchId, finish);
      this.container.runBus.complete(batchId);
    } catch (err) {
      // This runs after `void this.executeBatch(...)` (fire-and-forget from
      // `runBatch`) — nothing awaits this promise, so an uncaught rejection
      // here would be an unhandled promise rejection rather than a caught
      // error. Best-effort mark the batch failed instead of leaving it stuck
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
   * any failure degrades to no skills rather than failing the batch.
   */
  private async buildSkillBodies(agentId: string, batchId: string): Promise<string[]> {
    try {
      const links = await this.container.agentsRepo.linkedSkills(agentId); // already ordered by `order` ascending
      const active = links.filter((l) => l.enabled && l.skill.enabled);
      if (active.length === 0) return [];
      this.container.runBus.publish(
        batchId,
        'tool',
        `Loaded ${active.length} skill(s): ${active.map((l) => l.skill.name).join(', ')}`,
      );
      return active.map((l) => l.skill.body);
    } catch {
      return [];
    }
  }
}
