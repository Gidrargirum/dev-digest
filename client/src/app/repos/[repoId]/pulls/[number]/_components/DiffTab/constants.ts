/** The two Diff tab render modes. Normal is byte-for-byte what the tab
 *  rendered before Smart Diff existed; Smart Diff is the deterministic,
 *  client-only grouping (see ./_components/SmartDiffView). Normal is the
 *  default so a bare `?tab=diff` (no `diffMode` param) — including flow 05 —
 *  keeps rendering exactly as before. */
export type DiffMode = "normal" | "smart";

export const DIFF_MODE_PARAM = "diffMode";
export const SMART_MODE_VALUE = "smart";
