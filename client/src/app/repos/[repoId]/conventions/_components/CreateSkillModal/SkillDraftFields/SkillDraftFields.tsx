/* SkillDraftFields — one draft's editable section inside CreateSkillModal:
   name / description / type / body / enabled + a token estimate. The modal
   renders one of these per grouped-category draft. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { FormField, SelectInput, TextInput, Textarea, Toggle } from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { BODY_ROWS, SKILL_TYPE_VALUES } from "../constants";
import { estimateTokens, type DraftFormState } from "../helpers";
import { s } from "./styles";

export function SkillDraftFields({
  categoryLabel,
  value,
  onChange,
}: {
  categoryLabel: string;
  value: DraftFormState;
  onChange: <K extends keyof DraftFormState>(key: K, v: DraftFormState[K]) => void;
}) {
  const t = useTranslations("conventions");
  const enabledSwitch = React.useRef<HTMLSpanElement>(null);

  // The vendored Toggle renders a bare `<button role="switch">` and forwards no
  // props, and a wrapping <label> does not name a button — so the accessible
  // name is attached here, per section, so multiple drafts don't collide on
  // one shared "Enabled" name. vendor/ui is not ours to change.
  const enabledLabel = `${t("createSkill.fields.enabled")} — ${categoryLabel}`;
  React.useEffect(() => {
    enabledSwitch.current?.querySelector('[role="switch"]')?.setAttribute("aria-label", enabledLabel);
  }, [enabledLabel]);

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`createSkill.type.${v}`) }));

  return (
    <div style={s.section}>
      <div style={s.heading}>{categoryLabel}</div>
      <FormField label={t("createSkill.fields.name")} required>
        <TextInput
          value={value.name}
          onChange={(v) => onChange("name", v)}
          placeholder={t("createSkill.fields.namePlaceholder")}
        />
      </FormField>
      <FormField label={t("createSkill.fields.description")}>
        <TextInput
          value={value.description}
          onChange={(v) => onChange("description", v)}
          placeholder={t("createSkill.fields.descriptionPlaceholder")}
        />
      </FormField>
      <FormField
        label={t("createSkill.fields.type")}
        right={
          <span style={s.enabledLabel}>
            {t("createSkill.fields.enabled")}
            <span ref={enabledSwitch} style={s.enabledSwitch}>
              <Toggle on={value.enabled} onChange={(v) => onChange("enabled", v)} size={14} />
            </span>
          </span>
        }
      >
        <SelectInput
          value={value.type}
          onChange={(v) => onChange("type", v as SkillType)}
          options={typeOptions}
        />
      </FormField>
      <FormField label={t("createSkill.fields.body")} hint={t("createSkill.fields.bodyHint")} required>
        <Textarea value={value.body} onChange={(v) => onChange("body", v)} rows={BODY_ROWS} mono />
      </FormField>
      <div style={s.tokenEstimate}>{t("createSkill.tokenEstimate", { count: estimateTokens(value.body) })}</div>
    </div>
  );
}
