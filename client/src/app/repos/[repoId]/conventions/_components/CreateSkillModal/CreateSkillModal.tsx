/* CreateSkillModal — bakes the accepted convention candidates into one or
   more Skills, one per grouped category. The draft bodies are assembled
   server-side (deterministically, no model call); everything shown here is
   editable before it is saved. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Checkbox, FormField, Icon, Modal, Skeleton } from "@devdigest/ui";
import { ApiError } from "@/lib/api";
import { useAgents } from "@/lib/hooks/agents";
import { useConventionSkillDrafts, useCreateConventionSkills } from "@/lib/hooks/conventions";
import { MODAL_WIDTH } from "./constants";
import { canSubmitForms, categoryLabel, formsFromDrafts, type DraftFormState } from "./helpers";
import { SkillDraftFields } from "./SkillDraftFields";
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
  const { data: draftSet, isLoading } = useConventionSkillDrafts(repoId, ids, true);
  const { data: agents, isLoading: agentsLoading } = useAgents();
  const create = useCreateConventionSkills();

  const [forms, setForms] = React.useState<DraftFormState[]>([]);
  const [touched, setTouched] = React.useState(false);
  const [selectedAgentIds, setSelectedAgentIds] = React.useState<string[]>([]);
  const [submitError, setSubmitError] = React.useState<string | null>(null);

  // Prefill once the draft set lands; a later refetch must not stomp on edits.
  React.useEffect(() => {
    if (!draftSet || touched) return;
    setForms(formsFromDrafts(draftSet.drafts));
  }, [draftSet, touched]);

  const editField =
    (index: number) =>
    <K extends keyof DraftFormState>(key: K, value: DraftFormState[K]) => {
      setTouched(true);
      setForms((prev) => prev.map((f, i) => (i === index ? { ...f, [key]: value } : f)));
    };

  const toggleAgent = (agentId: string, checked: boolean) => {
    setSelectedAgentIds((prev) => (checked ? [...prev, agentId] : prev.filter((id) => id !== agentId)));
  };

  // Not an async onClick: a rejected POST would become an unhandled rejection.
  // The failure is caught and shown in the modal, next to the form it belongs to.
  const submit = () => {
    setSubmitError(null);
    void (async () => {
      try {
        const result = await create.mutateAsync({
          repoId,
          drafts: forms.map((f) => ({
            name: f.name.trim(),
            description: f.description,
            type: f.type,
            body: f.body,
            enabled: f.enabled,
            convention_ids: f.convention_ids,
          })),
          ...(selectedAgentIds.length > 0 ? { agent_ids: selectedAgentIds } : {}),
        });
        onClose();
        if (result.skills.length === 1) {
          router.push(`/skills/${result.skills[0]!.id}?tab=config`);
        } else {
          router.push("/skills");
        }
      } catch (err) {
        setSubmitError(err instanceof ApiError ? err.message : t("createSkill.error"));
      }
    })();
  };

  const canSubmit = canSubmitForms(forms) && !create.isPending && !isLoading;

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("createSkill.title")}
      subtitle={isLoading ? t("createSkill.loading") : t("createSkill.subtitleReady", { count: forms.length })}
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
            {forms.map((f, i) => (
              // One draft per (grouped) category — the category is a stable,
              // unique key across the set (`buildSkillDrafts` emits at most
              // one `category: null` merge draft), unlike the array index.
              <SkillDraftFields
                key={f.category ?? "general"}
                categoryLabel={categoryLabel(f.category, t)}
                value={f}
                onChange={editField(i)}
              />
            ))}
            <FormField label={t("createSkill.agents.label")} hint={t("createSkill.agents.hint")}>
              {agentsLoading ? (
                <Skeleton height={64} />
              ) : agents && agents.length > 0 ? (
                <div style={s.agentsList}>
                  {agents.map((agent) => (
                    <Checkbox
                      key={agent.id}
                      checked={selectedAgentIds.includes(agent.id)}
                      onChange={(v) => toggleAgent(agent.id, v)}
                      label={<span>{agent.name}</span>}
                    />
                  ))}
                </div>
              ) : (
                <span style={s.agentsEmpty}>{t("createSkill.agents.empty")}</span>
              )}
            </FormField>
          </>
        )}
      </div>
    </Modal>
  );
}
