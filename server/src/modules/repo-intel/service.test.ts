import { describe, it, expect, vi } from 'vitest';
import { RepoIntelService } from './service.js';
import { MAX_CALLERS_PER_SYMBOL, MAX_HOP_WIDTH } from './constants.js';
import type { RepoIntelDeps } from './types.js';
import type {
  FullSymbolRow,
  IndexerEdgeRow,
  IndexerFileFactsRow,
  RepoIntelRepository,
  ResolvedCallerRow,
} from './repository.js';

/**
 * `getBlastRadius` → `tryPersistentBlast` (T3 persistent path):
 * - the per-symbol caller cap (bug fix: MAX_CALLERS_PER_SYMBOL applies per
 *   `viaSymbol`, not once over the combined callers array — see
 *   specs/blast-radius.md "Per-symbol caller cap (bug fix)");
 * - the depth-2 reverse-import walk for endpoint discovery ("Depth-2 endpoint
 *   discovery"), including its width cap and its degrade-not-throw contract
 *   when `getImportersOf` fails.
 *
 * Only the methods `tryPersistentBlast` actually calls are stubbed; the rest
 * of `RepoIntelRepository` is cast away since this is an application-ring
 * unit test, not a repository test.
 */

const REPO_ID = 'repo-1';

interface FakeRepoOpts {
  declRows: FullSymbolRow[];
  callerRows: ResolvedCallerRow[];
  callerSymRows: FullSymbolRow[];
  importerRows?: IndexerEdgeRow[] | (() => IndexerEdgeRow[]);
  fileFacts?: IndexerFileFactsRow[];
  fileRanks?: Array<{ path: string; percentile: number }>;
}

function fakeRepo(opts: FakeRepoOpts) {
  const getSymbolRows = vi.fn(async (_repoId: string, paths: string[]): Promise<FullSymbolRow[]> => {
    const pathSet = new Set(paths);
    // Route to decl rows or caller rows depending on which set of paths is
    // being asked about — mirrors the two distinct calls tryPersistentBlast
    // makes (changed files, then caller files).
    const fromDecl = opts.declRows.filter((r) => pathSet.has(r.path));
    if (fromDecl.length > 0) return fromDecl;
    return opts.callerSymRows.filter((r) => pathSet.has(r.path));
  });

  const getImportersOf = vi.fn(async (): Promise<IndexerEdgeRow[]> => {
    if (typeof opts.importerRows === 'function') return opts.importerRows();
    return opts.importerRows ?? [];
  });

  const getFileFacts = vi.fn(async (): Promise<IndexerFileFactsRow[]> => opts.fileFacts ?? []);

  const getFileRankFor = vi.fn(async (_repoId: string, paths: string[]) => {
    const ranks = opts.fileRanks ?? [];
    const byPath = new Map(ranks.map((r) => [r.path, r.percentile]));
    return paths
      .filter((p) => byPath.has(p))
      .map((p) => ({ path: p, percentile: byPath.get(p)! }));
  });

  const repo = {
    tryGetIndexState: vi.fn(async () => ({
      repoId: REPO_ID,
      status: 'full' as const,
      filesIndexed: 10,
      filesSkipped: 0,
      durationMs: 1,
      lastIndexedSha: 'abc',
      indexerVersion: 2,
      updatedAt: new Date(),
    })),
    getSymbolRows,
    getResolvedCallers: vi.fn(async () => opts.callerRows),
    getImportersOf,
    getFileFacts,
    getFileRankFor,
  };

  return repo as unknown as RepoIntelRepository;
}

function makeService(repo: RepoIntelRepository): RepoIntelService {
  const deps = { config: { repoIntelEnabled: true } } as unknown as RepoIntelDeps;
  return new RepoIntelService(deps, repo);
}

