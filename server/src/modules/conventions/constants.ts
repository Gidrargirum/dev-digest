/** Job kind registered on the JobRunner for a repo-wide extraction. */
export const EXTRACT_JOB_KIND = 'conventions-extract';

/** How many ranked source files repo-intel is asked for. */
export const SAMPLE_FILE_LIMIT = 12;

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
