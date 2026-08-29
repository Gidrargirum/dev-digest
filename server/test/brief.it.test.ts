import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { eq } from 'drizzle-orm';
import type {
  Brief,
  PrBlastResponse,
  Review,
  StructuredRequest,
  StructuredResult,
} from '@devdigest/shared';
import { buildApp } from '../src/app.js';
import {
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
} from '../src/adapters/mocks.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { dockerAvailable, startPg, type PgFixture } from './helpers/pg.js';
import { waitForPrRuns } from './helpers/runs.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;
const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

const REVIEW: Review = {
  verdict: 'approve',
  summary: 'Looks fine.',
  score: 90,
  findings: [],
};

const INTENT = {
  intent: 'Adds a guarded write endpoint.',
  in_scope: ['route authorization'],
  out_of_scope: ['database redesign'],
};

const BRIEF: Brief = {
  what: 'Adds a guarded write endpoint.',
  why: 'The API needs a safer write path.',
  risk_level: 'high',
  risks: [
    {
      kind: 'security',
      title: 'Authorization boundary',
      explanation: 'The route changes who may write data.',
      severity: 'high',
      file_refs: ['src/write.ts:2', 'invented.ts:1'],
    },
  ],
  review_focus: [
    { label: 'Read the route first', file_refs: ['src/write.ts:2'] },
    { label: 'Hallucinated file', file_refs: ['invented.ts:1'] },
  ],
};

const BLAST: PrBlastResponse = {
  status: 'degraded',
  reason: 'no_data',
  blast: null,
  counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
  prior_prs: [],
};

const DIFF = `diff --git a/src/write.ts b/src/write.ts
--- a/src/write.ts
+++ b/src/write.ts
@@ -1,2 +1,3 @@
 export const write = () => {
+  authorize();
 }`;

class ToggleBriefLLM extends MockLLMProvider {
  failBrief = false;
  failFirstReview = false;
  private reviewAttempts = 0;

  override async completeStructured<T>(
    req: StructuredRequest<T>,
  ): Promise<StructuredResult<T>> {
    if (this.failBrief && req.schemaName === 'PrBrief') throw new Error('brief llm boom');
    if (req.schemaName === 'Review' && this.failFirstReview && this.reviewAttempts++ === 0) {
      throw new Error('first review boom');
    }
    return super.completeStructured(req);
  }
}

let repoSeq = 0;

