import type { Container } from '../../platform/container.js';
import type { Provider, Review, RunTrace, UnifiedDiff } from '@devdigest/shared';
import { reviewPullRequest, countBlockers } from '@devdigest/reviewer-core';
import { RunLogger } from '../../platform/run-logger.js';
import * as schema from '../../db/schema.js';
import type { AgentRow } from '../../db/rows.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from './repository.js';
import { REVIEW_STRATEGY } from './constants.js';
import { taskLine } from './helpers.js';
import { loadDiff } from './diff-loader.js';

/** Thrown by a run when the user cancels it mid-flight (between map files). */
export class RunCancelledError extends Error {
  constructor() {
    super('Run cancelled');
    this.name = 'RunCancelledError';
  }
}

/** Minimal structured logger (pino-compatible: (obj, msg)) for runtime logs. */
export type Logger = {
  info: (obj: unknown, msg?: string) => void;
  warn: (obj: unknown, msg?: string) => void;
  error: (obj: unknown, msg?: string) => void;
  debug: (obj: unknown, msg?: string) => void;
};

// A reduced "Review per file" — same schema as Review (the model returns a small
// Review per file; we merge findings + take the worst verdict / mean score).
export type RunOutcome = {
  review: ReviewRow;
  findings: FindingRow[];
  grounding: string;
  raw: Review;
};

/**
 * Outcome of the one-per-run-set intent step (plans/intent-layer.md §3/§8).
 * Built once in `executeRuns`, then handed to every `runOneAgent` call so
 * each run's trace carries the same `tool_calls` entry — only cost
 * attribution differs (first job, cache-miss only).
 */
interface IntentStepResult {
  /** Rendered intent text for the prompt slot; `undefined` on failure. */
  text: string | undefined;
  meta: 'computed' | 'cached' | 'failed';
  providerModel: string;
  ms: number;
  /** Present only when an LLM call actually happened (cache miss, success). */
  usage?: { tokensIn: number; tokensOut: number; costUsd: number | null };
}

/**
 * Owns the background execution of queued agent runs (extracted from
 * ReviewService; behaviour unchanged). Loads the diff + intent once, then
 * map-reduces each agent, streaming events over the runBus and persisting each
 * review. Per-agent failures are isolated.
 */
export class ReviewRunExecutor {
  constructor(
    private container: Container,
    private repo: ReviewRepository,
    private agents: Container['agentsRepo'],
  ) {}

  /**
   * Background execution of the queued agent runs (NOT awaited by the route).
   * Loads the diff + intent once, then map-reduces each agent, streaming events
   * over the runBus and persisting each review. Per-agent failures are isolated.
   */
  async executeRuns(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    jobs: { agent: AgentRow; runId: string }[],
    logger?: Logger,
  ): Promise<void> {
    // ONE logger fanned out over every queued run: shared pre-work (diff +
    // intent) is streamed into each target agent's Live Log and persisted into
    // each run's trace. Per-agent work below narrows it to a single run.
    const runLog = new RunLogger(
      this.container.runBus,
      jobs.map((j) => j.runId),
      logger,
      { prId: pull.id },
    );

    // Pre-work failure (e.g. diff load) fails EVERY queued run. The error was
    // already emitted via runLog (fanned out → in each run's buffer); here we
    // mark the rows failed and persist the buffered log so it survives a reload.
    const failAll = async (msg: string) => {
      for (const { runId, agent } of jobs) {
        await this.repo
          .completeAgentRun(runId, {
            status: 'failed',
            durationMs: 0,
            tokensIn: 0,
            tokensOut: 0,
            costUsd: null,
            findingsCount: 0,
            grounding: '0/0 passed',
            error: msg,
          })
          .catch(() => undefined);
        await this.repo
          .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed'))
          .catch(() => undefined);
        this.container.runBus.complete(runId);
      }
    };

    let diff: UnifiedDiff;
    try {
      diff = await runLog.step('Loading PR diff', () => loadDiff(this.container, this.repo, workspaceId, pull, repo), {
        kind: 'tool',
      });
    } catch (err) {
      runLog.error(`Failed to load PR diff: ${(err as Error).message}`);
      await failAll(`Failed to load PR diff: ${(err as Error).message}`);
      return;
    }
    runLog.info(`Diff ready — ${diff.files.length} changed file(s); starting ${jobs.length} agent run(s)`);

    // Nothing queued (e.g. `all: true` with no enabled agents) — jobs[0]
    // below would have nothing to fall back to, and the loop is a no-op anyway.
    if (jobs.length === 0) return;

    // ONE intent step per set of runs (decision #2, plans/intent-layer.md §3):
    // cache-keyed on (pr_id, head_sha), never a blocking dependency — any
    // failure degrades to "no intent section" and the review proceeds.
    const intentStep = await this.buildIntentStep(workspaceId, pull, repo, diff, jobs, runLog);
    // `jobs.length === 0` returned above, so `jobs[0]` is defined.
    const firstRunId = jobs[0]!.runId;

    for (const { agent, runId } of jobs) {
      const agentStart = Date.now();
      logger?.info(
        { runId, agent: agent.name, provider: agent.provider, model: agent.model, prId: pull.id },
        `review: agent "${agent.name}" started (${agent.provider}/${agent.model})`,
      );
      try {
        const outcome = await this.runOneAgent(
          workspaceId,
          pull,
          repo,
          diff,
          agent,
          runId,
          runLog,
          intentStep,
          runId === firstRunId,
        );
        logger?.info(
          {
            runId,
            agent: agent.name,
            findings: outcome.findings.length,
            grounding: outcome.grounding,
            durationMs: Date.now() - agentStart,
          },
          `review: agent "${agent.name}" done — ${outcome.findings.length} finding(s)`,
        );
      } catch (err) {
        // runOneAgent already persisted the failure/cancel (status + error +
        // trace) and completed the bus; here we only log at the run level.
        const cancelled = err instanceof RunCancelledError;
        logger?.[cancelled ? 'info' : 'error'](
          { runId, agent: agent.name, err: (err as Error).message, durationMs: Date.now() - agentStart },
          `review: agent "${agent.name}" ${cancelled ? 'cancelled' : 'failed'}`,
        );
      }
    }
  }

