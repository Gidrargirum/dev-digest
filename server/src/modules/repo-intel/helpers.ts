/**
 * Pure helpers for the repo-intel facade. NO I/O — every function here takes
 * already-fetched rows (from `repository.getRankedPaths`) and returns a plain
 * value, so it is directly unit-testable without Postgres or a clone on disk.
 */

// ---------------------------------------------------------------- junk paths

/**
 * Path kinds excluded from rank-driven file samples (conventions/onboarding):
 * tests, configs, declaration files, migrations, generated dirs. Substring
 * match on the repo-relative path (kept deliberately simple + deterministic).
 */
export const JUNK_PATH_PATTERNS = [
  '.test.',
  '.spec.',
  '.d.ts',
  '__tests__/',
  '__mocks__/',
  '/test/',
  '/tests/',
  '/migrations/',
  '/__fixtures__/',
  '.config.',
  'vitest.',
  'jest.',
  'eslint',
  'prettier',
] as const;

export function isJunkPath(path: string): boolean {
  const lower = path.toLowerCase();
  return JUNK_PATH_PATTERNS.some((p) => lower.includes(p));
}

// ---------------------------------------------------------------- strata

/**
 * Coarse role a file plays in the codebase, inferred from its path. Used to
 * spread a rank-driven file sample across the actual shapes of the codebase
 * (route handlers, services, repositories, React components, hooks) instead
 * of collapsing onto whatever the top of the PageRank happens to favour
 * (schema files, constants, shared styling — see plan "Крок 0").
 */
export type FileStratum = 'routes' | 'service' | 'repository' | 'component' | 'hook' | 'other';

/**
 * Classify a single repo-relative path into a stratum. Order matters: more
 * specific role file names are checked before the generic component/hook
 * fallbacks, so e.g. `modules/x/routes.ts` never falls through to `other`.
 */
export function stratumFor(path: string): FileStratum {
  const lower = path.toLowerCase();
  const base = lower.split('/').pop() ?? lower;

  // Fastify module convention (server/AGENTS.md): modules/<name>/routes.ts.
  // Next.js App Router convention (client): app/**/route.ts.
  if (base === 'routes.ts' || base === 'route.ts' || base === 'routes.tsx') return 'routes';
  if (base === 'service.ts' || base === 'service.tsx') return 'service';
  if (base === 'repository.ts') return 'repository';

  // Client hooks: lib/hooks/*, or any use-prefixed file (`useThing.ts` /
  // `use-thing.ts`), matching the project's hook-naming convention.
  if (lower.includes('/hooks/') || /(^|\/)use[-a-z0-9]*\.tsx?$/.test(lower)) return 'hook';

  // React components: fixed folder layout is `Name/Name.tsx` (client/AGENTS.md).
  if (lower.endsWith('.tsx')) return 'component';

  return 'other';
}

interface RankedRow {
  path: string;
  rank: number;
}

/**
 * Stratified sample of `n` paths from `rows` (already the top-K by rank —
 * see `repository.getRankedPaths`): group by `stratumFor`, sort each stratum
 * by rank DESC, then round-robin across strata (highest-rank-first within
 * each) until `n` files are collected or every stratum is exhausted.
 *
 * Round-robin (rather than a fixed per-stratum quota) means a stratum with
 * few files never starves the sample below `n`, while a stratum that
 * dominates the repo still cannot crowd out the others in the first pass —
 * each stratum contributes one file per round.
 *
 * `isJunkPath` and `exclude` are applied BEFORE grouping, so junk paths are
 * filtered exactly as they were for the flat top-N (`getTopFilesByRank`) —
 * stratification changes selection order, not the junk gate.
 */
export function stratifiedSample(
  rows: readonly RankedRow[],
  n: number,
  opts?: { exclude?: string[] },
): string[] {
  if (n <= 0) return [];
  const exclude = opts?.exclude ?? [];

  const filtered = rows.filter(
    (r) => !isJunkPath(r.path) && !exclude.some((e) => r.path.includes(e)),
  );

  const byStratum = new Map<FileStratum, RankedRow[]>();
  for (const r of filtered) {
    const s = stratumFor(r.path);
    const arr = byStratum.get(s);
    if (arr) arr.push(r);
    else byStratum.set(s, [r]);
  }
  for (const arr of byStratum.values()) arr.sort((a, b) => b.rank - a.rank);

  const strata = [...byStratum.keys()];
  const cursor = new Map<FileStratum, number>(strata.map((s) => [s, 0]));

  const out: string[] = [];
  let progressed = true;
  while (out.length < n && progressed) {
    progressed = false;
    for (const s of strata) {
      if (out.length >= n) break;
      const arr = byStratum.get(s) as RankedRow[];
      const i = cursor.get(s) as number;
      const row = arr[i];
      if (row) {
        out.push(row.path);
        cursor.set(s, i + 1);
        progressed = true;
      }
    }
  }
  return out;
}