d('PR Brief (Testcontainers pg)', () => {
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

  async function setupPr(
    overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
    persistIntent = true,
    targetWorkspaceId = workspaceId,
  ) {
    const name = `brief-repo-${repoSeq++}`;
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: targetWorkspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: targetWorkspaceId,
        repoId: repo!.id,
        number: 482,
        title: 'Add guarded writes',
        author: 'reviewer',
        branch: 'feat/guarded-write',
        base: 'main',
        headSha: 'head-1',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
        body: 'Adds authorization. Closes #42.',
        ...overrides,
      })
      .returning();
    await pg.handle.db.insert(t.prFiles).values({
      prId: pr!.id,
      path: 'src/write.ts',
      additions: 1,
      deletions: 0,
      patch: '@@ -1,2 +1,3 @@\n export const write = () => {\n+  authorize();\n }',
    });
    if (persistIntent) {
      await pg.handle.db.insert(t.prIntent).values({
        prId: pr!.id,
        intent: INTENT.intent,
        inScope: INTENT.in_scope,
        outOfScope: INTENT.out_of_scope,
        sources: ['pr_title'],
        confidence: 'medium',
        headSha: pr!.headSha,
      });
    }
    return pr!;
  }

  function appWith(llm: ToggleBriefLLM) {
    return buildApp({
      config: config(),
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: DIFF }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
        blast: { getBlast: async () => BLAST },
      },
    });
  }

  async function replaceEnabledAgents(app: Awaited<ReturnType<typeof buildApp>>, names: string[]) {
    await pg.handle.db
      .update(t.agents)
      .set({ enabled: false })
      .where(eq(t.agents.workspaceId, workspaceId));
    for (const name of names) {
      const created = await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name,
          provider: 'openai',
          model: 'gpt-4.1',
          system_prompt: 'You are a reviewer.',
        },
      });
      expect(created.statusCode).toBe(201);
    }
  }

  it('reads without generation, force-regenerates, grounds refs, and preserves the old cache on failure', async () => {
    const llm = new ToggleBriefLLM('openai', { structuredBySchema: { PrBrief: BRIEF } });
    const app = await appWith(llm);
    const pr = await setupPr();

    const empty = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(empty.statusCode).toBe(200);
    expect(empty.json()).toEqual({ brief: null });
    expect(llm.calls).toHaveLength(0);

    const forced = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { force: true },
    });
    expect(forced.statusCode).toBe(200);
    expect(forced.json().brief).toMatchObject({
      pr_id: pr.id,
      head_sha: 'head-1',
      run_id: null,
      risks: [{ file_refs: ['src/write.ts:2'] }],
      review_focus: [{ label: 'Read the route first', file_refs: ['src/write.ts:2'] }],
    });

    const briefCalls = () =>
      llm.calls.filter(
        (call) =>
          call.method === 'completeStructured' &&
          (call.req as StructuredRequest<unknown>).schemaName === 'PrBrief',
      ).length;
    expect(briefCalls()).toBe(1);

    const cached = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief` });
    expect(cached.statusCode).toBe(200);
    expect(cached.json().brief.what).toBe(BRIEF.what);
    expect(briefCalls()).toBe(1);

    const [beforeFailure] = await pg.handle.db
      .select()
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, pr.id));
    llm.failBrief = true;
    const failed = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/brief`,
      payload: { force: true },
    });
    expect(failed.statusCode).toBeGreaterThanOrEqual(500);
    expect(failed.json()).toMatchObject({
      error: {
        code: 'brief_regeneration_failed',
        message: 'Failed to regenerate PR Brief',
      },
    });
    expect(JSON.stringify(failed.json())).not.toContain('stack');
    expect(JSON.stringify(failed.json())).not.toContain('brief llm boom');
    const [afterFailure] = await pg.handle.db
      .select()
      .from(t.prBrief)
      .where(eq(t.prBrief.prId, pr.id));
    expect(afterFailure!.json).toEqual(beforeFailure!.json);
    expect(afterFailure!.generatedAt.getTime()).toBe(beforeFailure!.generatedAt.getTime());

    expect(
      (await app.inject({ method: 'POST', url: '/pulls/00000000-0000-0000-0000-000000000000/brief' }))
        .statusCode,
    ).toBe(404);

    const [otherWorkspace] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `brief-foreign-${repoSeq}` })
      .returning();
    const foreignPr = await setupPr({}, false, otherWorkspace!.id);
    const foreign = await app.inject({ method: 'POST', url: `/pulls/${foreignPr.id}/brief` });
    const missing = await app.inject({
      method: 'POST',
      url: '/pulls/00000000-0000-0000-0000-000000000000/brief',
    });
    expect(foreign.statusCode).toBe(404);
    expect(foreign.json()).toEqual(missing.json());
    await app.close();
  });

  it('generates exactly one Brief for an all-agents batch and attributes its usage to one done run', async () => {
    const llm = new ToggleBriefLLM('openai', {
      structuredBySchema: { Review: REVIEW, PrIntent: INTENT, PrBrief: BRIEF },
    });
    const app = await appWith(llm);
    const pr = await setupPr({}, false);

    await replaceEnabledAgents(app, ['Brief Agent A', 'Brief Agent B']);

    const started = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { all: true },
    });
    expect(started.statusCode).toBe(200);
    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    expect(runs.filter((run) => run.status === 'done')).toHaveLength(2);

    const briefCalls = llm.calls.filter(
      (call) =>
        call.method === 'completeStructured' &&
        (call.req as StructuredRequest<unknown>).schemaName === 'PrBrief',
    );
    expect(briefCalls).toHaveLength(1);

    const [row] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    expect(row!.runId).not.toBeNull();
    const producingRun = runs.find((run) => run.id === row!.runId)!;
    const otherRun = runs.find((run) => run.id !== row!.runId)!;
    expect(producingRun.tokensIn).toBe(300);
    expect(producingRun.tokensOut).toBe(150);
    expect(otherRun.tokensIn).toBe(100);
    expect(otherRun.tokensOut).toBe(50);

    await app.close();
  });

  it('lets the first successful agent generate Brief when an earlier agent fails', async () => {
    const llm = new ToggleBriefLLM('openai', {
      structuredBySchema: { Review: REVIEW, PrIntent: INTENT, PrBrief: BRIEF },
    });
    llm.failFirstReview = true;
    const app = await appWith(llm);
    const pr = await setupPr({}, false);
    await replaceEnabledAgents(app, ['Failing Brief Agent', 'Successful Brief Agent']);

    const started = await app.inject({
      method: 'POST',
      url: `/pulls/${pr.id}/review`,
      payload: { all: true },
    });
    expect(started.statusCode).toBe(200);

    const runs = await waitForPrRuns(pg.handle.db, pr.id, { expected: 2 });
    expect(runs.filter((run) => run.status === 'failed')).toHaveLength(1);
    expect(runs.filter((run) => run.status === 'done')).toHaveLength(1);
    expect(
      llm.calls.filter(
        (call) =>
          call.method === 'completeStructured' &&
          (call.req as StructuredRequest<unknown>).schemaName === 'PrBrief',
      ),
    ).toHaveLength(1);

    const [brief] = await pg.handle.db.select().from(t.prBrief).where(eq(t.prBrief.prId, pr.id));
    const successfulRun = runs.find((run) => run.status === 'done')!;
    expect(brief!.runId).toBe(successfulRun.id);
    expect(successfulRun.tokensIn).toBe(200);
    expect(successfulRun.tokensOut).toBe(100);

    await app.close();
  });
});
