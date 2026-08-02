import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockEmbedder, MockGitClient } from '../src/adapters/mocks.js';
import * as t from '../src/db/schema.js';
import type { PrMeta } from '@devdigest/shared';

/**
 * `GET /repos/:id/pulls` → `findings_breakdown`: per-severity counts summed
 * across every review of a PR, dismissed findings excluded.
 */

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

const config = () => loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);

type Db = PgFixture['handle']['db'];

let prSeq = 0;

async function insertPr(db: Db, workspaceId: string, repoId: string) {
  const number = 500 + prSeq++;
  const [pr] = await db
    .insert(t.pullRequests)
    .values({
      workspaceId,
      repoId,
      number,
      title: `PR ${number}`,
      author: 'marisa.koch',
      branch: `feat/x-${number}`,
      base: 'main',
      headSha: `sha-${number}`,
      additions: 1,
      deletions: 0,
      filesCount: 1,
      status: 'needs_review',
    })
    .returning();
  return pr!;
}

/** One review carrying the given findings; `dismissed` marks them all dismissed. */
async function insertReview(
  db: Db,
  workspaceId: string,
  prId: string,
  severities: string[],
  opts: { kind?: 'summary' | 'review'; dismissed?: boolean } = {},
) {
  const [review] = await db
    .insert(t.reviews)
    .values({ workspaceId, prId, kind: opts.kind ?? 'review', verdict: 'comment', score: 50 })
    .returning();
  if (severities.length === 0) return review!;
  await db.insert(t.findings).values(
    severities.map((severity, i) => ({
      reviewId: review!.id,
      file: 'src/config.ts',
      startLine: 10 + i,
      endLine: 10 + i,
      severity,
      category: 'bug',
      title: `${severity} finding ${i}`,
      rationale: 'because',
      confidence: 0.9,
      dismissedAt: opts.dismissed ? new Date() : null,
    })),
  );
  return review!;
}

d('GET /repos/:id/pulls — findings_breakdown (Testcontainers pg)', () => {
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

  it('sums severities across reviews, skips dismissed and summary reviews, nulls when empty', async () => {
    const db = pg.handle.db;
    const [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'breakdown-api',
        fullName: 'acme/breakdown-api',
      })
      .returning();

    // Two reviews (as two agent runs would produce) + one dismissed WARNING.
    const multi = await insertPr(db, workspaceId, repo!.id);
    await insertReview(db, workspaceId, multi.id, ['CRITICAL', 'CRITICAL', 'WARNING']);
    await insertReview(db, workspaceId, multi.id, ['WARNING', 'SUGGESTION', 'SUGGESTION']);
    await insertReview(db, workspaceId, multi.id, ['WARNING'], { dismissed: true });
    // A consolidated 'summary' review must not double-count the same findings.
    await insertReview(db, workspaceId, multi.id, ['CRITICAL'], { kind: 'summary' });

    // Reviewed, but clean → no breakdown at all, same as never reviewed.
    const clean = await insertPr(db, workspaceId, repo!.id);
    await insertReview(db, workspaceId, clean.id, []);

    const unreviewed = await insertPr(db, workspaceId, repo!.id);

    const app = await buildApp({
      config: config(),
      db,
      overrides: { embedder: new MockEmbedder(), git: new MockGitClient({ diff: '' }) },
    });
    const res = await app.inject({ method: 'GET', url: `/repos/${repo!.id}/pulls` });
    expect(res.statusCode).toBe(200);
    const byNumber = new Map<number, PrMeta>(res.json<PrMeta[]>().map((p) => [p.number, p]));

    expect(byNumber.get(multi.number)?.findings_breakdown).toEqual({
      critical: 2,
      warning: 2,
      suggestion: 2,
    });
    expect(byNumber.get(clean.number)?.findings_breakdown).toBeNull();
    expect(byNumber.get(unreviewed.number)?.findings_breakdown).toBeNull();

    await app.close();
  });
});
