/* EvalDashboard — the workspace-wide `Eval Dashboard` screen (AC-31/AC-32):
   every agent with its model badge, recall trend, "Configure eval cases →"
   for an agent with no batches, and a global `Recent runs` table across all
   agents. Visual parity with the supplied design: a `Run all agents` action,
   a recall sparkline + colour-coded stats per agent row, and colour-coded
   bars (not bare text) for the metric columns in the runs table. */
"use client";

import React from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Badge, Button, Card, EmptyState, ErrorState, Icon, Skeleton, Sparkline } from "@devdigest/ui";
import type { EvalDashboardAgent } from "@devdigest/shared";
import { useEvalDashboard, useEvalBatches } from "@/lib/hooks/eval";
import { useToast } from "@/lib/toast";
import { api, ApiError } from "@/lib/api";
import { METRIC_COLOR, SPARKLINE_BATCH_COUNT } from "./constants";
import { pct, pctValue } from "./helpers";
import { s } from "./styles";

export function EvalDashboard() {
  const t = useTranslations("eval");
  const toast = useToast();
  const router = useRouter();
  const { data, isLoading, isError, error, refetch } = useEvalDashboard();
  const [runningAll, setRunningAll] = React.useState(false);

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

  const agents = data?.agents ?? [];

  const runAllAgents = async () => {
    if (agents.length === 0 || !window.confirm(t("dashboard.confirmRunAll"))) return;
    setRunningAll(true);
    try {
      // Best-effort per agent — one with no eval cases 400s (AC-16) and is
      // simply skipped rather than aborting the rest.
      await Promise.all(agents.map((a) => api.post(`/agents/${a.agent_id}/eval-runs`).catch(() => undefined)));
      toast.success(t("dashboard.runAllStarted"));
    } finally {
      setRunningAll(false);
    }
  };

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.headerRow}>
          <div>
            <h1 style={s.h1}>{t("dashboard.defaultTitle")}</h1>
            <div style={s.subtitle}>{t("dashboard.subtitle")}</div>
          </div>
          {agents.length > 0 && (
            <Button kind="primary" icon="Play" loading={runningAll} onClick={runAllAgents}>
              {t("dashboard.runAllAgents")}
            </Button>
          )}
        </div>

        {isLoading ? (
          <Skeleton height={160} />
        ) : agents.length === 0 ? (
          <EmptyState icon="Cpu" title={t("dashboard.noRuns")} />
        ) : (
          <div>
            <div style={s.sectionTitleRow}>
              <Icon.Cpu size={14} />
              <span style={s.sectionTitleText}>{t("dashboard.agentsSectionTitle")}</span>
            </div>
            <div style={s.agentGrid}>
              {agents.map((a) => (
                <AgentRow key={a.agent_id} agent={a} onOpen={() => router.push(`/evals/${a.agent_id}`)} t={t} />
              ))}
            </div>
          </div>
        )}

        <div>
          <div style={s.sectionTitleRow}>
            <Icon.History size={14} />
            <span style={s.sectionTitleText}>{t("dashboard.recentRunsAllAgents")}</span>
          </div>
          {(data?.recent_runs ?? []).length === 0 ? (
            <div style={s.noRuns}>{t("dashboard.noRuns")}</div>
          ) : (
            <div style={s.tableWrap}>
              <table style={s.table}>
                <colgroup>
                  <col style={{ width: "16%" }} />
                  <col />
                  <col style={{ width: "15%" }} />
                  <col style={{ width: "7%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "11%" }} />
                  <col style={{ width: "7%" }} />
                </colgroup>
                <thead>
                  <tr>
                    <th style={s.th}>{t("dashboard.table.agent")}</th>
                    <th style={s.th}>{t("dashboard.table.case")}</th>
                    <th style={s.th}>{t("dashboard.table.ranAt")}</th>
                    <th style={s.thNum}>{t("dashboard.table.version")}</th>
                    <th style={s.thNum}>{t("dashboard.table.recall")}</th>
                    <th style={s.thNum}>{t("dashboard.table.precision")}</th>
                    <th style={s.thNum}>{t("dashboard.table.citation")}</th>
                    <th style={s.thNum}>{t("dashboard.table.pass")}</th>
                  </tr>
                </thead>
                <tbody>
                  {(data?.recent_runs ?? []).map((r) => (
                    <tr key={r.id} style={s.tr}>
                      <td style={s.td}>{r.agent_name}</td>
                      <td style={{ ...s.td, ...s.tdTruncate }} title={r.case_name ?? undefined}>
                        {r.case_name ?? "—"}
                      </td>
                      <td style={s.td}>{new Date(r.ran_at).toLocaleString()}</td>
                      <td style={s.tdNum}>v{r.agent_version}</td>
                      <td style={s.tdNum}>
                        <MetricBar value={r.recall} color={METRIC_COLOR.recall} />
                      </td>
                      <td style={s.tdNum}>
                        <MetricBar value={r.precision} color={METRIC_COLOR.precision} />
                      </td>
                      <td style={s.tdNum}>
                        <MetricBar value={r.citation_accuracy} color={METRIC_COLOR.citation} />
                      </td>
                      <td style={s.tdNum}>
                        {r.pass == null ? (
                          "—"
                        ) : (
                          <span style={r.pass ? s.passBadge : s.failBadge}>
                            {r.pass ? t("dashboard.pass") : t("dashboard.fail")}
                          </span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </AppShell>
  );
}

/** One agent card: icon, name + model badge, "Last run vN · date · X/Y pass"
 *  (or the configure nudge for an agent with no batches yet), a recall
 *  sparkline over its recent batches, colour-coded RECALL/PREC/CITE stats,
 *  and a chevron affordance — the whole row navigates to the agent's page. */
function AgentRow({
  agent,
  onOpen,
  t,
}: {
  agent: EvalDashboardAgent;
  onOpen: () => void;
  t: ReturnType<typeof useTranslations>;
}) {
  // Only used for the sparkline — the "Last run" subtitle and the stat
  // numbers come straight off `agent.latest_batch`, already in the dashboard
  // payload, so this extra fetch never blocks first paint of those.
  const { data: batches } = useEvalBatches(agent.agent_id);
  const trend = (batches ?? [])
    .slice(0, SPARKLINE_BATCH_COUNT)
    .reverse()
    .map((b) => pctValue(b.recall));

  const latest = agent.latest_batch;

  return (
    <Card hover onClick={onOpen} pad={false}>
      <div style={s.agentRow}>
        <div style={s.agentIconBadge}>
          <Icon.Cpu size={16} style={s.agentIcon} />
        </div>
        <div style={s.agentMainCol}>
          <div style={s.agentNameRow}>
            <span style={s.agentName}>{agent.agent_name}</span>
            <Badge color="var(--text-secondary)" mono>
              {agent.agent_model}
            </Badge>
          </div>
          <span style={latest ? s.agentSubtitle : s.metricCellConfigure}>
            {latest
              ? t("dashboard.lastRunSummary", {
                  version: latest.agent_version,
                  date: new Date(latest.started_at).toLocaleString(),
                  passed: latest.cases_passed,
                  total: latest.cases_total,
                })
              : t("dashboard.configure")}
          </span>
        </div>

        {latest && (
          <>
            {trend.length >= 2 && (
              <div style={s.agentSparkline}>
                <Sparkline data={trend} color={METRIC_COLOR.recall} />
              </div>
            )}
            <div style={s.agentStats}>
              <Stat label={t("dashboard.metrics.recall")} value={latest.recall} color={METRIC_COLOR.recall} />
              <Stat label={t("dashboard.metrics.precision")} value={latest.precision} color={METRIC_COLOR.precision} />
              <Stat
                label={t("dashboard.metrics.citationAccuracy")}
                value={latest.citation_accuracy}
                color={METRIC_COLOR.citation}
              />
            </div>
          </>
        )}
        <Icon.ChevronRight size={16} style={s.agentChevron} />
      </div>
    </Card>
  );
}

function Stat({ label, value, color }: { label: string; value: number | null; color: string }) {
  return (
    <div style={s.agentStat}>
      <span style={s.agentStatLabel}>{label}</span>
      <span style={s.agentStatValue(value == null ? "var(--text-muted)" : color)}>{pct(value)}</span>
    </div>
  );
}

/** A short colour-coded bar + percentage — used for every metric cell in the
 *  recent-runs table instead of bare text. */
function MetricBar({ value, color }: { value: number | null; color: string }) {
  if (value == null) return <span>—</span>;
  const p = pctValue(value);
  return (
    <span style={s.metricBarCell}>
      <span style={s.metricBarTrack}>
        <span style={s.metricBarFill(p, color)} />
      </span>
      <span style={s.metricBarValue}>{p}%</span>
    </span>
  );
}
