import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockLLMProvider,
  MockEmbedder,
  MockGitClient,
  MockGitHubClient,
} from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const testConfig = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
const devConfig = () => loadConfig({ ...process.env, NODE_ENV: 'development' } as NodeJS.ProcessEnv);

const BRIEF_FIXTURE = {
  what: 'Adds a rate limiter to the public API.',
  why: 'Protect the service from abusive traffic.',
  risk_level: 'medium' as const,
  risks: [{ title: 'Config parsing', detail: null, path: 'src/config.ts', line: 11, endpoint: null }],
  review_focus: [{ path: 'src/config.ts', line: 11, reason: 'new secret handling' }],
};

/** An LLM mock that throws only for the brief structured call. */
class BriefThrowingLLM extends MockLLMProvider {
  async completeStructured<T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> {
    if (req.schemaName === 'PrWhyRiskBrief') throw new Error('brief llm boom');
    return super.completeStructured(req);
  }
}

let repoSeq = 0;
async function setupPr(
  db: PgFixture['handle']['db'],
  workspaceId: string,
  overrides: Partial<typeof t.pullRequests.$inferInsert> = {},
) {
  const name = `brief-repo-${repoSeq++}`;
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
      additions: 4,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
      body: 'Add rate limiting. Closes #471.',
      ...overrides,
    })
    .returning();
  return { repo: repo!, pr: pr! };
}

async function waitForBrief(
  db: PgFixture['handle']['db'],
  prId: string,
  opts: { timeoutMs?: number } = {},
): Promise<typeof t.prWhyRiskBrief.$inferSelect | undefined> {
  const { timeoutMs = 8000 } = opts;
  const start = Date.now();
  for (;;) {
    const [row] = await db.select().from(t.prWhyRiskBrief).where(eq(t.prWhyRiskBrief.prId, prId));
    if (row) return row;
    if (Date.now() - start > timeoutMs) return undefined;
    await new Promise((r) => setTimeout(r, 25));
  }
}

/** Drain any queued background jobs, then a short settle for the void trigger. */
async function settle(app: Awaited<ReturnType<typeof buildApp>>) {
  await new Promise((r) => setTimeout(r, 80));
  await app.container.jobs.onIdle();
  await new Promise((r) => setTimeout(r, 20));
  await app.container.jobs.onIdle();
}

/** Always drain background work before tearing the app down — a fire-and-forget
 *  `requestRecompute` still issuing queries against a closed pool surfaces as an
 *  unhandled `CONNECTION_ENDED` rejection and fails the lane. */
async function closeApp(app: Awaited<ReturnType<typeof buildApp>>) {
  await settle(app);
  await app.close();
}

function briefCalls(llm: MockLLMProvider): number {
  return llm.calls.filter(
    (c) =>
      c.method === 'completeStructured' &&
      (c.req as StructuredRequest<unknown>).schemaName === 'PrWhyRiskBrief',
  ).length;
}

