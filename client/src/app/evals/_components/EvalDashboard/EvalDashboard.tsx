/* EvalDashboard — the workspace-wide `Eval Dashboard` screen (AC-31/AC-32):
   every agent with its model badge, "Configure eval cases →" for an agent
   with no batches, and a global `Recent runs` table across all agents. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Badge, Card, EmptyState, ErrorState, Icon, Skeleton } from "@devdigest/ui";
import { useEvalDashboard } from "@/lib/hooks/eval";
import { ApiError } from "@/lib/api";
import { pct } from "./helpers";
import { s } from "./styles";

export function EvalDashboard() {
  const t = useTranslations("eval");
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useEvalDashboard();

  const crumb = [{ label: t("page.crumbSkillsLab") }, { label: t("page.crumbEvalDashboard") }];

  if (isError) {
    return (
      <AppShell crumb={crumb}>
        <ErrorState
          fullScreen
          title={t("page.crumbEvalDashboard")}
          body={error instanceof ApiError ? error.message : t("errors.unreachable")}
          onRetry={() => refetch()}
        />
      </AppShell>
    );
  }

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>

        {isLoading ? (
          <Skeleton height={160} />
        ) : (data?.agents ?? []).length === 0 ? (
          <EmptyState icon="Cpu" title={t("dashboard.noRuns")} />
        ) : (
          <div style={s.agentGrid}>
            {(data?.agents ?? []).map((a) => (
              <Card key={a.agent_id} hover onClick={() => router.push(`/evals/${a.agent_id}`)} pad={false}>
                <div style={s.agentRow}>
                  <Icon.Cpu size={16} style={s.agentIcon} />
                  <span style={s.agentName}>{a.agent_name}</span>
                  <Badge color="var(--text-secondary)" mono>
                    {a.agent_model}
                  </Badge>
                  {a.latest_batch ? (
                    <>
                      <span style={s.metricCell}>{t("dashboard.metrics.recall")}: {pct(a.latest_batch.recall)}</span>
                      <span style={s.metricCell}>{t("dashboard.metrics.precision")}: {pct(a.latest_batch.precision)}</span>
                      <span style={s.metricCell}>{t("dashboard.metrics.citationAccuracy")}: {pct(a.latest_batch.citation_accuracy)}</span>
                    </>
                  ) : (
                    <span style={s.metricCellConfigure}>{t("dashboard.configure")}</span>
                  )}
                </div>
              </Card>
            ))}
          </div>
        )}

        <div>
          <div style={s.sectionTitle}>{t("dashboard.recentRuns")}</div>
          {(data?.recent_runs ?? []).length === 0 ? (
            <div style={s.noRuns}>{t("dashboard.noRuns")}</div>
          ) : (
            (data?.recent_runs ?? []).map((r) => (
              <div key={r.id} style={s.historyRow}>
                <span style={s.historyCell}>{r.agent_name}</span>
                <span style={s.historyCell}>{r.case_name ?? "—"}</span>
                <span style={s.historyCell}>{new Date(r.ran_at).toLocaleString()}</span>
                <span style={s.historyCell}>v{r.agent_version}</span>
                <span style={s.historyCell}>{pct(r.recall)}</span>
                <span style={s.historyCell}>{pct(r.precision)}</span>
                <span style={s.historyCell}>{pct(r.citation_accuracy)}</span>
                <span style={s.historyCell}>{r.pass == null ? "—" : r.pass ? t("dashboard.pass") : t("dashboard.fail")}</span>
              </div>
            ))
          )}
        </div>
      </div>
    </AppShell>
  );
}
