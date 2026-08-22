import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockLLMProvider, MockEmbedder, MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import { eq } from 'drizzle-orm';
import type { Review, StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * A minimal unified diff (grounding only needs a real line to keep the one
 * finding below on) — intent derivation itself never touches the diff
 * content, only the changed-file paths.
 */
const DIFF = `diff --git a/src/config.ts b/src/config.ts
--- a/src/config.ts
+++ b/src/config.ts
@@ -10,3 +10,4 @@
   port: 3000,
+  stripeKey: "sk_live_xxx",
   redisUrl: x,`;

const REVIEW_FIXTURE: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

const INTENT_FIXTURE = {
  intent: 'Adds rate limiting to the public API.',
  in_scope: ['rate limiting middleware'],
  out_of_scope: ['auth changes'],
  risk_areas: ['public API surface'],
};

let repoSeq = 0;
async function setupRepoAndPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
) {
  const name = `intent-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 482,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
      ...overrides,
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: '@@ -10,3 +10,4 @@\n   port: 3000,\n+  stripeKey: "sk_live_xxx",\n   redisUrl: x,',
  });
  return { repo: repo!, pr: pr! };
}

/**
 * A MockLLMProvider whose `completeStructured` throws for the intent call
 * (`schemaName === 'PrIntent'`, `service.ts`'s `INTENT_SCHEMA_NAME`) while
 * still serving the review call normally — lets scenario (c) fail ONLY the
 * intent step without touching the review pipeline.
 */
class IntentThrowingLLMProvider extends MockLLMProvider {
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName === 'PrIntent') throw new Error('intent llm boom');
    return super.completeStructured(req);
  }
}

d('Intent layer (Testcontainers pg)', () => {
  let pg: PgFixture;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces);
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function appWith(llm: MockLLMProvider, githubOpts?: ConstructorParameters<typeof MockGitHubClient>[0]) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(githubOpts),
        llm: { openai: llm },
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof appWith>>, name: string) {
    return (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'You are a reviewer.' },
      })
    ).json();
  }

  it('(a) a PR whose body links a resolvable issue gets a "high" confidence pr_intent row, readable via GET', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Review: REVIEW_FIXTURE, PrIntent: INTENT_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Add rate limiting. Closes #471.',
    });
    const agent = await createAgent(app, 'IntentAgent-A');

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    // Persisted row directly.
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toBeDefined();
    expect(row!.confidence).toBe('high');
    expect(row!.headSha).toBe(pr.headSha);
    expect(row!.sources).toContain('issue#471');

    // GET /pulls/:id/intent returns the same record.
    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(getRes.statusCode).toBe(200);
    const body = getRes.json();
    expect(body.intent).not.toBeNull();
    expect(body.intent.confidence).toBe('high');
    expect(body.intent.pr_id).toBe(pr.id);
    expect(body.intent.head_sha).toBe(pr.headSha);
    expect(body.intent.intent).toBe(INTENT_FIXTURE.intent);

    await app.close();
  });

  it('(b) re-running on the same head_sha does not call the intent LLM again; the row is unchanged', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Review: REVIEW_FIXTURE, PrIntent: INTENT_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Add rate limiting. Closes #471.',
    });
    const agent = await createAgent(app, 'IntentAgent-B');

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });

    const [firstRow] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    const intentCallsAfterFirst = llm.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as StructuredRequest<unknown>).schemaName === 'PrIntent',
    ).length;
    expect(intentCallsAfterFirst).toBe(1);

    // Second review run, same head_sha (no PR update in between).
    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const intentCallsAfterSecond = llm.calls.filter(
      (c) => c.method === 'completeStructured' && (c.req as StructuredRequest<unknown>).schemaName === 'PrIntent',
    ).length;
    expect(intentCallsAfterSecond).toBe(1); // no new intent LLM call on cache hit

    const [secondRow] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(secondRow!.computedAt.getTime()).toBe(firstRow!.computedAt.getTime());
    expect(secondRow!.intent).toBe(firstRow!.intent);

    await app.close();
  });

  it('(c) an intent LLM failure still lets the review run complete "done"; GET intent returns { intent: null }', async () => {
    const llm = new IntentThrowingLLMProvider('openai', {
      structuredBySchema: { Review: REVIEW_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Add rate limiting. Closes #471.',
    });
    const agent = await createAgent(app, 'IntentAgent-C');

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { agentId: agent.id },
    });
    expect(res.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 1 });
    expect(runs).toHaveLength(1);
    expect(runs[0]!.status).toBe('done');

    // Nothing persisted — the cache is never poisoned by a failed attempt.
    const [row] = await pg.handle.db.select().from(t.prIntent).where(eq(t.prIntent.prId, pr.id));
    expect(row).toBeUndefined();

    const getRes = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/intent` });
    expect(getRes.statusCode).toBe(200);
    expect(getRes.json()).toEqual({ intent: null });

    await app.close();
  });

  it('(cost attribution) intent tokens/cost land on the first job only, and only on a cache miss', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: { Review: REVIEW_FIXTURE, PrIntent: INTENT_FIXTURE },
    });
    const app = await appWith(llm);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId, {
      body: 'Add rate limiting. Closes #471.',
    });

    // `POST /pulls/:id/review` only accepts a single `agentId` or `all:true`
    // (no "these specific agents" option) — to get exactly 2 fanned-out jobs
    // (openai, matching the mock) we disable seed's built-in agents first.
    const existingAgents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    for (const a of existingAgents) {
      await app.inject({ method: 'PUT', url: `/agents/${a.id}`, payload: { enabled: false } });
    }
    const agentA = await createAgent(app, 'CostAgent-A');
    const agentB = await createAgent(app, 'CostAgent-B');

    const res = (
      await app.inject({
        method: 'POST',
        url: `/pulls/${pr.id}/review`,
        payload: { all: true },
      })
    ).json();
    expect(res.runs).toHaveLength(2);
    const runAgentIds = res.runs.map((r: { agent_id: string }) => r.agent_id).sort();
    expect(runAgentIds).toEqual([agentA.id, agentB.id].sort());
    await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });

    const runRows = await pg.handle.db
      .select()
      .from(t.agentRuns)
      .where(eq(t.agentRuns.prId, pr.id));
    expect(runRows).toHaveLength(2);

    const firstRunId = res.runs[0].run_id;
    const secondRunId = res.runs[1].run_id;
    const firstRun = runRows.find((r) => r.id === firstRunId)!;
    const secondRun = runRows.find((r) => r.id === secondRunId)!;

    // MockLLMProvider reports 100 tokensIn/50 tokensOut per completeStructured
    // call. The review call itself contributes that baseline to EVERY run;
    // only the first run additionally carries the intent call's own 100/50.
    expect(firstRun.tokensIn).toBe(200); // review (100) + intent (100)
    expect(firstRun.tokensOut).toBe(100); // review (50) + intent (50)
    expect(secondRun.tokensIn).toBe(100); // review only
    expect(secondRun.tokensOut).toBe(50); // review only

    await app.close();
  });
});
