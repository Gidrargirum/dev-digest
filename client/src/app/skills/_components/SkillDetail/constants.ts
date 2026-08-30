/** Query-param tab keys for the skill detail view; default is "config".
 *  "evals" added by Amendment A (AC-55). */
export const VALID_TABS = ["config", "preview", "context", "stats", "versions", "evals"] as const;
export type DetailTab = (typeof VALID_TABS)[number];
