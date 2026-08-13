/* CreateSkillModal — bakes the accepted convention candidates into a Skill.
   The draft body is assembled server-side (deterministically, no model call);
   everything shown here is editable before it is saved. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  Button,
  FormField,
  Icon,
  Modal,
  SelectInput,
  Skeleton,
  TextInput,
  Textarea,
  Toggle,
} from "@devdigest/ui";
import type { SkillType } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { useConventionSkillDraft, useCreateConventionSkill } from "@/lib/hooks/conventions";
import { BODY_ROWS, DEFAULT_SKILL_TYPE, MODAL_WIDTH, SKILL_TYPE_VALUES } from "./constants";
import { estimateTokens } from "./helpers";
import { s } from "./styles";

export function CreateSkillModal({
  repoId,
  repoLabel,
  conventionIds,
  onClose,
}: {
  repoId: string;
  repoLabel: string;
  conventionIds: string[];
  onClose: () => void;
}) {
  const t = useTranslations("conventions");
  const router = useRouter();
  // Frozen for the modal's lifetime: the id list is part of the draft query
  // key, so a background poll that changes the accepted set would re-key the
  // query mid-edit and swap the half-filled form for skeletons. The modal
  // edits one fixed selection; it closes to pick another.
  const [ids] = React.useState(conventionIds);
  const { data: draft, isLoading } = useConventionSkillDraft(repoId, ids, true);
  const create = useCreateConventionSkill();

  const [name, setName] = React.useState("");
  const [description, setDescription] = React.useState("");
  const [type, setType] = React.useState<SkillType>(DEFAULT_SKILL_TYPE);
  const [enabled, setEnabled] = React.useState(true);
  const [body, setBody] = React.useState("");
  const [touched, setTouched] = React.useState(false);
  const [submitError, setSubmitError] = React.useState<string | null>(null);
  const enabledSwitch = React.useRef<HTMLSpanElement>(null);

  // The vendored Toggle renders a bare `<button role="switch">` and forwards no
  // props, and a wrapping <label> does not name a button — so the accessible
  // name is attached here. vendor/ui is not ours to change.
  const enabledLabel = t("createSkill.fields.enabled");
  React.useEffect(() => {
    enabledSwitch.current?.querySelector('[role="switch"]')?.setAttribute("aria-label", enabledLabel);
  }, [enabledLabel, isLoading]);

  // Prefill once the draft lands; a later refetch must not stomp on edits.
  React.useEffect(() => {
    if (!draft || touched) return;
    setName(draft.name);
    setDescription(draft.description);
    setBody(draft.body);
  }, [draft, touched]);

  const edit = <T,>(setter: (v: T) => void) => (v: T) => {
    setTouched(true);
    setter(v);
  };

  // Not an async onClick: a rejected POST would become an unhandled rejection.
  // The failure is caught and shown in the modal, next to the form it belongs to.
  const submit = () => {
    setSubmitError(null);
    void (async () => {
      try {
        const skill = await create.mutateAsync({
          repoId,
          name: name.trim(),
          description,
          type,
          body,
          enabled,
          convention_ids: draft?.convention_ids ?? ids,
        });
        onClose();
        router.push(`/skills/${skill.id}?tab=config`);
      } catch (err) {
        setSubmitError(err instanceof ApiError ? err.message : t("createSkill.error"));
      }
    })();
  };

  const typeOptions = SKILL_TYPE_VALUES.map((v) => ({ value: v, label: t(`createSkill.type.${v}`) }));
  const canSubmit = name.trim().length > 0 && body.trim().length > 0 && !create.isPending && !isLoading;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createSkill.title")}
      subtitle={draft?.name ?? t("createSkill.loading")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("createSkill.cancel")}
          </Button>
          <Button kind="primary" icon="Plus" onClick={submit} disabled={!canSubmit}>
            {create.isPending ? t("createSkill.creating") : t("createSkill.create")}
          </Button>
        </div>
      }
    >
      <div style={s.body}>
        {isLoading ? (
          <div style={s.loading}>
            <Skeleton height={18} />
            <div style={s.loadingGap} />
            <Skeleton height={180} />
          </div>
        ) : (
          <>
            <div style={s.banner}>
              <Icon.Info size={15} style={s.bannerIcon} />
              <span>{t("createSkill.banner", { count: ids.length, repo: repoLabel })}</span>
            </div>
            {submitError && (
              <div role="alert" style={s.error}>
                {submitError}
              </div>
            )}
            <FormField label={t("createSkill.fields.name")} required>
              <TextInput
                value={name}
                onChange={edit(setName)}
                placeholder={t("createSkill.fields.namePlaceholder")}
              />
            </FormField>
            <FormField label={t("createSkill.fields.description")}>
              <TextInput
                value={description}
                onChange={edit(setDescription)}
                placeholder={t("createSkill.fields.descriptionPlaceholder")}
              />
            </FormField>
            <FormField
              label={t("createSkill.fields.type")}
              right={
                <span style={s.enabledLabel}>
                  {enabledLabel}
                  <span ref={enabledSwitch} style={s.enabledSwitch}>
                    <Toggle on={enabled} onChange={setEnabled} size={14} />
                  </span>
                </span>
              }
            >
              <SelectInput
                value={type}
                onChange={(v) => setType(v as SkillType)}
                options={typeOptions}
              />
            </FormField>
            <FormField
              label={t("createSkill.fields.body")}
              hint={t("createSkill.fields.bodyHint")}
              required
            >
              <Textarea value={body} onChange={edit(setBody)} rows={BODY_ROWS} mono />
            </FormField>
            <div style={s.tokenEstimate}>
              {t("createSkill.tokenEstimate", { count: estimateTokens(body) })}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
