import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  LLMProvider,
  ModelInfo,
  CompletionRequest,
  CompletionResult,
  StructuredRequest,
  StructuredResult,
  Review,
} from '@devdigest/shared';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-batch] Docker not available — skipping integration tests.');
}

function throwingClient(name: string) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        return (..._args: unknown[]) => {
          throw new Error(`unexpected ${name}.${String(prop)} call`);
        };
      },
    },
  );
}

const DIFF = [
  'diff --git a/src/config.ts b/src/config.ts',
  '--- a/src/config.ts',
  '+++ b/src/config.ts',
  '@@ -1,2 +1,3 @@',
  ' export const config = {',
  "+  apiKey: 'sk_live_xxx',",
  ' };',
].join('\n');

const REVIEW_FIXTURE: Review = {
  verdict: 'request_changes',
  summary: 'Hardcoded key.',
  score: 50,
  findings: [
    {
      id: 'f1',
      severity: 'CRITICAL',
      category: 'security',
      title: 'Hardcoded API key',
      file: 'src/config.ts',
      start_line: 2,
      end_line: 2,
      rationale: 'A live key is committed in source.',
      confidence: 0.9,
      kind: 'finding',
    },
  ],
};

/**
 * A wrapped `LLMProvider` that throws when the outgoing prompt mentions a
 * given marker string (used to fail exactly ONE eval case's provider call —
 * AC-15 — while the rest of the batch runs normally through the delegate).
 */
class FlakyOnMarkerProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  constructor(
    private delegate: MockLLMProvider,
    private marker: string,
  ) {
    this.id = delegate.id;
  }
  async listModels(): Promise<ModelInfo[]> {
    return this.delegate.listModels();
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.delegate.complete(req);
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.messages.some((m) => m.content.includes(this.marker))) {
      throw new Error(`simulated provider failure for case containing "${this.marker}"`);
    }
    return this.delegate.completeStructured(req);
  }
  async embed(texts: string[]): Promise<number[][]> {
    return this.delegate.embed(texts);
  }
}

/**
 * A wrapped `LLMProvider` that records every `completeStructured` request it
 * receives (used to assert a linked skill's body actually reached the
 * prompt — GAP fix: `batch-executor.ts` must resolve the agent's linked
 * skills the same way `ReviewRunExecutor` does, not just the system prompt).
 */
class RecordingProvider implements LLMProvider {
  readonly id: 'openai' | 'anthropic';
  requests: StructuredRequest<unknown>[] = [];
  constructor(private delegate: MockLLMProvider) {
    this.id = delegate.id;
  }
  async listModels(): Promise<ModelInfo[]> {
    return this.delegate.listModels();
  }
  async complete(req: CompletionRequest): Promise<CompletionResult> {
    return this.delegate.complete(req);
  }
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    this.requests.push(req as StructuredRequest<unknown>);
    return this.delegate.completeStructured(req);
  }
  async embed(texts: string[]): Promise<number[][]> {
    return this.delegate.embed(texts);
  }
}