  /** Execute a single agent's review against a PR, streaming progress. */
  private async runOneAgent(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    agent: AgentRow,
    runId: string,
    parentLog: RunLogger,
    intentStep: IntentStepResult,
    isFirstRun: boolean,
  ): Promise<RunOutcome> {
    const start = Date.now();
    // Narrow the fanned-out pre-work logger to THIS run; the shared diff/intent
    // events are already in this run's buffer, so the persisted trace below
    // (built from the buffer) includes them too.
    const runLog = parentLog.forRun(runId, { agent: agent.name });

    runLog.info(`Starting review with agent "${agent.name}" (${agent.provider}/${agent.model})`);

    try {
      // Resolve the agent's LLM provider. (container.llm throws if the provider
      // key is missing — caught below and persisted as a failed run.)
      const llm = await runLog.step(
        `Resolving ${agent.provider} provider`,
        () => this.container.llm(agent.provider as Provider),
        { kind: 'tool' },
      );

      // Per-agent repo-intel toggle (Agent editor). When an agent opts out we
      // skip all enrichment entirely so its prompt is identical to the
      // repo-intel-off baseline — independent of the global REPO_INTEL_ENABLED
      // flag, which still gates the facade internally.
      const repoIntelOn = agent.repoIntel !== false;
      if (!repoIntelOn) runLog.info('Repo intel disabled for this agent — skipping context enrichment');

      // T1.3 — callers-in-prompt. Best-effort: when repo-intel is off the facade
      // returns []; we omit the section and behavior is identical to the
      // pre-T1.3 prompt (acceptance #10).
      const callersDigest = repoIntelOn
        ? await this.buildCallersDigest(pull.repoId, diff, runLog)
        : undefined;

      // T3 — repo skeleton + "changed files are top-5%" framing. Both best-
      // effort: when repo-intel is off / unindexed the facade degrades and the
      // prompt is identical to the pre-T3 shape.
      const repoMap = repoIntelOn ? await this.buildRepoMapDigest(pull.repoId, runLog) : undefined;
      const rankNote = repoIntelOn ? await this.buildRankNote(pull.repoId, diff, runLog) : '';

      const task = taskLine(pull) + rankNote;

      // Linked skills — enabled links only, ordered. assemblePrompt omits the
      // section when the array is empty.
      const skillBodies = await this.buildSkillBodies(agent.id, runLog);

      // Project Context Folder (AC-11/16/21) — the agent's own attached
      // documents merged with its enabled skills', resolved to strings.
      // Best-effort: a failure degrades to no `## Project context` section,
      // same omit-when-empty contract as callers/repoMap/skills.
      const { specs, specsRead } = await this.buildProjectContext(agent.id, pull.repoId, runLog);

      // ---- Engine: assemble → single-pass → grounding -----------------------
      // The pure review pipeline lives in @devdigest/reviewer-core (shared with
      // the CI runner). The service owns only I/O: repo-intel context resolution
      // above, and persistence + observability below.
      const outcome = await reviewPullRequest({
        systemPrompt: agent.systemPrompt,
        model: agent.model,
        diff,
        llm,
        // Per-agent review strategy (configured in the Agent editor); falls back
        // to the studio default. single-pass = whole diff in one call.
        strategy: agent.strategy ?? REVIEW_STRATEGY,
        // T1.3 — pass the callers digest only when we built one. assemblePrompt
        // omits the section when this is empty/undefined.
        ...(callersDigest ? { callers: callersDigest } : {}),
        // T3 — repo skeleton, same omit-when-empty contract.
        ...(repoMap ? { repoMap } : {}),
        // Linked-skills-in-prompt: enabled links' bodies, same omit-when-empty contract.
        ...(skillBodies.length > 0 ? { skills: skillBodies } : {}),
        // Project Context Folder — resolved document strings, same omit-when-empty
        // contract (AC-14: an empty list assembles a byte-identical prompt).
        ...(specs.length > 0 ? { specs } : {}),
        // PR author's description/body — untrusted; assemblePrompt wraps +
        // truncates it. Omitted when the PR has no body.
        ...(pull.body ? { prDescription: pull.body } : {}),
        // Derived PR intent (decision #3, plans/intent-layer.md §1) — CONTEXT
        // only, never a findings category or a score/verdict input. Omitted
        // on cache miss-that-failed, same omit-when-empty contract as above.
        ...(intentStep.text ? { intent: intentStep.text } : {}),
        task,
        sessionId: `${repo.owner}/${repo.name}#${pull.number}:${agent.name}`,
        onEvent: (e) => runLog.event(e.kind, e.msg, e.data),
        checkCancelled: () => {
          if (this.container.runBus.isCancelled(runId)) throw new RunCancelledError();
        },
      });
      const { tokensIn, tokensOut, costUsd, grounding } = outcome;

      // ---- Intent cost attribution (plans/intent-layer.md §8) ---------------
      // The intent call happens ONCE per set of runs, so its tokens/cost are
      // charged to the FIRST queued run only, and only when it actually ran an
      // LLM call this round (cache hit / failure ⇒ zero, everywhere).
      const intentUsage = isFirstRun ? intentStep.usage : undefined;
      const attributedTokensIn = tokensIn + (intentUsage?.tokensIn ?? 0);
      const attributedTokensOut = tokensOut + (intentUsage?.tokensOut ?? 0);
      // An unknown intent cost (`estimateCost` → null, surfaced as
      // `cost:unknown` in the tool_calls entry below) must NEVER destroy the
      // run's own, known `costUsd` — it is simply not added (specs/pr-intent-
      // layer.md "Cost attribution"). Sum only when both sides are known; fall
      // back to whichever single side is known; `null` only when both are.
      const attributedCostUsd =
        intentUsage?.costUsd == null
          ? costUsd
          : costUsd == null
            ? intentUsage.costUsd
            : costUsd + intentUsage.costUsd;

      // One `tool_calls` entry per run regardless of job index (§8) — only the
      // cost attribution above differs by job. `cost:unknown` makes a priced
      // gap visible instead of silently dropping it (estimateCost → null).
      const intentCostUnknown = intentStep.meta === 'computed' && intentStep.usage?.costUsd == null;
      const intentToolCall = {
        tool: 'intent',
        args: intentStep.providerModel,
        meta: intentCostUnknown ? `${intentStep.meta};cost:unknown` : intentStep.meta,
        ms: intentStep.ms,
      };

      const keptFindings = outcome.review.findings;

      // ---- Persist review + findings ----------------------------------------
      const review = await this.repo.insertReview({
        workspaceId,
        prId: pull.id,
        agentId: agent.id,
        runId,
        kind: 'review',
        verdict: outcome.review.verdict,
        summary: outcome.review.summary,
        score: outcome.review.score,
        model: agent.model,
      });
      const findingRows = await this.repo.insertFindings(review.id, keptFindings);
      runLog.result(`Persisted review ${review.id} with ${findingRows.length} finding(s)`);

      // Mark the commit this review ran against so the PR list can tell
      // reviewed / needs-review (head moved) / stale apart.
      await this.repo.markReviewed(pull.id, pull.headSha);

      const durationMs = Date.now() - start;

      // Deterministic blocker count (severity ≥ the agent's gate) — the signal
      // the timeline colors on, NOT the model's self-reported verdict.
      const blockers = countBlockers(keptFindings, agent.ciFailOn);

      // ---- Observability: agent_runs + ONE run_traces document --------------
      await this.repo.completeAgentRun(runId, {
        status: 'done',
        durationMs,
        tokensIn: attributedTokensIn,
        tokensOut: attributedTokensOut,
        costUsd: attributedCostUsd,
        findingsCount: findingRows.length,
        grounding,
        score: outcome.review.score,
        blockers,
        error: null,
      });

      const trace: RunTrace = {
        config: {
          agent: agent.name,
          version: String(agent.version),
          provider: agent.provider,
          model: agent.model,
          pr: pull.number,
          source: 'local',
        },
        stats: {
          duration_ms: durationMs,
          tokens_in: attributedTokensIn,
          tokens_out: attributedTokensOut,
          cost_usd: attributedCostUsd,
          findings: findingRows.length,
          grounding,
        },
        prompt_assembly: outcome.assembly,
        tool_calls: [
          intentToolCall,
          ...outcome.chunks.map((c) => ({
            tool: 'review_file',
            args: c.label,
            meta: outcome.mode,
            ms: Math.round(durationMs / Math.max(outcome.chunks.length, 1)),
          })),
        ],
        raw_output: outcome.raw,
        memory_pulled: [],
        specs_read: specsRead,
        // Persisted log = the run's FULL event buffer (incl. shared pre-work:
        // diff load + intent), not just events recorded inside this method.
        log: runLog.logFor(runId),
      };
      runLog.info('Run complete; trace persisted');
      await this.repo.saveRunTrace(runId, trace);
      this.container.runBus.complete(runId);

      return { review, findings: findingRows, grounding, raw: outcome.review };
    } catch (err) {
      // Failure/cancel: persist status + the error text + the log-so-far so the
      // run (and WHY it failed) is visible on the UI after a reload.
      const cancelled = err instanceof RunCancelledError;
      const status = cancelled ? 'cancelled' : 'failed';
      const msg = cancelled ? 'Cancelled by user' : (err as Error).message;
      runLog.error(cancelled ? 'Run cancelled by user' : `Run failed: ${msg}`);
      // The intent call already happened (or was attempted) before this run's
      // own work started. If THIS run is the one job.length attribution
      // target (first job, cache miss) and it then fails, its intent
      // tokens/cost would otherwise be lost forever — no other run picks them
      // up. Attribute them here too, still exactly once (specs/pr-intent-
      // layer.md "Cost attribution": "attributed to exactly one run").
      const intentUsage = isFirstRun ? intentStep.usage : undefined;
      await this.repo
        .completeAgentRun(runId, {
          status,
          durationMs: Date.now() - start,
          tokensIn: intentUsage?.tokensIn ?? 0,
          tokensOut: intentUsage?.tokensOut ?? 0,
          costUsd: intentUsage?.costUsd ?? null,
          findingsCount: 0,
          grounding: '0/0 passed',
          error: msg,
        })
        .catch(() => undefined);
      await this.repo
        .saveRunTrace(runId, this.traceFromBuffer(runId, pull, agent, '0/0 passed', Date.now() - start))
        .catch(() => undefined);
      this.container.runBus.complete(runId);
      throw err;
    }
  }

