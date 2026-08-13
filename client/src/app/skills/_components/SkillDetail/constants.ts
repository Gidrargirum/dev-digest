/** Query-param tab keys for the skill detail view; default is "config". */
export const VALID_TABS = ["config", "preview", "stats", "versions"] as const;
export type DetailTab = (typeof VALID_TABS)[number];
