/** Job kind registered on the JobRunner for a repo-wide extraction. */
export const EXTRACT_JOB_KIND = 'conventions-extract';

/**
 * How many ranked source files repo-intel is asked for. Raised from 12 to 24
 * (plan "Крок 5" — flat top-12 on this repo's 312 indexed files came from 3
 * directories, zero route handlers/services/components; stratified sampling
 * over `getConventionSamples` needs headroom across more strata to actually
 * spread across the codebase's shapes).
 *
 * Budget at 24: `EXTRACTION_BATCH_SIZE=4` → 6 batches. Fully parallel
 * (`Promise.allSettled` over all 6 at once) was tried first and MEASURED to
 * hang indefinitely on a real scan — 6 simultaneous requests to the provider
 * never settled within `EXTRACTION_TIMEOUT_MS` each, with zero batch-failure
 * events for 10+ minutes. `EXTRACTION_CONCURRENCY` below caps how many run at
 * once; `SCAN_BUDGET_MS` is also now a real backstop (see `runExtract`'s use
 * of `withTimeout` around the whole model-extraction phase), not just a
 * between-steps check, so a hung request can no longer leave the scan row on
 * `running` forever. `SCAN_BUDGET_MS` itself is untouched — it is
 * deliberately below the JobRunner's 120s timeout so a scan that overruns
 * still writes its own terminal state instead of leaving the UI on a
 * permanent `running`.
 */
export const SAMPLE_FILE_LIMIT = 24;

/**
 * Max extraction batches in flight at once. Measured on a real scan: 6/6
 * batches fully parallel triggered provider-side throttling severe enough
 * that not one batch settled (fulfilled OR rejected-by-timeout) for 10+
 * minutes. Capping concurrency trades a bit of wall-clock time for requests
 * that actually complete or time out as configured — and `runExtract`'s own
 * `SCAN_BUDGET_MS` deadline (see above) is the backstop if they still don't.
 */
export const EXTRACTION_CONCURRENCY = 3;

/**
 * Config files read verbatim (when present) and turned into rules by code —
 * no model involved, so these are free and always correct.
 */
export const CONFIG_FILES = [
  'eslint.config.mjs',
  'eslint.config.js',
  '.eslintrc.json',
  '.eslintrc.cjs',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  'prettier.config.js',
] as const;

/**
 * Files per extraction call. One call over all 12 files yields 3–5 generic
 * rules; three calls over 4 files each yield more, and more specific, rules —
 * and a batch that fails does not take the scan down with it.
 */
export const EXTRACTION_BATCH_SIZE = 4;

/** Cap per category, so the list is not eight variations of one rule. */
export const MAX_CANDIDATES_PER_CATEGORY = 3;

/**
 * A category earns its own `<repo>-<category>-conventions` skill only once it
 * has at least this many accepted candidates. Below the threshold its
 * candidates merge into the general `<repo>-conventions` skill instead — a
 * category with exactly one accepted rule does not justify its own skill.
 */
export const SKILL_CATEGORY_MIN_CANDIDATES = 2;

/**
 * A rule corroborated by a single occurrence is a coincidence, not a
 * convention. This threshold removes the noisiest class of false positives.
 */
export const MIN_SUPPORT = 2;

/** Truncation guard — never feed a half-megabyte file to the model. */
export const MAX_FILE_BYTES = 8_000;

/**
 * The pipeline's own deadline, deliberately UNDER the JobRunner's 120s timeout.
 *
 * When the runner times out it rejects its own promise, but the work already in
 * flight keeps running and the scan row is only written by `runExtract`'s own
 * `finally` — so a scan that overran left the UI polling a `running` row that
 * never resolved. Owning the deadline here means the terminal state is always
 * written by us, before the runner gives up on us.
 */
export const SCAN_BUDGET_MS = 100_000;

/** Per-call ceilings, so one slow provider response cannot eat the budget. */
export const SELECTION_TIMEOUT_MS = 25_000;
export const EXTRACTION_TIMEOUT_MS = 45_000;

/** Ceiling on grep hits counted for corroboration (ripgrep can return a lot). */
export const MAX_GREP_MATCHES = 500;

/** Skill defaults for the merged `<repo>-conventions` skill. */
export const SKILL_TYPE = 'convention';
export const SKILL_SOURCE = 'extracted';
