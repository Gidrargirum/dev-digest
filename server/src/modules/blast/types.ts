/**
 * Local mirror of the slice of `repo-intel`'s `BlastResult` (and the facade
 * method that returns it) this module actually consumes.
 *
 * `modules/blast/` may not import `modules/repo-intel/repository.ts` or
 * `service.ts` directly (`.dependency-cruiser.cjs`'s `no-cross-module-imports`
 * — modules are siblings, not a hierarchy). Importing `repo-intel/types.ts`
 * for the `RepoIntel`/`BlastResult` *types* alone still trips that rule (it
 * has no type-only exception), so this module declares the shape it needs
 * itself instead — the "the inner ring declares its own port" half of
 * inversion (`onion-architecture` skill, rule 2). `container.repoIntel`
 * (typed `RepoIntel` in `repo-intel/types.ts`) satisfies `BlastRadiusSource`
 * structurally; the composition root (`platform/container.ts`) is the only
 * place that ever names both types.
 */
import type { PrBlastResponse } from '@devdigest/shared';

export type BlastDegradedReason =
  | 'flag_off'
  | 'index_failed'
  | 'index_partial'
  | 'repo_too_large'
  | 'no_data';

export interface BlastRadiusChangedSymbol {
  file: string;
  name: string;
  kind: string;
}

export interface BlastRadiusCaller {
  file: string;
  symbol: string;
  /** Which changed symbol this caller reaches. */
  viaSymbol: string;
  line: number;
  rank: number;
}

/**
 * MANUAL STRUCTURAL COPY of `BlastResult` (and `BlastRadiusSource` of
 * `RepoIntel['getBlastRadius']`) from `../repo-intel/types.ts` — read that
 * file's doc comment above for WHY (the cross-module import ban). The
 * compiler catches a STRUCTURAL drift here for free: delete or narrow a
 * field on either side and `container.repoIntel` (typed `RepoIntel`) stops
 * satisfying `BlastRadiusSource` at the one place that assigns it
 * (`platform/container.ts`'s `get blast()`), which fails `pnpm typecheck`.
 *
 * The compiler CANNOT catch a SEMANTIC drift: if `repo-intel/types.ts`
 * renames a field while keeping the same name/type shape elsewhere (or two
 * fields swap meaning while keeping identical types), nothing here breaks at
 * build time — `mapBlastResult` (`blast/helpers.ts`) will just silently read
 * the wrong data. There is no runtime check for this by design (TS already
 * proves structural assignability at the one call site above; a duplicate
 * test would just re-assert what the compiler already guarantees). When you
 * change `repo-intel/types.ts`'s `BlastResult`, `BlastCallerRow`,
 * `BlastChangedSymbol`, or `DegradedReason`, re-read this file by hand and
 * update it to match — don't rely on tsc alone to catch a rename.
 */
export interface BlastRadiusResult {
  changedSymbols: BlastRadiusChangedSymbol[];
  callers: BlastRadiusCaller[];
  impactedEndpoints: string[];
  factsByFile?: Record<string, { endpoints: string[]; crons: string[] }>;
  degraded?: boolean;
  reason?: BlastDegradedReason;
  /** Symbols whose caller list was truncated to MAX_CALLERS_PER_SYMBOL. */
  truncatedSymbols?: string[];
  /** True when a reverse-import hop hit the 200-file width cap. */
  hopCapped?: boolean;
  /** The width cap that was applied when `hopCapped` is true. */
  hopWidthLimit?: number;
  /** True when the hop-2 reverse-import request itself failed (not a cap). */
  hop2Failed?: boolean;
  /** Hop-1 caller file -> hop-2 files that import it. See repo-intel/types.ts. */
  hop2ByHop1?: Record<string, string[]>;
}

/**
 * MANUAL STRUCTURAL COPY warning: see the doc comment on `BlastRadiusResult`
 * above — the same caveat applies here (structural drift caught by tsc at
 * `platform/container.ts`; semantic rename drift is not).
 */
export interface BlastRadiusSource {
  getBlastRadius(repoId: string, changedFiles: string[]): Promise<BlastRadiusResult>;
}

/**
 * Public port for `BlastService` — lets `ContainerOverrides.blast` (and any
 * other consumer) depend on the interface instead of naming the concrete
 * class with its private fields. Mirrors `IntentPort` next to it in
 * `platform/container.ts`. Keep in sync with `BlastService.getBlast`'s real
 * signature.
 */
export interface BlastPort {
  getBlast(workspaceId: string, prId: string): Promise<PrBlastResponse | undefined>;
}
