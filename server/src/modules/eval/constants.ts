/** Constants for the eval module. */

/** Re-exported from `modules/_shared/constants.ts` — also read by
 *  `modules/agents/repository.ts`, which may not import this module directly. */
export { EVAL_CASE_OWNER_KIND } from '../_shared/constants.js';

/** How many recent runs `GET /evals/dashboard` returns. */
export const DASHBOARD_RECENT_RUNS_LIMIT = 20;
