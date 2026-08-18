import type { GitHubClient, LLMProvider, Provider, RepoRef, PrIntentRecord } from '@devdigest/shared';

/**
 * What IntentService needs from the outside world — stated as ports, not as
 * the container.
 *
 * `container.ts` CONSTRUCTS IntentService (see `container.intent`), so taking
 * `Container` here would close a cycle (container → service → container),
 * exactly the failure mode `RepoIntelDeps` documents (repo-intel/types.ts).
 * Listing the ports instead keeps the dependency direction inward-only and
 * makes the dependencies visible in the signature.
 */
export interface IntentDeps {
  /** Resolves the GitHub client (throws when no token is configured). */
  readonly github: () => Promise<GitHubClient>;
  /** Resolves an LLM provider by id (cached by the container). */
  readonly llm: (provider: Provider) => Promise<LLMProvider>;
  /**
   * The workspace's `review_intent` model override, or `undefined` when unset
   * (decision #4 — this feature has no static default of its own; the caller
   * supplies `fallbackModel` for that case). Built by `container.ts` from
   * `modules/settings/feature-models.ts` — kept out of `IntentDeps`' own
   * module so `modules/reviews/run-executor.ts` never has to cross-import
   * `modules/settings` (`.dependency-cruiser.cjs`'s `no-cross-module-imports`).
   */
  readonly featureModelOverride: (
    workspaceId: string,
  ) => Promise<{ provider: Provider; model: string } | undefined>;
}

/** The subset of a PR row the intent step needs — not the whole `PullRow`,
 *  so this module never has to import `db/rows.ts`. */
export interface IntentPull {
  id: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

export interface ResolveForRunParams {
  workspaceId: string;
  pull: IntentPull;
  repoRef: RepoRef;
  /** Changed file paths — from the already-loaded diff, never a new GitHub call. */
  changedFiles: string[];
  /**
   * Used only when the workspace has no `review_intent` override (decision #4
   * — this feature has no static default of its own): the review agent's own
   * provider+model, so intent silently inherits whichever agent is about to
   * run rather than picking an unrelated model.
   */
  fallbackModel: { provider: Provider; model: string };
}

export interface IntentUsage {
  tokensIn: number;
  tokensOut: number;
  /** Null when the model's price is unknown (`estimateCost` returned null). */
  costUsd: number | null;
}

export interface ResolveForRunResult {
  record: PrIntentRecord;
  /** Rendered, ready-to-wrap text for the review prompt's `intent` slot. */
  text: string;
  cacheHit: boolean;
  /** The resolved provider+model — reported regardless of cache hit/miss, so
   *  the caller's trace always shows what would run/ran. */
  modelChoice: { provider: Provider; model: string };
  /** Present only when an LLM call actually happened (cache miss). */
  usage?: IntentUsage;
}

/** Cross-module access to IntentService goes through `container.intent`
 *  (the module boundary, `.dependency-cruiser.cjs`'s `no-cross-module-imports`). */
export interface IntentPort {
  resolveForRun(params: ResolveForRunParams): Promise<ResolveForRunResult>;
  /**
   * Workspace-scoped by the use case itself (a join in `IntentRepository`),
   * not by the caller — `routes.ts` used to enforce this by borrowing
   * `reviews`' repository to look up the PR first; that made the invariant
   * optional for any other future caller. `undefined` covers both "no
   * intent computed yet" and "this PR isn't in that workspace" identically.
   */
  get(workspaceId: string, prId: string): Promise<PrIntentRecord | undefined>;
}