  /**
   * Derive (or reuse the cached) PR intent — ONCE per set of queued runs, via
   * `container.intent` (modules/intent/service.ts). Never a blocking
   * dependency (plans/intent-layer.md §3): any failure is logged and the
   * review proceeds with the `intent` prompt slot simply omitted, exactly
   * like `callers`/`repoMap` above.
   *
   * `runLog.step()` is deliberately NOT used here — it logs a failure at
   * 'error' kind, which would make the Live Log look like the RUN failed. An
   * intent failure never fails the run, so it is logged at 'info' (same
   * severity `buildCallersDigest`/`buildRepoMapDigest` use for their own
   * best-effort failures below).
   */
  private async buildIntentStep(
    workspaceId: string,
    pull: PullRow,
    repo: typeof schema.repos.$inferSelect,
    diff: UnifiedDiff,
    jobs: { agent: AgentRow; runId: string }[],
    runLog: RunLogger,
  ): Promise<IntentStepResult> {
    // Called only with a non-empty `jobs` (guarded by the `jobs.length === 0`
    // early return in `executeRuns`).
    const firstAgent = jobs[0]!.agent;
    const fallbackModel = { provider: firstAgent.provider as Provider, model: firstAgent.model };
    const t0 = Date.now();
    runLog.event('tool', 'Deriving PR intent…');
    try {
      const result = await this.container.intent.resolveForRun({
        workspaceId,
        pull: {
          id: pull.id,
          number: pull.number,
          title: pull.title,
          body: pull.body,
          branch: pull.branch,
          headSha: pull.headSha,
        },
        repoRef: { owner: repo.owner, name: repo.name },
        changedFiles: diff.files.map((f) => f.path),
        fallbackModel,
      });
      const ms = Date.now() - t0;
      const providerModel = `${result.modelChoice.provider}/${result.modelChoice.model}`;
      if (result.cacheHit) {
        runLog.info(`Intent reused from cache (head ${pull.headSha.slice(0, 7)})`);
        return { text: result.text, meta: 'cached', providerModel, ms };
      }
      runLog.event('tool', `Deriving PR intent done (${ms}ms)`);
      return { text: result.text, meta: 'computed', providerModel, ms, usage: result.usage };
    } catch (err) {
      const ms = Date.now() - t0;
      runLog.info(`Intent step failed: ${(err as Error).message}`);
      return {
        text: undefined,
        meta: 'failed',
        providerModel: `${fallbackModel.provider}/${fallbackModel.model}`,
        ms,
      };
    }
  }