d('eval-batch (A5) — async execution, per-case failure isolation, empty set, isolation', () => {
  let pg: PgFixture;
  let defaultWorkspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    defaultWorkspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(llmOverride?: LLMProvider) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        git: throwingClient('git') as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github: throwingClient('github') as any,
        ...(llmOverride ? { llm: { openai: llmOverride } } : {}),
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
    });
    expect(created.statusCode).toBe(201);
    return created.json() as { id: string; version: number };
  }

  async function createCase(
    app: Awaited<ReturnType<typeof makeApp>>,
    agentId: string,
    name: string,
    expectationType: 'must_find' | 'must_not_flag' = 'must_find',
  ) {
    const res = await app.inject({
      method: 'POST',
      url: `/agents/${agentId}/eval-cases`,
      payload: {
        owner_kind: 'agent',
        owner_id: agentId,
        name,
        input_diff: DIFF,
        expectation_type: expectationType,
        expected_output:
          expectationType === 'must_find'
            ? [{ file: 'src/config.ts', start_line: 2, end_line: 2, severity: 'CRITICAL', category: 'security', title: 'Hardcoded key' }]
            : [],
      },
    });
    expect(res.statusCode).toBe(201);
    return res.json() as { id: string; name: string };
  }

  /** Poll `GET /eval-runs/:batchId` until the batch leaves `running`. */
  async function waitForBatch(
    app: Awaited<ReturnType<typeof makeApp>>,
    batchId: string,
    timeoutMs = 10_000,
  ): Promise<{ batch: Record<string, unknown>; runs: Record<string, unknown>[] }> {
    const start = Date.now();
    for (;;) {
      const res = await app.inject({ method: 'GET', url: `/eval-runs/${batchId}` });
      const body = res.json();
      if (body.batch.status !== 'running') return body;
      if (Date.now() - start > timeoutMs) return body;
      await new Promise((r) => setTimeout(r, 25));
    }
  }

  it('AC-12/AC-13: POST /agents/:id/eval-runs returns a batch id immediately; one run row per case, each carrying batch_id and the agent version at execution time', async () => {
    const app = await makeApp(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const agent = await createAgent(app, 'Batch Agent');
    await createCase(app, agent.id, 'Case A');
    await createCase(app, agent.id, 'Case B');
    await createCase(app, agent.id, 'Case C (must_not_flag)', 'must_not_flag');

    const started = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(started.statusCode).toBe(202);
    const { batch_id: batchId } = started.json();
    expect(typeof batchId).toBe('string');

    const { batch, runs } = await waitForBatch(app, batchId);
    expect(batch.status).toBe('done');
    expect(batch.agent_version).toBe(agent.version);
    expect(runs).toHaveLength(3);
    for (const run of runs) {
      expect(run.batch_id).toBe(batchId);
    }

    await app.close();
  });

  it("AC-13: the batch records the agent's version in force at execution time, not a later one", async () => {
    const app = await makeApp(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const agent = await createAgent(app, 'Versioned Batch Agent');
    await createCase(app, agent.id, 'Only case');

    const started = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    const { batch_id: batchId } = started.json();

    // Edit the agent AFTER the batch has been kicked off but before we assert —
    // the recorded agent_version must stay pinned to what was in force at insert.
    await app.inject({
      method: 'PUT',
      url: `/agents/${agent.id}`,
      payload: { system_prompt: 'A different prompt' },
    });

    const { batch } = await waitForBatch(app, batchId);
    expect(batch.agent_version).toBe(1);
    await app.close();
  });

  it('AC-15: one case whose provider call throws is persisted as pass:false; the remaining cases still run', async () => {
    const delegate = new MockLLMProvider('openai', { structured: REVIEW_FIXTURE });
    const app = await makeApp(new FlakyOnMarkerProvider(delegate, 'Flaky Case'));
    const agent = await createAgent(app, 'Flaky Batch Agent');
    const okCase = await createCase(app, agent.id, 'Healthy Case');
    const failCase = await createCase(app, agent.id, 'Flaky Case');

    const started = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    const { batch_id: batchId } = started.json();

    const { batch, runs } = await waitForBatch(app, batchId);
    expect(batch.status).toBe('done');
    expect(batch.cases_total).toBe(2);
    expect(runs).toHaveLength(2);

    const failedRun = runs.find((r) => r.case_id === failCase.id)!;
    expect(failedRun.pass).toBe(false);
    expect(failedRun.recall).toBeNull();

    const healthyRun = runs.find((r) => r.case_id === okCase.id)!;
    expect(healthyRun.pass).toBe(true);

    await app.close();
  });

  it("GAP fix: a skill linked to the agent is resolved into the eval prompt, not just the system prompt", async () => {
    const recording = new RecordingProvider(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const app = await makeApp(recording);
    const agent = await createAgent(app, 'Skill-Linked Batch Agent');
    await createCase(app, agent.id, 'Only case');

    const marker = 'GAP-FIX-SKILL-MARKER-42';
    const createdSkill = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: {
        name: 'Eval Skill Marker',
        description: 'Marks whether linked skills reach the eval prompt.',
        type: 'convention',
        body: `Always check for ${marker}.`,
      },
    });
    expect(createdSkill.statusCode).toBe(201);
    const skill = createdSkill.json() as { id: string };

    const linked = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_id: skill.id },
    });
    expect(linked.statusCode).toBe(200);

    const started = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(started.statusCode).toBe(202);
    const { batch_id: batchId } = started.json();

    const { batch } = await waitForBatch(app, batchId);
    expect(batch.status).toBe('done');

    expect(recording.requests).toHaveLength(1);
    const sentMessages = recording.requests[0]!.messages.map((m) => m.content).join('\n');
    expect(sentMessages).toContain(marker);

    await app.close();
  });

  it('AC-16: running a batch with zero cases returns 400 and persists nothing', async () => {
    const app = await makeApp(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));
    const agent = await createAgent(app, 'Empty Batch Agent');

    const started = await app.inject({ method: 'POST', url: `/agents/${agent.id}/eval-runs` });
    expect(started.statusCode).toBe(400);

    const batches = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-runs` })).json();
    expect(batches).toHaveLength(0);
    await app.close();
  });

  it('AC-34: a batch/agent id from another workspace 404s on run and read', async () => {
    const app = await makeApp(new MockLLMProvider('openai', { structured: REVIEW_FIXTURE }));

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'eval-batch-other' }).returning();
    const agentsRepo = new AgentsRepository(pg.handle.db);
    const foreignAgent = await agentsRepo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Batch Agent',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });
    const evalRepo = new EvalRepository(pg.handle.db);
    await evalRepo.insertCase({
      workspaceId: otherWs!.id,
      ownerId: foreignAgent.id,
      name: 'Foreign case',
      inputDiff: DIFF,
      expectationType: 'must_find',
      expectedOutput: [],
    });
    const foreignBatch = await evalRepo.insertBatch({
      workspaceId: otherWs!.id,
      agentId: foreignAgent.id,
      agentVersion: foreignAgent.version,
    });

    expect((await app.inject({ method: 'POST', url: `/agents/${foreignAgent.id}/eval-runs` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/agents/${foreignAgent.id}/eval-runs` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval-runs/${foreignBatch.id}` })).statusCode).toBe(404);

    await app.close();
  });
});