d('PR Why + Risk Brief (Testcontainers pg)', () => {
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

  function appWith(llm: MockLLMProvider, config = testConfig()) {
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        embedder: new MockEmbedder(),
        git: new MockGitClient({ diff: '' }),
        github: new MockGitHubClient(),
        llm: { openai: llm },
      },
    });
  }

  it('(import trigger + none-yet) GET /pulls/:id enqueues a background brief; the read is 200 {brief:null} until it lands', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE } });
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    // Nothing computed yet — explicit "no brief", never 404 (AC-20).
    const before = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(before.statusCode).toBe(200);
    expect(before.json()).toEqual({ brief: null });

    const detail = await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(detail.statusCode).toBe(200); // import response does not wait on the brief (AC-1)

    const row = await waitForBrief(pg.handle.db, pr.id);
    expect(row).toBeDefined();
    expect(row!.what).toBe(BRIEF_FIXTURE.what);
    expect(row!.sources).toContain('pr_files');
    expect(row!.sources).not.toContain('intent'); // no review run yet (AC-17)
    expect(briefCalls(llm)).toBe(1);

    const after = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(after.json().brief.what).toBe(BRIEF_FIXTURE.what);
    expect(after.json().brief.pr_id).toBe(pr.id);

    await closeApp(app);
  });

  it('(cache hit) an unchanged state key does not call the LLM again', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE } });
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    const first = await waitForBrief(pg.handle.db, pr.id);
    expect(first).toBeDefined();
    expect(briefCalls(llm)).toBe(1);
    const firstComputedAt = first!.computedAt.getTime();

    // Second detail open, same head_sha, same diff stats.
    await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    await settle(app);
    expect(briefCalls(llm)).toBe(1); // no recompute

    const [again] = await pg.handle.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, pr.id));
    expect(again!.computedAt.getTime()).toBe(firstComputedAt);

    await closeApp(app);
  });

  it('(cache miss) a changed head_sha recomputes the brief in the background (AC-5)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE } });
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    await waitForBrief(pg.handle.db, pr.id);
    expect(briefCalls(llm)).toBe(1);
    const firstKey = (
      await pg.handle.db.select().from(t.prWhyRiskBrief).where(eq(t.prWhyRiskBrief.prId, pr.id))
    )[0]!.prStateKey;

    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'f00dbabe' })
      .where(eq(t.pullRequests.id, pr.id));

    await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    await settle(app);
    expect(briefCalls(llm)).toBe(2);

    const [row] = await pg.handle.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, pr.id));
    expect(row!.prStateKey).not.toBe(firstKey);

    await closeApp(app);
  });

  it('(forced regenerate) POST .../regenerate always bypasses the cache (AC-6)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE } });
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    const first = await waitForBrief(pg.handle.db, pr.id);
    expect(briefCalls(llm)).toBe(1);

    const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/regenerate` });
    expect(res.statusCode).toBe(200);
    expect(res.json().status).toMatch(/started|running/);
    await settle(app);
    expect(briefCalls(llm)).toBe(2); // recomputed despite an unchanged state key

    const [row] = await pg.handle.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, pr.id));
    expect(row!.computedAt.getTime()).toBeGreaterThanOrEqual(first!.computedAt.getTime());

    await closeApp(app);
  });

  it('(regenerate on unknown/other-workspace PR) → 404, not a silent 200', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE } });
    const app = await appWith(llm);

    const res = await app.inject({
      method: 'POST',
      url: `/pulls/00000000-0000-0000-0000-000000000000/brief/regenerate`,
    });
    expect(res.statusCode).toBe(404);

    await closeApp(app);
  });

  it('(failure isolation) a brief compute failure never breaks the import and never poisons a prior brief (AC-2)', async () => {
    // 1) first a good compute
    const goodLlm = new MockLLMProvider('openai', {
      structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE },
    });
    const goodApp = await appWith(goodLlm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);
    await goodApp.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    const stored = await waitForBrief(pg.handle.db, pr.id);
    expect(stored).toBeDefined();
    await closeApp(goodApp);

    // 2) now the brief call throws; force a state change and re-open the PR
    const badLlm = new BriefThrowingLLM('openai', { structuredBySchema: {} });
    const badApp = await appWith(badLlm);
    await pg.handle.db
      .update(t.pullRequests)
      .set({ headSha: 'deadbeef99' })
      .where(eq(t.pullRequests.id, pr.id));

    const detail = await badApp.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    expect(detail.statusCode).toBe(200); // import unaffected
    await settle(badApp);

    const [row] = await pg.handle.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, pr.id));
    // previous brief left exactly as it was
    expect(row!.computedAt.getTime()).toBe(stored!.computedAt.getTime());
    expect(row!.prStateKey).toBe(stored!.prStateKey);

    const briefRead = await badApp.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(briefRead.statusCode).toBe(200);
    expect(briefRead.json().brief.what).toBe(BRIEF_FIXTURE.what);

    await closeApp(badApp);
  });

  // The post-review trigger in run-executor.ts calls
  // `container.brief.enqueueRecompute(ws, prId, { force: true })` — `force`
  // bypasses the state-key cache (which has no intent component), so a review
  // run that produces an intent without changing the diff still recomputes the
  // brief and `sources` gains `intent` (AC-7).
  it('(post-review trigger) a completed review run recomputes the brief so the new intent is reflected (AC-7)', async () => {
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        PrWhyRiskBrief: BRIEF_FIXTURE,
        Review: { verdict: 'approve', summary: 'ok', score: 90, findings: [] },
        PrIntent: {
          intent: 'Adds rate limiting.',
          in_scope: ['limiter'],
          out_of_scope: [],
          risk_areas: [],
        },
      },
    });
    const app = await appWith(llm);
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    // import-time brief first (no intent yet)
    await app.inject({ method: 'GET', url: `/pulls/${pr.id}` });
    const importBrief = await waitForBrief(pg.handle.db, pr.id);
    expect(importBrief!.sources).not.toContain('intent');
    const callsAfterImport = briefCalls(llm);

    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: { name: `BriefAgent-${repoSeq}`, provider: 'openai', model: 'gpt-4.1', system_prompt: 'r' },
      })
    ).json();

    await app.inject({ method: 'POST', url: `/pulls/${pr.id}/review`, payload: { agentId: agent.id } });
    // wait for the review run + the post-run brief recompute
    const deadline = Date.now() + 15_000;
    for (;;) {
      await settle(app);
      const [row] = await pg.handle.db
        .select()
        .from(t.prWhyRiskBrief)
        .where(eq(t.prWhyRiskBrief.prId, pr.id));
      if (row?.sources?.includes('intent') || Date.now() > deadline) break;
      await new Promise((r) => setTimeout(r, 100));
    }

    const [row] = await pg.handle.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, pr.id));
    expect(row!.sources).toContain('intent');
    expect(briefCalls(llm)).toBeGreaterThan(callsAfterImport);

    await closeApp(app);
  });

  it('(workspace scoping) a PR in another workspace is indistinguishable from a non-existent one (AC-22)', async () => {
    const llm = new MockLLMProvider('openai', { structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE } });
    const app = await appWith(llm);

    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq}` })
      .returning();
    const { pr } = await setupPr(pg.handle.db, otherWs!.id);
    await pg.handle.db.insert(t.prWhyRiskBrief).values({
      prId: pr.id,
      prStateKey: 'k',
      what: 'secret',
      why: 'secret',
      riskLevel: 'high',
      risks: [],
      reviewFocus: [],
      risksTotal: 0,
      reviewFocusTotal: 0,
      sources: [],
      model: 'openai/gpt-4.1',
      computedAt: new Date(),
    });

    const read = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/brief` });
    expect(read.statusCode).toBe(200);
    expect(read.json()).toEqual({ brief: null }); // not 404, no cross-workspace disclosure

    const regen = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/regenerate` });
    expect(regen.statusCode).toBe(404);

    await closeApp(app);
  });

  it('(rate limit) manual regeneration is capped per PR — 429 + Retry-After past MAX_REGEN (AC-38)', async () => {
    let app: Awaited<ReturnType<typeof buildApp>>;
    try {
      app = await appWith(
        new MockLLMProvider('openai', { structuredBySchema: { PrWhyRiskBrief: BRIEF_FIXTURE } }),
        devConfig(),
      );
    } catch (err) {
      // @fastify/rate-limit is only registered outside NODE_ENV=test; if a dev
      // config cannot be built here, the HTTP-level limit cannot be exercised.
      expect.fail(`could not build a non-test app to exercise the rate limit: ${String(err)}`);
      return;
    }
    const { pr } = await setupPr(pg.handle.db, workspaceId);

    const statuses: number[] = [];
    let retryAfter: string | undefined;
    for (let i = 0; i < 4; i++) {
      const res = await app.inject({ method: 'POST', url: `/pulls/${pr.id}/brief/regenerate` });
      statuses.push(res.statusCode);
      if (res.statusCode === 429) retryAfter = res.headers['retry-after'] as string;
    }
    expect(statuses.slice(0, 3)).toEqual([200, 200, 200]);
    expect(statuses[3]).toBe(429);
    expect(retryAfter).toBeDefined();

    await closeApp(app);
  });
});
