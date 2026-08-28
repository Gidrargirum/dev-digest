import type {
  Brief,
  GitHubClient,
  LLMProvider,
  PrBlastResponse,
  PrBriefRecord,
  Provider,
} from '@devdigest/shared';

/**
 * What `BriefService` needs from the outside world — stated as ports, not the
 * `Container` (which constructs the service; accepting it would close a
 * container → service → container cycle, exactly as `IntentDeps`/`BlastPort`
 * document). AC-9: the service depends only on inward-facing interfaces.
 */

export interface BriefModelChoice {
  provider: Provider;
  model: string;
}

export interface BriefUsage {
  tokensIn: number;
  tokensOut: number;
  /** Null when the model's price is unknown (`estimateCost` returned null). */
  costUsd: number | null;
}

export interface BriefResolvedPr {
  id: string;
  repoId: string;
  headSha: string;
}

export interface BriefChangedFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface BriefIntentFacts {
  intent: string;
  inScope: string[];
  outOfScope: string[];
}

export interface BriefPullContext {
  body: string | null;
  repoRef: { owner: string; name: string };
}

export interface UpsertBriefInput {
  prId: string;
  brief: Brief;
  headSha: string;
  runId: string | null;
}

/** Transaction-bound slice used while the advisory lock is held. */
export interface BriefLockedRepository {
  findBrief(prId: string): Promise<PrBriefRecord | undefined>;
  getChangedFiles(prId: string): Promise<BriefChangedFile[]>;
  findIntentFacts(prId: string): Promise<BriefIntentFacts | undefined>;
  findPullContext(prId: string): Promise<BriefPullContext | undefined>;
  upsertBrief(input: UpsertBriefInput): Promise<void>;
}

/** Application-facing repository port; implemented by the Drizzle adapter. */
export interface BriefRepositoryPort {
  resolvePr(workspaceId: string, prId: string): Promise<BriefResolvedPr | undefined>;
  findBrief(prId: string): Promise<PrBriefRecord | undefined>;
  withPrLock<T>(
    prId: string,
    fn: (repo: BriefLockedRepository) => Promise<T>,
  ): Promise<T>;
}

/**
 * Structural slice of the blast read path this module consumes. Declared here
 * rather than imported from `modules/blast/` — `no-cross-module-imports`
 * (`.dependency-cruiser.cjs`) forbids the import, and `container.blast`
 * satisfies this shape structurally at the one wiring site.
 */
export interface BriefBlastSource {
  getBlast(workspaceId: string, prId: string): Promise<PrBlastResponse | undefined>;
}

export interface BriefDeps {
  /** Resolves an LLM provider by id (cached by the container). */
  readonly llm: (provider: Provider) => Promise<LLMProvider>;
  /**
   * Resolves the GitHub client (throws when no token is configured). Same
   * shape and same underlying client `IntentService` uses to fetch a linked
   * issue's title/body.
   */
  readonly github: () => Promise<GitHubClient>;
  /**
   * The workspace's resolved `risk_brief` provider+model — the workspace
   * override or, failing that, the `FEATURE_MODELS` registry default (which
   * `risk_brief` carries). `undefined` only if the registry entry is somehow
   * gone; the service then reports a best-effort skip / a force-path error.
   */
  readonly featureModel: (workspaceId: string) => Promise<BriefModelChoice | undefined>;
  /** Blast read path — supplies the blast summary and one of the two grounded-path sources. */
  readonly blast: BriefBlastSource;
}

export interface GenerateForRunParams {
  workspaceId: string;
  prId: string;
  headSha: string;
  /** The completing run — written to `pr_brief.run_id` (decision #1). */
  runId: string;
}

export interface GenerateResult {
  /** Present only when an LLM call actually happened. */
  usage?: BriefUsage;
}

/**
 * Discriminated `get` result. `not-found` means the PR does not resolve in the
 * caller's workspace → the route returns `404` (decision #3). `ok` with
 * `brief: null` means the PR exists but has no Brief for its current
 * `head_sha` → `200 { brief: null }` (AC-11).
 */
export type BriefGetResult =
  | { kind: 'not-found' }
  | { kind: 'ok'; brief: PrBriefRecord | null };

/**
 * `regenerate` result — `not-found` maps to `404` on the force path too
 * (decision #3), `ok` carries the new call's usage.
 */
export type RegenerateResult =
  | { kind: 'not-found' }
  | { kind: 'ok'; usage?: BriefUsage };

/** Cross-module access to `BriefService` goes through `container.brief`. */
export interface BriefPort {
  get(workspaceId: string, prId: string): Promise<BriefGetResult>;
  generateForRun(params: GenerateForRunParams): Promise<GenerateResult>;
  regenerate(workspaceId: string, prId: string): Promise<RegenerateResult>;
}
