/**
 * `BlastRepository.findPriorPrs` against a real Postgres — "prior PRs
 * touching these files" (specs/blast-radius.md follow-up, now a top-level
 * `prior_prs` field of `PrBlastResponse`). Lives in `server/test/`, not
 * `modules/blast/`, per this feature's earlier precedent
 * (`blast.it.test.ts`) — `repository-owns-persistence` requires integration
 * tests that touch the DB to sit outside the module folder.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { BlastRepository } from '../src/modules/blast/repository.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

d('BlastRepository.findPriorPrs (Testcontainers pg)', () => {
  let pg: PgFixture;
  let repo: BlastRepository;
  let workspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    repo = new BlastRepository(pg.handle.db);
    const [ws] = await pg.handle.db.insert(t.workspaces).values({ name: 'prior-prs-ws' }).returning();
    workspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  async function makeRepo(name: string) {
    const [row] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId, owner: 'acme', name, fullName: `acme/${name}` })
      .returning();
    return row!;
  }

  async function makePr(
    repoId: string,
    number: number,
    title: string,
    updatedAt: Date | null,
    paths: string[],
  ) {
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number,
        title,
        author: 'marisa.koch',
        branch: `feat/pr-${number}`,
        base: 'main',
        headSha: `sha-${number}`,
        additions: 1,
        deletions: 0,
        filesCount: paths.length,
        status: 'needs_review',
        updatedAt: updatedAt ?? undefined,
      })
      .returning();
    if (paths.length > 0) {
      await pg.handle.db
        .insert(t.prFiles)
        .values(paths.map((path) => ({ prId: pr!.id, path, additions: 1, deletions: 0 })));
    }
    return pr!;
  }

  it('excludes the current PR, counts distinct overlapping paths, sorts by updated_at DESC, respects the limit, and excludes other repos', async () => {
    const repoA = await makeRepo('repo-a');
    const repoB = await makeRepo('repo-b');

    // The PR under test: touches two files.
    const currentPr = await makePr(repoA.id, 100, 'Current PR', new Date('2026-06-01'), [
      'src/a.ts',
      'src/b.ts',
    ]);

    // Overlaps on ONE path (src/a.ts), but the path is duplicated across two
    // rows in pr_files — overlap_count must count DISTINCT paths, i.e. 1, not 2.
    const prDup = await makePr(repoA.id, 101, 'Touches a.ts twice', new Date('2026-05-01'), [
      'src/a.ts',
    ]);
    await pg.handle.db.insert(t.prFiles).values({ prId: prDup.id, path: 'src/a.ts', additions: 1, deletions: 0 });

    // Overlaps on BOTH paths, most recently updated — should sort first.
    const prBoth = await makePr(repoA.id, 102, 'Touches both', new Date('2026-07-01'), [
      'src/a.ts',
      'src/b.ts',
    ]);

    // No overlap at all — must not appear.
    await makePr(repoA.id, 103, 'No overlap', new Date('2026-06-15'), ['src/unrelated.ts']);

    // Same paths, but in a DIFFERENT repo — must not appear.
    await makePr(repoB.id, 200, 'Other repo, same paths', new Date('2026-08-01'), [
      'src/a.ts',
      'src/b.ts',
    ]);

    // Six more overlapping PRs to exercise the LIMIT.
    for (let i = 0; i < 6; i++) {
      await makePr(repoA.id, 300 + i, `Filler ${i}`, new Date(`2026-04-0${i + 1}`), ['src/a.ts']);
    }

    const result = await repo.findPriorPrs(repoA.id, currentPr.id, ['src/a.ts', 'src/b.ts']);

    // Current PR excluded, limit respected (PRIOR_PRS_LIMIT = 5).
    expect(result).toHaveLength(5);
    expect(result.map((r) => r.number)).not.toContain(100);
    expect(result.map((r) => r.number)).not.toContain(200); // other repo
    expect(result.map((r) => r.number)).not.toContain(103); // no overlap

    // Most-recently-updated overlapping PR sorts first.
    expect(result[0]!.number).toBe(102);
    expect(result[0]!.overlapCount).toBe(2);

    // Distinct-path counting: prDup touches src/a.ts via two rows, but
    // overlap_count must still be 1.
    const dupRow = result.find((r) => r.number === 101);
    expect(dupRow?.overlapCount).toBe(1);

    // Sorted DESC by updated_at.
    const updatedTimestamps = result.map((r) => r.updatedAt!.getTime());
    expect(updatedTimestamps).toEqual([...updatedTimestamps].sort((a, b) => b - a));
  });

  it('returns [] without querying the DB when paths is empty', async () => {
    const repoA = await makeRepo('repo-empty-paths');
    const currentPr = await makePr(repoA.id, 999, 'Current', new Date(), ['src/x.ts']);

    const result = await repo.findPriorPrs(repoA.id, currentPr.id, []);

    expect(result).toEqual([]);
  });
});