describe('getBlastRadius — per-symbol caller cap', () => {
  it('caps callers to MAX_CALLERS_PER_SYMBOL PER changed symbol, not once over the combined list', async () => {
    const declRows: FullSymbolRow[] = [
      { path: 'src/foo.ts', name: 'foo', kind: 'function', line: 1, endLine: 5, exported: true, signature: null },
      { path: 'src/foo.ts', name: 'bar', kind: 'function', line: 10, endLine: 15, exported: true, signature: null },
    ];

    const callerRows: ResolvedCallerRow[] = [];
    const callerSymRows: FullSymbolRow[] = [];
    for (const sym of ['foo', 'bar']) {
      for (let i = 0; i < 25; i += 1) {
        const file = `src/callers/${sym}-caller-${i}.ts`;
        callerRows.push({ fromPath: file, toSymbol: sym, line: 1, rank: 25 - i });
        callerSymRows.push({
          path: file,
          name: `handler_${sym}_${i}`,
          kind: 'function',
          line: 0,
          endLine: 2,
          exported: true,
          signature: null,
        });
      }
    }

    const repo = fakeRepo({ declRows, callerRows, callerSymRows });
    const service = makeService(repo);

    const result = await service.getBlastRadius(REPO_ID, ['src/foo.ts']);

    expect(result.degraded).toBe(false);
    expect(result.callers).toHaveLength(2 * MAX_CALLERS_PER_SYMBOL);
    const fooCallers = result.callers.filter((c) => c.viaSymbol === 'foo');
    const barCallers = result.callers.filter((c) => c.viaSymbol === 'bar');
    expect(fooCallers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    expect(barCallers).toHaveLength(MAX_CALLERS_PER_SYMBOL);
    // Highest-rank callers survive the cap (rank 25..6 for the top 20 of 25..1).
    expect(fooCallers.every((c) => c.rank >= 6)).toBe(true);
    expect(barCallers.every((c) => c.rank >= 6)).toBe(true);
    expect(result.truncatedSymbols).toEqual(expect.arrayContaining(['foo', 'bar']));
    expect(result.truncatedSymbols).toHaveLength(2);
  });
});

describe('getBlastRadius — depth-2 endpoint discovery', () => {
  it('attributes an endpoint found only in a hop-2 importer file (route -> service -> changed symbol)', async () => {
    const declRows: FullSymbolRow[] = [
      { path: 'src/core.ts', name: 'coreFn', kind: 'function', line: 1, endLine: 5, exported: true, signature: null },
    ];
    const callerRows: ResolvedCallerRow[] = [
      { fromPath: 'src/service.ts', toSymbol: 'coreFn', line: 5, rank: 10 },
    ];
    const callerSymRows: FullSymbolRow[] = [
      { path: 'src/service.ts', name: 'doWork', kind: 'function', line: 0, endLine: 8, exported: true, signature: null },
    ];
    const importerRows: IndexerEdgeRow[] = [
      { fromFile: 'src/routes/route.ts', toFile: 'src/service.ts' },
    ];
    const fileFacts: IndexerFileFactsRow[] = [
      { filePath: 'src/service.ts', endpoints: [], crons: [] },
      { filePath: 'src/routes/route.ts', endpoints: ['GET /widgets'], crons: [] },
    ];

    const repo = fakeRepo({ declRows, callerRows, callerSymRows, importerRows, fileFacts });
    const service = makeService(repo);

    const result = await service.getBlastRadius(REPO_ID, ['src/core.ts']);

    expect(result.degraded).toBe(false);
    expect(result.impactedEndpoints).toContain('GET /widgets');
    expect(result.factsByFile?.['src/routes/route.ts']?.endpoints).toContain('GET /widgets');
    expect(result.hopCapped).toBeUndefined();
    // hop2ByHop1 ties the hop-2 file back to the hop-1 file it was found
    // through, so `blast/helpers.ts` can attribute it to the right symbol.
    expect(result.hop2ByHop1?.['src/service.ts']).toEqual(['src/routes/route.ts']);
  });

  it('does NOT degrade when the reverse-import hop fails — keeps hop-1 data, flags hop2Failed', async () => {
    const declRows: FullSymbolRow[] = [
      { path: 'src/core.ts', name: 'coreFn', kind: 'function', line: 1, endLine: 5, exported: true, signature: null },
    ];
    const callerRows: ResolvedCallerRow[] = [
      { fromPath: 'src/service.ts', toSymbol: 'coreFn', line: 5, rank: 10 },
    ];
    const callerSymRows: FullSymbolRow[] = [
      { path: 'src/service.ts', name: 'doWork', kind: 'function', line: 0, endLine: 8, exported: true, signature: null },
    ];

    const repo = fakeRepo({
      declRows,
      callerRows,
      callerSymRows,
      importerRows: () => {
        throw new Error('boom');
      },
    });
    const service = makeService(repo);

    const result = await service.getBlastRadius(REPO_ID, ['src/core.ts']);

    // A failed hop-2 request must NOT flip `degraded` — that would erase the
    // hop-1 data already resolved above and make `mapBlastResult` return
    // `blast: null`, throwing away perfectly good callers/changedSymbols.
    expect(result.degraded).toBe(false);
    expect(result.hop2Failed).toBe(true);
    expect(result.reason).toBeUndefined();
    // Hop-1 data survives the hop-2 failure.
    expect(result.callers).toHaveLength(1);
    expect(result.changedSymbols).toHaveLength(1);
  });

  it('caps a hop exceeding MAX_HOP_WIDTH importer files and flags hopCapped', async () => {
    const declRows: FullSymbolRow[] = [
      { path: 'src/core.ts', name: 'coreFn', kind: 'function', line: 1, endLine: 5, exported: true, signature: null },
    ];
    const callerRows: ResolvedCallerRow[] = [
      { fromPath: 'src/service.ts', toSymbol: 'coreFn', line: 5, rank: 10 },
    ];
    const callerSymRows: FullSymbolRow[] = [
      { path: 'src/service.ts', name: 'doWork', kind: 'function', line: 0, endLine: 8, exported: true, signature: null },
    ];

    const wideImporterCount = MAX_HOP_WIDTH + 50;
    const importerRows: IndexerEdgeRow[] = Array.from({ length: wideImporterCount }, (_, i) => ({
      fromFile: `src/hub/importer-${i}.ts`,
      toFile: 'src/service.ts',
    }));
    const fileRanks = importerRows.map((r, i) => ({ path: r.fromFile, percentile: wideImporterCount - i }));

    const repo = fakeRepo({ declRows, callerRows, callerSymRows, importerRows, fileRanks });
    const service = makeService(repo);

    const result = await service.getBlastRadius(REPO_ID, ['src/core.ts']);

    expect(result.degraded).toBe(false);
    expect(result.hopCapped).toBe(true);
  });
});
