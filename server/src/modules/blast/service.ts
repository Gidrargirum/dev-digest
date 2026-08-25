import type { PrBlastResponse } from '@devdigest/shared';
import type { BlastPort, BlastRadiusSource } from './types.js';
import { BlastRepository } from './repository.js';
import { mapBlastResult } from './helpers.js';

/**
 * Blast Radius — a read-only impact map over the repo-intel index. No LLM
 * call anywhere in this module: every fact comes from
 * `repoIntel.getBlastRadius`, this service only resolves the PR, fetches its
 * changed files, and shapes the result into `PrBlastResponse`.
 *
 * Constructor takes ports (`BlastRepository`, `BlastRadiusSource`), never the
 * `Container` — mirrors `IntentService`/`RepoIntelService` (see
 * repo-intel/types.ts's `RepoIntelDeps` doc comment for why). `container.repoIntel`
 * satisfies `BlastRadiusSource` structurally; only `platform/container.ts`
 * (the composition root) ever passes it in.
 */
export class BlastService implements BlastPort {
  constructor(
    private readonly repo: BlastRepository,
    private readonly repoIntel: BlastRadiusSource,
  ) {}

  /**
   * Returns `undefined` when `prId` does not resolve to a PR in the caller's
   * workspace — either it does not exist, or it belongs to someone else's.
   * The route turns that into a 404; both causes are deliberately
   * indistinguishable here (see `BlastRepository.resolvePr`).
   */
  async getBlast(workspaceId: string, prId: string): Promise<PrBlastResponse | undefined> {
    const pr = await this.repo.resolvePr(workspaceId, prId);
    if (!pr) return undefined;

    const changedFiles = await this.repo.getChangedFiles(pr.id);
    const result = await this.repoIntel.getBlastRadius(pr.repoId, changedFiles);
    return mapBlastResult(result);
  }
}
