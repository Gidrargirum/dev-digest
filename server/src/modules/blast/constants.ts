/** Max number of prior-PR rows returned in `PrBlastResponse.prior_prs`. */
export const PRIOR_PRS_LIMIT = 5;

/**
 * Max number of changed-file paths sent into the `findPriorPrs` query. A
 * giant PR shouldn't build a query with thousands of `IN (...)` params;
 * truncation is silent by design — no "incomplete list" flag in the contract
 * or UI (see specs/blast-radius.md follow-up notes).
 */
export const PRIOR_PRS_PATH_LIMIT = 200;