  /**
   * Build a compact "Callers of changed symbols" digest for the prompt.
   *
   * Returns `undefined` when nothing should be added (flag off, no callers
   * found, or repo-intel errors) — `reviewPullRequest` omits the section in
   * that case (acceptance #10: flag off → identical prompt).
   *
   * Compact format: one bullet per caller, grouped by file. Trimmed (limit 10
   * rows per `getCallerSignatures` call) so the section stays under ~600
   * tokens even on heavy PRs.
   */
  private async buildCallersDigest(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return undefined;
    let rows;
    try {
      rows = await this.container.repoIntel.getCallerSignatures(repoId, changedFiles, 10);
    } catch (err) {
      // Never let an enrichment break the run — surface only as a Live Log info.
      runLog.info(`callers digest: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
    if (rows.length === 0) return undefined;

    const byFile = new Map<string, string[]>();
    for (const r of rows) {
      const lines = byFile.get(r.file) ?? [];
      lines.push(`- \`${r.symbol}\` — ${r.signature}`);
      byFile.set(r.file, lines);
    }
    const out: string[] = [];
    for (const [file, lines] of byFile) {
      out.push(`### ${file}`);
      out.push(...lines);
    }
    runLog.info(`callers digest: ${rows.length} caller signature(s) attached`);
    return out.join('\n');
  }

