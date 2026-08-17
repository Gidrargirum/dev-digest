"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { MetricCard, Donut, MonoLink, Skeleton } from "@devdigest/ui";
import { useSkillStats } from "@/lib/hooks/skills";
import { s } from "./styles";

const CATEGORY_COLORS = [
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--crit)",
  "var(--text-secondary)",
] as const;

/** Stats tab — used-by / findings / accept-rate KPIs + agents list + category donut. */
export function StatsTab({ skillId }: { skillId: string }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading } = useSkillStats(skillId);

  if (isLoading || !stats) {
    return (
      <div style={s.wrap}>
        <Skeleton height={90} />
        <Skeleton height={140} />
      </div>
    );
  }

  const usedByAny = stats.used_by.length > 0;

  return (
    <div style={s.wrap}>
      <div style={s.metrics}>
        <MetricCard label={t("stats.usedBy")} value={stats.used_by.length} />
        <MetricCard
          label={t("stats.acceptRate")}
          value={stats.accept_rate == null ? "—" : stats.accept_rate}
          suffix={stats.accept_rate == null ? undefined : "%"}
        />
        <MetricCard label={t("stats.findings30d")} value={stats.findings_30d} />
      </div>

      {!usedByAny ? (
        <div style={s.muted}>{t("stats.notUsed")}</div>
      ) : (
        <>
          <div style={s.section}>
            <div style={s.sectionTitle}>{t("stats.agentsUsing")}</div>
            <div style={s.agentsList}>
              {stats.used_by.map((a) => (
                <MonoLink key={a.id} href={`/agents/${a.id}`}>
                  {a.name}
                </MonoLink>
              ))}
            </div>
          </div>

          <div style={s.section}>
            <div style={s.sectionTitle}>{t("stats.findingsByCategory")}</div>
            {stats.by_category.length === 0 ? (
              <div style={s.muted}>{t("stats.noCategories")}</div>
            ) : (
              <Donut
                valuePrefix=""
                segments={stats.by_category.map((c, i) => ({
                  label: c.category,
                  value: c.count,
                  color: CATEGORY_COLORS[i % CATEGORY_COLORS.length] ?? "var(--text-secondary)",
                }))}
              />
            )}
          </div>
        </>
      )}
    </div>
  );
}
