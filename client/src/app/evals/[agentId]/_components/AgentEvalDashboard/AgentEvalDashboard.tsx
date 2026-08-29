/* AgentEvalDashboard — the per-agent eval page: four metric cards (exactly
   four — AC-24 forbids a fifth), METRIC TREND (AC-30), run history with
   Compare selection (AC-27) and cost (Cost visibility), and the
   precision-regression banner (AC-33). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { Button, Checkbox, EmptyState, ErrorState, Icon, LineChart, MetricCard, Skeleton } from "@devdigest/ui";
import { useAgent } from "@/lib/hooks/agents";
import { useEvalBatches, useEvalCases, useStartEvalBatch } from "@/lib/hooks/eval";
import { ApiError } from "@/lib/api";
import { CompareRunsPopup } from "../CompareRunsPopup";
import { COMPARE_SELECTION_SIZE, MIN_BATCHES_FOR_TREND } from "./constants";
import { metricSeries, precisionRegression, tracesPassedPct } from "./helpers";
import { s } from "./styles";

export function AgentEvalDashboard({ agentId }: { agentId: string }) {
  const t = useTranslations("eval");
  const { data: agent, isError: agentError } = useAgent(agentId);
  const { data: batches, isLoading, isError, error, refetch } = useEvalBatches(agentId);
  const { data: cases } = useEvalCases(agentId);
  const startBatch = useStartEvalBatch(agentId);
  const [selected, setSelected] = React.useState<string[]>([]);
  const [showCompare, setShowCompare] = React.useState(false);

  const toggleSelect = (batchId: string) =>
    setSelected((prev) =>
      prev.includes(batchId) ? prev.filter((id) => id !== batchId) : [...prev, batchId].slice(-COMPARE_SELECTION_SIZE),
    );

  const canCompare = selected.length === COMPARE_SELECTION_SIZE;
  const list = batches ?? [];
  const latest = list[0] ?? null;
  const regression = precisionRegression(list);

  const crumb = [
    { label: t("page.crumbSkillsLab") },
    { label: t("page.crumbEvals"), href: "/evals" },
    { label: agent?.name ?? t("page.crumbEvalDashboard") },
  ];

  if (isError || agentError) {
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

  const [older, newer] = selected
    .map((id) => list.find((b) => b.id === id))
    .filter((b): b is NonNullable<typeof b> => !!b)
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime());

  return (
    <AppShell crumb={crumb}>
      <div style={s.wrap}>
        <div style={s.header}>
          <h1 style={s.h1}>{agent?.name ?? t("page.crumbEvalDashboard")}</h1>
          <Button
            kind="secondary"
            icon="Play"
            loading={startBatch.isPending}
            disabled={!cases || cases.length === 0}
            onClick={() => startBatch.mutate()}
          >
            {t("dashboard.runEval", { count: cases?.length ?? 0 })}
          </Button>
        </div>

        {regression != null && (
          <div style={s.banner}>
            <Icon.AlertTriangle size={16} />
            {t("banner.precisionRegression", { delta: `${Math.round(regression * 100)}%` })}
          </div>
        )}

        {isLoading ? (
          <Skeleton height={140} />
        ) : list.length === 0 ? (
          <EmptyState icon="FlaskConical" title={t("dashboard.noRuns")} />
        ) : (
          <>
            <div style={s.metricsRow}>
              <MetricCard
                label={t("dashboard.metrics.recall")}
                value={latest?.recall == null ? "—" : Math.round(latest.recall * 100)}
                suffix={latest?.recall == null ? undefined : "%"}
              />
              <MetricCard
                label={t("dashboard.metrics.precision")}
                value={latest?.precision == null ? "—" : Math.round(latest.precision * 100)}
                suffix={latest?.precision == null ? undefined : "%"}
              />
              <MetricCard
                label={t("dashboard.metrics.citationAccuracy")}
                value={latest?.citation_accuracy == null ? "—" : Math.round(latest.citation_accuracy * 100)}
                suffix={latest?.citation_accuracy == null ? undefined : "%"}
              />
              <MetricCard
                label={t("dashboard.metrics.tracesPassed")}
                value={tracesPassedPct(latest) ?? "—"}
                suffix={tracesPassedPct(latest) == null ? undefined : "%"}
              />
            </div>

            {list.length >= MIN_BATCHES_FOR_TREND && (
              <div>
                <div style={s.sectionTitle}>{t("dashboard.metricTrend")}</div>
                <LineChart series={metricSeries(list)} yMin={0} yMax={1} />
              </div>
            )}

            <div>
              <div style={s.recentRunsHeader}>
                <div style={s.sectionTitle}>{t("dashboard.recentRuns")}</div>
                <div style={s.compareButtonWrap}>
                  <Button kind="primary" size="sm" disabled={!canCompare} onClick={() => setShowCompare(true)}>
                    {t("compare.compareAction")}
                  </Button>
                </div>
              </div>
              {list.map((b) => (
                <div key={b.id} style={s.historyRow}>
                  <Checkbox checked={selected.includes(b.id)} onChange={() => toggleSelect(b.id)} />
                  <span style={s.historyCell}>{t("dashboard.table.ranAt")}: {new Date(b.started_at).toLocaleString()}</span>
                  <span style={s.historyCell}>v{b.agent_version}</span>
                  <span style={s.historyCell}>{b.recall == null ? "—" : `${Math.round(b.recall * 100)}%`}</span>
                  <span style={s.historyCell}>{b.precision == null ? "—" : `${Math.round(b.precision * 100)}%`}</span>
                  <span style={s.historyCell}>{b.citation_accuracy == null ? "—" : `${Math.round(b.citation_accuracy * 100)}%`}</span>
                  <span style={s.historyCell}>{b.cases_passed}/{b.cases_total}</span>
                  <span style={s.historyCell}>{b.cost_usd == null ? "—" : `$${b.cost_usd.toFixed(4)}`}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>

      {showCompare && older && newer && (
        <CompareRunsPopup
          agentId={agentId}
          older={older}
          newer={newer}
          onClose={() => {
            setShowCompare(false);
            setSelected([]);
          }}
        />
      )}
    </AppShell>
  );
}