  /**
   * T3 — fetch the cached repo skeleton for the prompt's `## Repo skeleton`
   * slot. Returns `undefined` when repo-intel is off / the repo isn't indexed
   * (the facade degrades), so the prompt stays identical to the pre-T3 shape.
   */
  private async buildRepoMapDigest(
    repoId: string,
    runLog: RunLogger,
  ): Promise<string | undefined> {
    try {
      const map = await this.container.repoIntel.getRepoMap(repoId);
      if (map.degraded || map.text.trim().length === 0) return undefined;
      runLog.info(`repo map: ${map.tokens} token(s) attached (cached=${map.cached})`);
      return map.text;
    } catch (err) {
      runLog.info(`repo map: repoIntel failed — ${(err as Error).message}`);
      return undefined;
    }
  }

  /**
   * T3 — a one-line "N of M changed files are in the top 5% most-depended-on"
   * note appended to the task framing, so the model prioritises hot core files.
   * Empty string when repo-intel is off / no changed file is hot.
   */
  private async buildRankNote(
    repoId: string,
    diff: UnifiedDiff,
    runLog: RunLogger,
  ): Promise<string> {
    const changedFiles = diff.files.map((f) => f.path);
    if (changedFiles.length === 0) return '';
    try {
      const ranks = await this.container.repoIntel.getFileRank(repoId, changedFiles);
      if (ranks.length === 0) return '';
      const hot = ranks.filter((r) => r.percentile >= 95);
      if (hot.length === 0) return '';
      runLog.info(`file rank: ${hot.length}/${changedFiles.length} changed file(s) in top 5%`);
      return `\n\n${hot.length} of ${changedFiles.length} changed file(s) are in the top 5% most-depended-on (high blast risk) — prioritise their correctness.`;
    } catch {
      return '';
    }
  }

