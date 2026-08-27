/**
 * Ports the Why + Risk Brief module declares for itself — stated as
 * interfaces, not as the `Container`.
 *
 * `platform/container.ts` CONSTRUCTS `BriefService` (see `container.brief`), so
 * accepting `Container` here would close a cycle (container → service →
 * container) — the same failure mode `IntentDeps` / `RepoIntelDeps` document.
 * Listing ports keeps the dependency direction inward-only.
 *
 * `.dependency-cruiser.cjs`'s `no-cross-module-imports` forbids importing
 * `modules/intent/*` or `modules/blast/*` — not even their types (the rule has
 * no type-only exception, see `modules/blast/types.ts`). So the slices of
 * intent / blast this module consumes are declared here as local structural
 * copies; the composition root wires `container.intent.get` into `deps.intent`.
 */
import type {
  GitHubClient,
  LLMProvider,
  Provider,
  FeatureModelChoice,
  PrIntentRecord,
  PrWhyRiskBrief,
} from '@devdigest/shared';

export interface BriefDeps {
  /** Resolves the GitHub client (throws when no token is configured). */
  readonly github: () => Promise<GitHubClient>;
  /** Resolves an LLM provider by id (cached by the container). */
  readonly llm: (provider: Provider) => Promise<LLMProvider>;
  /** The workspace's resolved `risk_brief` model (override, else the registry
   *  default) — `undefined` only when neither exists. Built by the container
   *  from `modules/settings/feature-models.ts`, kept out of this module so
   *  `modules/brief` never cross-imports `modules/settings`. */
  readonly featureModel: (workspaceId: string) => Promise<FeatureModelChoice | undefined>;
  /** Optional structured logger for best-effort failure logging (AC-2). */
  readonly logger?: { error: (err: unknown, msg: string) => void };
  /**
   * Reads the PR's derived intent, or `undefined` when none exists yet.
   * Supplied by the container as a thin wrapper over `container.intent.get`, so
   * this module never imports `modules/intent/*`.
   */
  readonly intent: (workspaceId: string, prId: string) => Promise<PrIntentRecord | undefined>;
}

/** Structural subset of `JobRunner` (`platform/jobs.ts`). `platform/container.ts`
 *  is the only place `this.jobs` is assigned to this type. */
export interface BriefJobs {
  register(kind: string, handler: (payload: unknown) => Promise<void>): void;
  enqueue(workspaceId: string, kind: string, payload: unknown): Promise<unknown>;
}

/**
 * Local structural copy of the blast slice this module consumes. The copy
 * exists because cross-module imports (`modules/blast/*`) are banned; the
 * module NEVER resolves it itself — `BlastService.getBlast` runs a BFS on
 * every call, and triggering that is exactly what AC-18a forbids.
 */
export interface BriefBlastSummary {
  impactedEndpoints: string[];
  degraded?: boolean;
}

export interface BriefComputeParams {
  workspaceId: string;
  prId: string;
  /** Bypass the state-key cache check inside the job (AC-6 regenerate, AC-7
   *  post-review recompute). Absent/`false` → the job short-circuits when the
   *  stored `pr_state_key` still matches. */
  force?: boolean;
  /**
   * ALWAYS absent in this pass (coordinator decision, option A). The parameter
   * is the wiring point for when L04's blast radius is persisted and can be
   * consumed without triggering a computation (AC-18a). Not a forgotten wire.
   */
  blastSummary?: BriefBlastSummary;
}

/** Cross-module access to `BriefService` goes through `container.brief`
 *  (`.dependency-cruiser.cjs`'s `no-cross-module-imports`). */
export interface BriefPort {
  /** Bind the `brief.compute` job handler — called once at boot from the
   *  `brief/routes.ts` plugin body. */
  registerJobHandlers(): void;
  get(workspaceId: string, prId: string): Promise<PrWhyRiskBrief | undefined>;
  /**
   * Fire-and-forget-safe background recompute for the import-time and
   * post-review triggers: does ONLY a single `jobs.enqueue` INSERT — no PR
   * lookup, no cache read — so the caller can `await` just the enqueue (which
   * finishes inside the HTTP request / review-run lifecycle) while the brief
   * work itself runs later, inside the JobRunner. All the resolve / cache /
   * in-flight logic lives in the job handler. `force` bypasses the state-key
   * cache (AC-7: a completed review run must recompute so the new intent lands).
   */
  enqueueRecompute(
    workspaceId: string,
    prId: string,
    opts?: { force?: boolean },
  ): Promise<void>;
  /**
   * Workspace-scoped by the use case itself. `'unknown_pr'` covers both "no
   * such PR" and "PR in another workspace" identically (AC-22). `'running'`
   * means a computation is already in flight for this PR (AC-8).
   */
  requestRecompute(
    workspaceId: string,
    prId: string,
    opts?: { force?: boolean },
  ): Promise<'started' | 'running' | 'unknown_pr'>;
}
