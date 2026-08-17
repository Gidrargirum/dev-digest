/* SkillsView — shared two-pane shell for /skills and /skills/[id]. Left rail
   is the searchable skill list (mirrors AgentsListView); the right pane shows
   an empty "select a skill" prompt or the SkillDetail tabs. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Button, Dropdown, ErrorState, Skeleton, Icon } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { useSkills, useSkill, useUpdateSkill, useCreateSkill } from "@/lib/hooks/skills";
import { SkillCard } from "../SkillCard";
import { SkillDetail } from "../SkillDetail";
import { AddSkillDrawer } from "../AddSkillDrawer";
import { filterSkills } from "./helpers";
import { s } from "./styles";

export function SkillsView({ selectedId }: { selectedId?: string }) {
  const t = useTranslations("skills");
  const router = useRouter();
  const { data: skills, isLoading, isError, refetch } = useSkills();
  const { data: skill } = useSkill(selectedId);
  const update = useUpdateSkill();
  const create = useCreateSkill();
  const [search, setSearch] = React.useState("");
  const [drawerTab, setDrawerTab] = React.useState<"file" | "community" | null>(null);

  const list = filterSkills(skills ?? [], search);

  const createBlank = async () => {
    const sk = await create.mutateAsync({
      name: "New skill",
      description: "",
      type: "custom",
      body: "# New skill\n",
      source: "manual",
    });
    router.push(`/skills/${sk.id}?tab=config`);
  };

  const crumb = [
    { label: t("page.crumbLab") },
    {
      label: t(selectedId ? "detail.crumbSkill" : "page.crumbSkills"),
      href: selectedId ? "/skills" : undefined,
    },
    ...(selectedId && skill ? [{ label: skill.name }] : []),
  ];

  return (
    <AppShell crumb={crumb}>
      {drawerTab && <AddSkillDrawer initialTab={drawerTab} onClose={() => setDrawerTab(null)} />}
      <div style={s.shell}>
        <div style={s.rail}>
          <div style={s.railHeader}>
            <div style={s.railHeaderRow}>
              <h1 style={s.h1}>{t("page.heading")}</h1>
              <Dropdown
                width={220}
                align="right"
                trigger={
                  <Button kind="primary" size="sm" icon="Plus" iconRight="ChevronDown">
                    {t("page.addSkill")}
                  </Button>
                }
                items={[
                  { label: t("page.menu.fromScratch"), icon: "Edit", onClick: () => void createBlank() },
                  { divider: true },
                  { label: t("page.menu.fromFile"), icon: "Upload", onClick: () => setDrawerTab("file") },
                  { divider: true },
                  { label: t("page.menu.community"), icon: "Globe", onClick: () => setDrawerTab("community") },
                ]}
              />
            </div>
            <div style={s.search}>
              <Icon.Search size={13} style={s.searchIcon} />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder={t("page.searchPlaceholder")}
                style={s.searchInput}
              />
            </div>
          </div>
          <div style={s.railList}>
            {isLoading && (
              <div style={s.grid}>
                <Skeleton height={90} />
                <Skeleton height={90} />
                <Skeleton height={90} />
              </div>
            )}
            {isError && <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />}
            {!isLoading && !isError && list.length === 0 && (
              <div style={{ padding: "24px 4px", fontSize: 13, color: "var(--text-secondary)" }}>
                {t("page.empty.body")}
              </div>
            )}
            {list.length > 0 && (
              <div style={s.grid}>
                {list.map((sk) => (
                  <SkillCard
                    key={sk.id}
                    sk={sk}
                    active={sk.id === selectedId}
                    onClick={() => router.push(`/skills/${sk.id}?tab=config`)}
                    onToggle={(enabled) => update.mutate({ id: sk.id, patch: { enabled } })}
                  />
                ))}
              </div>
            )}
          </div>
        </div>

        <div style={s.right}>
          {!selectedId ? (
            <div style={s.selectPrompt}>
              <div style={s.selectPromptIcon}>
                <Icon.Sparkles size={22} />
              </div>
              <div style={s.selectPromptTitle}>{t("page.selectPrompt.title")}</div>
              <div style={s.selectPromptBody}>{t("page.selectPrompt.body")}</div>
            </div>
          ) : (
            <SkillDetail skillId={selectedId} />
          )}
        </div>
      </div>
    </AppShell>
  );
}
