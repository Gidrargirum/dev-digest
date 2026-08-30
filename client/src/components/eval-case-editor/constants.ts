/** Constants for EvalCaseEditor. */

export const MODAL_WIDTH = 760;

export const INPUT_TABS = [
  { key: "diff", labelKey: "caseEditor.tabs.diff" },
  { key: "prMeta", labelKey: "caseEditor.tabs.prMeta" },
] as const;

export type InputTabKey = (typeof INPUT_TABS)[number]["key"];

export const EXPECTATION_TYPE_VALUES = ["must_find", "must_not_flag"] as const;
