import type { ConventionCategory, ConventionSkillDraft, SkillType } from "@devdigest/shared";
import { CHARS_PER_TOKEN, DEFAULT_SKILL_TYPE } from "./constants";

/** Rough token estimate for a prompt body (chars/4), mirroring the Skill
 *  config tab. Copied rather than imported: it is local to this folder and
 *  feature folders don't reach into each other. */
export function estimateTokens(body: string): number {
  return Math.ceil(body.length / CHARS_PER_TOKEN);
}

/** One draft's editable form state — mirrors `ConventionSkillDraft` plus the
 *  author-editable `type`/`enabled` fields the draft response doesn't carry. */
export interface DraftFormState {
  category: ConventionCategory | null;
  name: string;
  description: string;
  type: SkillType;
  enabled: boolean;
  body: string;
  convention_ids: string[];
}

/** Seeds one editable form per draft the preview returned. */
export function formsFromDrafts(drafts: ConventionSkillDraft[]): DraftFormState[] {
  return drafts.map((d) => ({
    category: d.category,
    name: d.name,
    description: d.description,
    type: DEFAULT_SKILL_TYPE,
    enabled: true,
    body: d.body,
    convention_ids: d.convention_ids,
  }));
}

/** Every draft needs a non-empty name and body before the batch can submit. */
export function canSubmitForms(forms: DraftFormState[]): boolean {
  return forms.length > 0 && forms.every((f) => f.name.trim().length > 0 && f.body.trim().length > 0);
}

/** Section heading for a draft: the category it was grouped by, or a general
 *  label when several singleton categories were merged (`category: null`). */
export function categoryLabel(
  category: ConventionCategory | null,
  t: (key: string) => string,
): string {
  return category ? t(`card.category.${category}`) : t("createSkill.sectionGeneral");
}
