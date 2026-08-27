import { describe, it, expect, vi } from 'vitest';
import { BlastService } from './service.js';
import type { BlastRepository, PriorPrRow } from './repository.js';
import type { BlastRadiusResult, BlastRadiusSource } from './types.js';

/**
 * Unit-tests `BlastService.getBlast` → `mapBlastResult` on a stub
 * `BlastRadiusSource` (not a real `RepoIntelService`) — mirrors
 * `repo-intel/service.test.ts`'s style of stubbing only the methods actually
 * called.
 */

const WORKSPACE_ID = 'ws-1';
const PR_ID = 'pr-1';
const REPO_ID = 'repo-1';

function fakeRepo(opts: {
  resolved?: { id: string; repoId: string } | undefined;
  files?: string[];
  priorPrs?: PriorPrRow[];
}) {
  return {
    resolvePr: vi.fn(async () => opts.resolved),
    getChangedFiles: vi.fn(async () => opts.files ?? []),
    findPriorPrs: vi.fn(async () => opts.priorPrs ?? []),
  } as unknown as BlastRepository;
}

function fakeRepoIntel(result: BlastRadiusResult): BlastRadiusSource {
  return { getBlastRadius: vi.fn(async () => result) };
}

describe('BlastService.getBlast', () => {
  it('returns undefined when the PR does not resolve in the caller workspace (missing or foreign)', async () => {
    const repo = fakeRepo({ resolved: undefined });
    const repoIntel = fakeRepoIntel({ changedSymbols: [], callers: [], impactedEndpoints: [] });
    const service = new BlastService(repo, repoIntel);

    const result = await service.getBlast(WORKSPACE_ID, PR_ID);

    expect(result).toBeUndefined();
    expect(repoIntel.getBlastRadius).not.toHaveBeenCalled();
  });

  it('groups callers by viaSymbol, attributes endpoints/crons per symbol, and marks callers_truncated (status: ok)', async () => {
    const repo = fakeRepo({ resolved: { id: PR_ID, repoId: REPO_ID }, files: ['src/a.ts'] });
    const result: BlastRadiusResult = {
      changedSymbols: [
        { file: 'src/a.ts', name: 'foo', kind: 'function' },
        { file: 'src/a.ts', name: 'bar', kind: 'function' },
      ],
      callers: [
        { file: 'src/routes/foo.ts', symbol: 'handleFoo', viaSymbol: 'foo', line: 10, rank: 5 },
        { file: 'src/jobs/cron.ts', symbol: 'runCron', viaSymbol: 'foo', line: 20, rank: 3 },
        { file: 'src/services/bar-svc.ts', symbol: 'callBar', viaSymbol: 'bar', line: 30, rank: 1 },
      ],
      impactedEndpoints: ['GET /foo'],
      factsByFile: {
        'src/routes/foo.ts': { endpoints: ['GET /foo'], crons: [] },
        'src/jobs/cron.ts': { endpoints: [], crons: ['nightly-sync'] },
        'src/services/bar-svc.ts': { endpoints: [], crons: [] },
      },
      truncatedSymbols: ['foo'],
    };
    const repoIntel = fakeRepoIntel(result);
    const service = new BlastService(repo, repoIntel);

    const response = await service.getBlast(WORKSPACE_ID, PR_ID);

    expect(response).toBeDefined();
    expect(response!.status).toBe('ok');
    expect(response!.reason).toBeNull();
    expect(repoIntel.getBlastRadius).toHaveBeenCalledWith(REPO_ID, ['src/a.ts']);

    const downstream = response!.blast!.downstream;
    expect(downstream).toHaveLength(2);

    const fooImpact = downstream.find((d) => d.symbol === 'foo')!;
    expect(fooImpact.callers).toEqual([
      { name: 'handleFoo', file: 'src/routes/foo.ts', line: 10 },
      { name: 'runCron', file: 'src/jobs/cron.ts', line: 20 },
    ]);
    expect(fooImpact.endpoints_affected).toEqual(['GET /foo']);
    expect(fooImpact.crons_affected).toEqual(['nightly-sync']);
    expect(fooImpact.callers_truncated).toBe(true);

    const barImpact = downstream.find((d) => d.symbol === 'bar')!;
    expect(barImpact.callers).toEqual([{ name: 'callBar', file: 'src/services/bar-svc.ts', line: 30 }]);
    expect(barImpact.endpoints_affected).toEqual([]);
    expect(barImpact.crons_affected).toEqual([]);
    expect(barImpact.callers_truncated).toBe(false);

    expect(response!.counts).toEqual({ symbols: 2, callers: 3, endpoints: 1, crons: 1 });
  });

  it('attributes a hop-2 endpoint to the changed symbol whose hop-1 caller was found through (HIGH-1)', async () => {
    const repo = fakeRepo({ resolved: { id: PR_ID, repoId: REPO_ID }, files: ['src/core.ts'] });
    const result: BlastRadiusResult = {
      changedSymbols: [{ file: 'src/core.ts', name: 'coreFn', kind: 'function' }],
      // hop-1: src/service.ts calls coreFn directly.
      callers: [{ file: 'src/service.ts', symbol: 'doWork', viaSymbol: 'coreFn', line: 5, rank: 10 }],
      // hop-2: src/routes/route.ts imports src/service.ts, but never calls
      // coreFn directly — its endpoint is only reachable via the hop-2 walk.
      impactedEndpoints: ['GET /widgets'],
      factsByFile: {
        'src/service.ts': { endpoints: [], crons: [] },
        'src/routes/route.ts': { endpoints: ['GET /widgets'], crons: [] },
      },
      hop2ByHop1: { 'src/service.ts': ['src/routes/route.ts'] },
    };
    const repoIntel = fakeRepoIntel(result);
    const service = new BlastService(repo, repoIntel);

    const response = await service.getBlast(WORKSPACE_ID, PR_ID);

    expect(response!.status).toBe('ok');
    const coreFnImpact = response!.blast!.downstream.find((d) => d.symbol === 'coreFn')!;
    expect(coreFnImpact.endpoints_affected).toEqual(['GET /widgets']);
    expect(response!.counts.endpoints).toBe(1);
  });

  it('status: partial when a reverse-import hop was width-capped — blast still populated', async () => {
    const repo = fakeRepo({ resolved: { id: PR_ID, repoId: REPO_ID }, files: ['src/a.ts'] });
    const result: BlastRadiusResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/routes/foo.ts', symbol: 'handleFoo', viaSymbol: 'foo', line: 1, rank: 1 }],
      impactedEndpoints: ['GET /foo'],
      factsByFile: { 'src/routes/foo.ts': { endpoints: ['GET /foo'], crons: [] } },
      hopCapped: true,
    };
    const repoIntel = fakeRepoIntel(result);
    const service = new BlastService(repo, repoIntel);

    const response = await service.getBlast(WORKSPACE_ID, PR_ID);

    expect(response!.status).toBe('partial');
    expect(response!.reason).toMatch(/200 files/);
    expect(response!.blast).not.toBeNull();
    expect(response!.blast!.downstream).toHaveLength(1);
  });

  it('status: partial (not degraded) when the hop-2 request failed — hop-1 data still returned (MEDIUM-7)', async () => {
    const repo = fakeRepo({ resolved: { id: PR_ID, repoId: REPO_ID }, files: ['src/a.ts'] });
    const result: BlastRadiusResult = {
      changedSymbols: [{ file: 'src/a.ts', name: 'foo', kind: 'function' }],
      callers: [{ file: 'src/routes/foo.ts', symbol: 'handleFoo', viaSymbol: 'foo', line: 1, rank: 1 }],
      impactedEndpoints: ['GET /foo'],
      factsByFile: { 'src/routes/foo.ts': { endpoints: ['GET /foo'], crons: [] } },
      hop2Failed: true,
    };
    const repoIntel = fakeRepoIntel(result);
    const service = new BlastService(repo, repoIntel);

    const response = await service.getBlast(WORKSPACE_ID, PR_ID);

    expect(response!.status).toBe('partial');
    expect(response!.reason).toMatch(/second-hop/);
    expect(response!.blast).not.toBeNull();
    expect(response!.blast!.downstream).toHaveLength(1);
    expect(response!.blast!.downstream[0]!.endpoints_affected).toEqual(['GET /foo']);
  });

  it('status: degraded when repo-intel has no usable index — blast: null, non-null reason, zero counts, prior_prs still populated', async () => {
    const priorPrs: PriorPrRow[] = [
      { number: 42, title: 'Refactor rate limiting', updatedAt: new Date('2026-01-01T00:00:00Z'), overlapCount: 2 },
    ];
    const repo = fakeRepo({ resolved: { id: PR_ID, repoId: REPO_ID }, files: ['src/a.ts'], priorPrs });
    const result: BlastRadiusResult = {
      changedSymbols: [],
      callers: [],
      impactedEndpoints: [],
      degraded: true,
      reason: 'no_data',
    };
    const repoIntel = fakeRepoIntel(result);
    const service = new BlastService(repo, repoIntel);

    const response = await service.getBlast(WORKSPACE_ID, PR_ID);

    expect(response!.status).toBe('degraded');
    expect(response!.blast).toBeNull();
    expect(response!.reason).toBeTruthy();
    expect(response!.counts).toEqual({ symbols: 0, callers: 0, endpoints: 0, crons: 0 });
    expect(response!.prior_prs).toEqual([
      { number: 42, title: 'Refactor rate limiting', updated_at: '2026-01-01T00:00:00.000Z', overlap_count: 2 },
    ]);
  });

  it('maps prior_prs with a null updated_at, and calls findPriorPrs with an empty changed-files list unchanged', async () => {
    const priorPrs: PriorPrRow[] = [{ number: 7, title: 'Old PR', updatedAt: null, overlapCount: 1 }];
    const repo = fakeRepo({ resolved: { id: PR_ID, repoId: REPO_ID }, files: [], priorPrs });
    const result: BlastRadiusResult = { changedSymbols: [], callers: [], impactedEndpoints: [] };
    const repoIntel = fakeRepoIntel(result);
    const service = new BlastService(repo, repoIntel);

    const response = await service.getBlast(WORKSPACE_ID, PR_ID);

    expect(repo.findPriorPrs).toHaveBeenCalledWith(REPO_ID, PR_ID, []);
    expect(response!.prior_prs).toEqual([{ number: 7, title: 'Old PR', updated_at: null, overlap_count: 1 }]);
  });
});
