/* SkillDetail — right-pane header (name/type/version) + tab bar, mirrors
   AgentEditor's shell. Tab state lives in ?tab= on the current /skills/:id
   route. */
"use client";

import React from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Tabs, Badge, Icon, Skeleton, ErrorState } from "@devdigest/ui";
import { useSkill } from "@/lib/hooks/skills";
import { ConfigTab } from "./_components/ConfigTab";
import { PreviewTab } from "./_components/PreviewTab";
import { ProjectContextSection } from "./_components/ProjectContextSection";
import { StatsTab } from "./_components/StatsTab";
import { VersionsTab } from "./_components/VersionsTab";
import { EvalsTab } from "./_components/EvalsTab";
import { VALID_TABS, type DetailTab } from "./constants";
import { s } from "./styles";

export function SkillDetail({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const search = useSearchParams();
  const { data: skill, isLoading, isError, refetch } = useSkill(skillId);

  const tabParam = search.get("tab") ?? "";
  const tab: DetailTab = (VALID_TABS as readonly string[]).includes(tabParam)
    ? (tabParam as DetailTab)
    : "config";
  const setTab = (k: string) => {
    const sp = new URLSearchParams(search.toString());
    sp.set("tab", k);
    router.replace(`/skills/${skillId}?${sp.toString()}`);
  };

  if (isError || (!isLoading && !skill)) {
    return (
      <ErrorState
        fullScreen
        title={t("detail.notFound.title")}
        body={t("detail.notFound.body")}
        onRetry={() => refetch()}
      />
    );
  }

  if (isLoading || !skill) {
    return (
      <div style={s.loadingWrap}>
        <Skeleton height={24} width={240} />
        <Skeleton height={200} />
      </div>
    );
  }

  const tabs = [
    { key: "config", label: t("detail.tabs.config"), icon: "Settings" as const },
    { key: "preview", label: t("detail.tabs.preview"), icon: "Eye" as const },
    { key: "context", label: t("detail.tabs.context"), icon: "FileText" as const },
    { key: "stats", label: t("detail.tabs.stats"), icon: "BarChart" as const },
    { key: "versions", label: t("detail.tabs.versions"), icon: "History" as const },
    { key: "evals", label: t("detail.tabs.evals"), icon: "FlaskConical" as const },
  ];

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <Icon.Sparkles size={18} style={{ color: "var(--accent)" }} />
        <h1 className="mono" style={s.h1}>
          {skill.name}
        </h1>
        <Badge color="var(--text-secondary)">{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-secondary)" mono>
          {t("preview.version", { version: skill.version })}
        </Badge>
      </div>
      <div style={s.tabsBar}>
        <Tabs tabs={tabs} value={tab} onChange={setTab} pad="0 28px" />
      </div>
      <div style={s.body}>
        {tab === "config" && <ConfigTab skill={skill} />}
        {tab === "preview" && <PreviewTab skill={skill} />}
        {tab === "context" && <ProjectContextSection skill={skill} />}
        {tab === "stats" && <StatsTab skillId={skill.id} />}
        {tab === "versions" && <VersionsTab skill={skill} />}
        {tab === "evals" && <EvalsTab skill={skill} />}
      </div>
    </div>
  );
}
