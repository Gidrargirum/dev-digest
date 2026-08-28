import type { Brief } from '@devdigest/shared';
import { Brief as BriefSchema } from '@devdigest/shared';
import {
  BRIEF_SCHEMA_NAME,
  BRIEF_TIMEOUT_MS,
  BRIEF_USER_PREFIX,
  SYSTEM_PROMPT,
} from './constants.js';
import {
  assembleBriefInput,
  groundBrief,
  parseFirstLinkedIssueRef,
  renderIntentFacts,
  type BriefLinkedIssue,
} from './helpers.js';
import type {
  BriefDeps,
  BriefGetResult,
  BriefLockedRepository,
  BriefPort,
  BriefRepositoryPort,
  BriefUsage,
  GenerateForRunParams,
  GenerateResult,
  RegenerateResult,
} from './types.js';

interface GeneratedBrief {
  brief: Brief;
  usage: BriefUsage;
}

/**
 * PR Brief — a generated, cached, model-authored `Brief` produced as a
 * consequence of a completed review run, and read/regenerated through
 * `POST /pulls/:id/brief`.
 *
 * Constructor takes ports (`BriefDeps` + `BriefRepositoryPort`) — never the
 * `Container` (AC-9). No `container.*`, no `db/schema`, no `fastify` here.
 */
export class BriefService implements BriefPort {
  constructor(
    private readonly deps: BriefDeps,
    private readonly repo: BriefRepositoryPort,
  ) {}

  /**
   * Discriminated so the route can honour both decisions at once: `not-found`
   * → `404` (PR absent / other workspace, decision #3); `ok` + `brief: null`
   * → `200 { brief: null }` (no cache, or the cached Brief's `head_sha` is
   * stale — AC-11).
   */
  async get(workspaceId: string, prId: string): Promise<BriefGetResult> {
    const pr = await this.repo.resolvePr(workspaceId, prId);
    if (!pr) return { kind: 'not-found' };

    const brief = await this.repo.findBrief(prId);
    if (!brief || brief.head_sha !== pr.headSha) return { kind: 'ok', brief: null };
    return { kind: 'ok', brief };
  }

  /**
   * Called from the review run completion flow. Serialized by the advisory
   * lock; the cache is re-checked inside it so a fan-out of agents results in
   * exactly one LLM call (AC-7). `run_id` is written here (decision #1).
   */
  async generateForRun(params: GenerateForRunParams): Promise<GenerateResult> {
    const { workspaceId, prId, headSha, runId } = params;
    return this.repo.withPrLock(prId, async (tx) => {
      const cached = await tx.findBrief(prId);
      if (cached && cached.head_sha === headSha) return {};

      const { brief, usage } = await this.generate(workspaceId, prId, tx);
      await tx.upsertBrief({ prId, brief, headSha, runId });
      return { usage };
    });
  }

  /**
   * Forced regenerate (AC-12) — always a fresh LLM call, no cache check, and
   * `run_id: null` (no run produced it). On failure the transaction rolls back,
   * so the previously cached Brief is left untouched (AC-13).
   */
  async regenerate(workspaceId: string, prId: string): Promise<RegenerateResult> {
    const pr = await this.repo.resolvePr(workspaceId, prId);
    if (!pr) return { kind: 'not-found' };

    return this.repo.withPrLock(prId, async (tx) => {
      const { brief, usage } = await this.generate(workspaceId, prId, tx);
      await tx.upsertBrief({ prId, brief, headSha: pr.headSha, runId: null });
      return { kind: 'ok', usage };
    });
  }

  /** Assemble deterministic facts → one structured LLM call → grounding gate. */
  private async generate(
    workspaceId: string,
    prId: string,
    tx: BriefLockedRepository,
  ): Promise<GeneratedBrief> {
    const model = await this.deps.featureModel(workspaceId);
    if (!model) throw new Error('risk_brief feature model is not configured');

    const [intentFacts, changedFiles, blastResp, pullContext] = await Promise.all([
      tx.findIntentFacts(prId),
      tx.getChangedFiles(prId),
      this.deps.blast.getBlast(workspaceId, prId).catch(() => undefined),
      tx.findPullContext(prId),
    ]);

    const issue = await this.resolveLinkedIssue(pullContext);

    const blast = blastResp?.blast ?? null;
    const knownPaths = new Set<string>(changedFiles.map((f) => f.path));
    if (blast) {
      for (const s of blast.changed_symbols) knownPaths.add(s.file);
      for (const d of blast.downstream) for (const c of d.callers) knownPaths.add(c.file);
    }

    const userContent = assembleBriefInput({
      intentText: renderIntentFacts(intentFacts),
      blastSummary: blast?.summary ?? null,
      changedFiles,
      issue,
    });

    const llm = await this.deps.llm(model.provider);
    const res = await llm.completeStructured({
      model: model.model,
      schema: BriefSchema,
      schemaName: BRIEF_SCHEMA_NAME,
      temperature: 0,
      timeoutMs: BRIEF_TIMEOUT_MS,
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `${BRIEF_USER_PREFIX}${userContent}` },
      ],
    });

    return {
      brief: groundBrief(res.data, knownPaths),
      usage: { tokensIn: res.tokensIn, tokensOut: res.tokensOut, costUsd: res.costUsd },
    };
  }

  /**
   * Resolve the first same-repo issue referenced in the PR body and fetch its
   * title/body via the GitHub port. Optional input: no ref, or a fetch failure,
   * → `null` and the issue section is simply omitted (spec: "not an error").
   * Its body is wrapped as untrusted text by `assembleBriefInput`.
   */
  private async resolveLinkedIssue(
    ctx: { body: string | null; repoRef: { owner: string; name: string } } | undefined,
  ): Promise<BriefLinkedIssue | null> {
    if (!ctx) return null;
    const number = parseFirstLinkedIssueRef(ctx.body);
    if (number === undefined) return null;
    try {
      const gh = await this.deps.github();
      const issue = await gh.getIssue(ctx.repoRef, number);
      return { number, title: issue.title, body: issue.body ?? null };
    } catch {
      return null;
    }
  }
}
