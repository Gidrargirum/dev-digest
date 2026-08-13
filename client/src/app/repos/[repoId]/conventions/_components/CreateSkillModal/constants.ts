import type { SkillType } from "@devdigest/shared";

export const MODAL_WIDTH = 760;

/** Conventions bake into a `convention` skill by default. */
export const DEFAULT_SKILL_TYPE: SkillType = "convention";

export const SKILL_TYPE_VALUES: readonly SkillType[] = ["rubric", "convention", "security", "custom"];

export const BODY_ROWS = 14;

/** ~4 characters per token — the same rough estimate the Skill config tab uses. */
export const CHARS_PER_TOKEN = 4;
