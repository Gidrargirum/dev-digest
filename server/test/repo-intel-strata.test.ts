import { describe, it, expect } from 'vitest';
import { stratifiedSample, stratumFor, isJunkPath } from '../src/modules/repo-intel/helpers.js';
import { RepoIntelService } from '../src/modules/repo-intel/service.js';

/**
 * Plan "Крок 5" — stratified sampling replaces the flat top-12 that on this
 * repo's 312 indexed files collapsed onto 3 directories and never sampled a
 * route handler, service, repository, or component (see
 * plans/conventions-extractor-v2.md "Крок 0").
 *
 * `stratifiedSample` is pure code over already-fetched rank rows — no
 * Postgres, no clone, no model call.
 */

/** Build ~100 ranked paths spread across 5 directories / roles, rank DESC. */
function buildRankedPaths(): Array<{ path: string; rank: number }> {
  const rows: Array<{ path: string; rank: number }> = [];
  let rank = 1000;

  // routes — server modules
  for (let i = 0; i < 20; i += 1) {
    rows.push({ path: `server/src/modules/mod${i}/routes.ts`, rank: rank -= 1 });
  }
  // service — server modules
  for (let i = 0; i < 20; i += 1) {
    rows.push({ path: `server/src/modules/mod${i}/service.ts`, rank: rank -= 1 });
  }
  // repository — server modules
  for (let i = 0; i < 20; i += 1) {
    rows.push({ path: `server/src/modules/mod${i}/repository.ts`, rank: rank -= 1 });
  }
  // component — client components
  for (let i = 0; i < 20; i += 1) {
    rows.push({ path: `client/src/components/Thing${i}/Thing${i}.tsx`, rank: rank -= 1 });
  }
  // hook — client hooks
  for (let i = 0; i < 20; i += 1) {
    rows.push({ path: `client/src/lib/hooks/useThing${i}.ts`, rank: rank -= 1 });
  }

  return rows;
}

describe('stratumFor', () => {
  it('classifies role files by their conventional path/name', () => {
    expect(stratumFor('server/src/modules/repos/routes.ts')).toBe('routes');
    expect(stratumFor('server/src/modules/repos/service.ts')).toBe('service');
    expect(stratumFor('server/src/modules/repos/repository.ts')).toBe('repository');
    expect(stratumFor('client/src/lib/hooks/useAgents.ts')).toBe('hook');
    expect(stratumFor('client/src/components/Card/Card.tsx')).toBe('component');
    expect(stratumFor('server/src/db/schema/knowledge.ts')).toBe('other');
    expect(stratumFor('client/src/lib/constants.ts')).toBe('other');
  });
});

describe('stratifiedSample', () => {
  it('spreads the sample across all represented strata at n=24 over ~100 paths in 5 directories', () => {
    const rows = buildRankedPaths();
    expect(rows).toHaveLength(100);

    const sample = stratifiedSample(rows, 24);
    expect(sample).toHaveLength(24);

    const strata = new Set(sample.map(stratumFor));
    expect(strata).toEqual(new Set(['routes', 'service', 'repository', 'component', 'hook']));

    // no duplicates
    expect(new Set(sample).size).toBe(sample.length);
  });

  it('does not bypass the junk-path filter (tests/configs/migrations excluded)', () => {
    const rows: Array<{ path: string; rank: number }> = [
      { path: 'server/src/modules/x/routes.ts', rank: 10 },
      { path: 'server/src/modules/x/routes.test.ts', rank: 9 },
      { path: 'server/src/modules/x/service.ts', rank: 8 },
      { path: 'server/migrations/0001_init.sql', rank: 7 },
      { path: 'client/src/components/Card/Card.tsx', rank: 6 },
      { path: 'vitest.config.ts', rank: 5 },
    ];
    // sanity: the junk gate itself flags exactly the entries we expect
    expect(rows.filter((r) => isJunkPath(r.path)).map((r) => r.path)).toEqual([
      'server/src/modules/x/routes.test.ts',
      'server/migrations/0001_init.sql',
      'vitest.config.ts',
    ]);

    const sample = stratifiedSample(rows, 10);
    expect(sample).not.toContain('server/src/modules/x/routes.test.ts');
    expect(sample).not.toContain('server/migrations/0001_init.sql');
    expect(sample).not.toContain('vitest.config.ts');
    expect(sample).toEqual([
      'server/src/modules/x/routes.ts',
      'server/src/modules/x/service.ts',
      'client/src/components/Card/Card.tsx',
    ]);
  });

  it('n <= 0 → []', () => {
    const rows = buildRankedPaths();
    expect(stratifiedSample(rows, 0)).toEqual([]);
    expect(stratifiedSample(rows, -1)).toEqual([]);
  });

  it('empty rows → []', () => {
    expect(stratifiedSample([], 24)).toEqual([]);
  });
});

describe('RepoIntelService.getConventionSamples — degraded contract', () => {
  it('repoIntelEnabled=false → [] without touching the repository', async () => {
    let called = false;
    const deps = { config: { repoIntelEnabled: false } } as never;
    const repo = {
      getRankedPaths: async () => {
        called = true;
        return [];
      },
    } as never;
    const svc = new RepoIntelService(deps, repo);

    await expect(svc.getConventionSamples('r1', 24)).resolves.toEqual([]);
    expect(called).toBe(false);
  });

  it('n <= 0 → [] without touching the repository', async () => {
    let called = false;
    const deps = { config: { repoIntelEnabled: true } } as never;
    const repo = {
      getRankedPaths: async () => {
        called = true;
        return [];
      },
    } as never;
    const svc = new RepoIntelService(deps, repo);

    await expect(svc.getConventionSamples('r1', 0)).resolves.toEqual([]);
    expect(called).toBe(false);
  });
});
