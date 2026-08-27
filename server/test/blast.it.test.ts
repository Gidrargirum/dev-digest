/**
 * `GET /pulls/:id/blast` against a real Postgres, with `repoIntel` overridden
 * by a stub (`ContainerOverrides.repoIntel`) — the HTTP/tenancy contract
 * described by specs/blast-radius.md "API contract", not the repo-intel
 * mapping logic (that's `service.test.ts`, unit-level, against
 * `BlastRadiusSource` directly).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import type { ContainerOverrides } from '../src/platform/container.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

/**
 * The `repoIntel` port this module actually calls, typed through
 * `ContainerOverrides` rather than importing `modules/repo-intel/types.ts`
 * directly — same cross-module boundary `blast/types.ts` documents.
 * `registerIndexJobHandlers` MUST be a no-op: `repo-intel/routes.ts` calls it
 * once at boot (`buildApp`), and a missing stub there throws before any test
 * gets to run.
 */
type RepoIntelStub = NonNullable<ContainerOverrides['repoIntel']>;

function repoIntelStub(getBlastRadius: RepoIntelStub['getBlastRadius']): RepoIntelStub {
  return {
    registerIndexJobHandlers: () => {},
    indexRepo: async () => {
      throw new Error('not used by this test');
    },
    refreshIndex: async () => {
      throw new Error('not used by this test');
    },
    getIndexState: async () => {
      throw new Error('not used by this test');
    },
    getBlastRadius,
    getRepoMap: async () => ({ text: '', tokens: 0, cached: false }),
    getFileRank: async () => [],
    getSymbolsInFiles: async () => [],
    getCallerSignatures: async () => [],
    getUnresolvedReferences: async () => [],
    getConventionSamples: async () => [],
    getTopFilesByRank: async () => [],
    getCriticalPaths: async () => [],
  };
}

let repoSeq = 0;
async function setupRepoAndPr(db: PgFixture['handle']['db'], workspaceId: string) {
  const name = `blast-repo-${repoSeq++}`;
  const [repo] = await db
    .insert(t.repos)
    .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
    .returning();
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId: repo!.id,
      number: 101,
      title: 'Add rate limiting',
      author: 'marisa.koch',
      branch: 'feat/rl',
      base: 'main',
      headSha: 'a1b2c3d4',
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  await db.insert(t.prFiles).values({
    prId: pr!.id,
    path: 'src/rate-limit.ts',
    additions: 1,
    deletions: 0,
  });
  return { repo: repo!, pr: pr! };
}

d('GET /pulls/:id/blast (Testcontainers pg)', () => {
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

  function appWith(repoIntel: RepoIntelStub) {
    return buildApp({ config: config(), db: pg.handle.db, overrides: { repoIntel } });
  }

  it('PR with changed files and a usable index → 200, status: ok', async () => {
    const repoIntel = repoIntelStub(async () => ({
      changedSymbols: [{ file: 'src/rate-limit.ts', name: 'limit', kind: 'function' }],
      callers: [
        { file: 'src/routes/api.ts', symbol: 'handleApi', viaSymbol: 'limit', line: 5, rank: 1 },
      ],
      impactedEndpoints: ['POST /api'],
      factsByFile: { 'src/routes/api.ts': { endpoints: ['POST /api'], crons: [] } },
    }));
    const app = await appWith(repoIntel);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('ok');
    expect(body.reason).toBeNull();
    expect(body.blast.downstream).toHaveLength(1);
    expect(body.blast.downstream[0].symbol).toBe('limit');
    expect(body.counts).toEqual({ symbols: 1, callers: 1, endpoints: 1, crons: 0 });
    expect(body.prior_prs).toEqual([]);

    await app.close();
  });

  it('a non-existent :id returns 404', async () => {
    const app = await appWith(repoIntelStub(async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] })));

    const res = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/blast',
    });

    expect(res.statusCode).toBe(404);

    await app.close();
  });

  it('a :id belonging to another workspace returns 404, same shape as a missing id', async () => {
    const [otherWs] = await pg.handle.db
      .insert(t.workspaces)
      .values({ name: `other-ws-${repoSeq}` })
      .returning();
    const { pr } = await setupRepoAndPr(pg.handle.db, otherWs!.id);
    const app = await appWith(repoIntelStub(async () => ({ changedSymbols: [], callers: [], impactedEndpoints: [] })));

    // Requesting as the DEFAULT workspace's caller (LocalNoAuthProvider always
    // resolves the default workspace), for a PR seeded under `otherWs`.
    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });

    expect(res.statusCode).toBe(404);
    const missingRes = await app.inject({
      method: 'GET',
      url: '/pulls/00000000-0000-0000-0000-000000000000/blast',
    });
    expect(missingRes.json()).toEqual(res.json());

    await app.close();
  });

  it('a PR in the caller workspace whose repo has no usable index → 200, status: degraded, blast: null', async () => {
    const repoIntel = repoIntelStub(async () => ({
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data' as const,
    }));
    const app = await appWith(repoIntel);
    const { pr } = await setupRepoAndPr(pg.handle.db, workspaceId);

    const res = await app.inject({ method: 'GET', url: `/pulls/${pr.id}/blast` });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.status).toBe('degraded');
    expect(body.blast).toBeNull();
    expect(body.reason).toBeTruthy();
    expect(body.prior_prs).toEqual([]);

    await app.close();
  });
});