  /**
   * Linked-skills-in-prompt. Loads the agent's linked skills (ordered), keeps
   * only links AND skills that are both enabled, and returns their bodies in
   * order. Best-effort like the other enrichment helpers: any failure degrades
   * to no skills rather than failing the run.
   */
  private async buildSkillBodies(agentId: string, runLog: RunLogger): Promise<string[]> {
    try {
      const links = await this.agents.linkedSkills(agentId); // already ordered by `order` ascending
      const active = links.filter((l) => l.enabled && l.skill.enabled);
      if (active.length === 0) return [];
      runLog.info(`Loaded ${active.length} skill(s): ${active.map((l) => l.skill.name).join(', ')}`);
      const skippedCount = links.length - active.length;
      if (skippedCount > 0) runLog.info(`Skipped ${skippedCount} disabled skill(s)`);
      return active.map((l) => l.skill.body);
    } catch {
      return [];
    }
  }

  /**
   * Project Context Folder (specs/2026-08-26-project-context-folder.md) —
   * resolve the agent's attached documents (its own + its enabled skills',
   * merged and deduped — AC-11) into `ReviewInput.specs` strings and the
   * trace's `specs_read` lines (AC-18/21). Best-effort: its OWN try/catch,
   * NOT `runLog.step()` — a `.step()` throw emits an 'error' event and
   * re-throws, which paints the whole Live Log as failed for what is a
   * best-effort enrichment stage (insights/INSIGHTS.md, 2026-08-19), exactly
   * like `buildCallersDigest`/`buildRepoMapDigest` above. A failure here
   * degrades to no `## Project context` section — never fails the run.
   *
   * Each resolved string leads with the document's repo-relative path (AC-13)
   * so the agent can cite a specific document in a finding. `specsRead` lists
   * successfully-read documents in insertion (= prompt) order, then any
   * skipped documents as their own visible entries (AC-21) — never silently
   * dropped.
   */
  private async buildProjectContext(
    agentId: string,
    repoId: string,
    runLog: RunLogger,
  ): Promise<{ specs: string[]; specsRead: string[] }> {
    try {
      const { ok, skipped } = await this.container.projectContext.resolveForRun(agentId, repoId);
      if (ok.length === 0 && skipped.length === 0) return { specs: [], specsRead: [] };
      const specs = ok.map((d) => `${d.path}\n\n${d.content}`);
      const specsRead = [
        ...ok.map((d) => `${d.path} · ≈${d.tokens} tokens`),
        ...skipped.map((path) => `${path} · skipped (unreadable)`),
      ];
      if (ok.length > 0) runLog.info(`Project context: ${ok.length} document(s) attached`);
      if (skipped.length > 0) {
        runLog.info(`Project context: skipped ${skipped.length} unreadable/missing document(s)`);
      }
      return { specs, specsRead };
    } catch (err) {
      // Never let enrichment break the run — surface only as a Live Log info,
      // same as the other best-effort digests in this file.
      runLog.info(`Project context: resolution failed — ${(err as Error).message}`);
      return { specs: [], specsRead: [] };
    }
  }

  /**
   * A minimal RunTrace whose `log` is the run's full SSE buffer — persisted on
   * failure/cancel (and pre-work failures) so the events (and WHY it failed)
   * survive a reload, not just the in-memory stream.
   */
  private traceFromBuffer(
    runId: string,
    pull: PullRow,
    agent: AgentRow,
    grounding: string,
    durationMs = 0,
  ): RunTrace {
    return {
      config: {
        agent: agent.name,
        version: String(agent.version),
        provider: agent.provider,
        model: agent.model,
        pr: pull.number,
        source: 'local',
      },
      stats: { duration_ms: durationMs, tokens_in: 0, tokens_out: 0, cost_usd: null, findings: 0, grounding },
      prompt_assembly: { system: agent.systemPrompt, skills: null, memory: null, specs: null, user: '' },
      tool_calls: [],
      raw_output: '',
      memory_pulled: [],
      specs_read: [],
      log: this.container.runBus.buffer(runId).map((e) => ({ t: e.t, kind: e.kind, msg: e.msg })),
    };
  }
}
