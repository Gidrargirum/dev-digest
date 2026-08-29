/* EvalsTab — the agent editor's "Evals" tab (AC-10/AC-11): the case list with
   its MUST FIND / MUST NOT FLAG badge and most-recent-run summary, metric
   cards from the latest batch, and Run/Edit/Delete/New case actions. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, EmptyState, Skeleton, Card } from "@devdigest/ui";
import type { Agent, EvalCase } from "@devdigest/shared";
import { EvalCaseEditor } from "@/components/eval-case-editor";
import { useEvalCases, useEvalBatches, useEvalBatch, useRunEvalCase, useDeleteEvalCase, useStartEvalBatch } from "@/lib/hooks/eval";
import { useToast } from "@/lib/toast";
import { runsByCase, caseRunSummary } from "./helpers";
import { s } from "./styles";

export function EvalsTab({ agent }: { agent: Agent }) {
  const t = useTranslations("eval");
  const toast = useToast();
  const { data: cases, isLoading } = useEvalCases(agent.id);
  const { data: batches } = useEvalBatches(agent.id);
  const latestBatch = batches?.[0] ?? null;
  const { data: batchDetail } = useEvalBatch(latestBatch?.id);
  const latestRuns = React.useMemo(() => runsByCase(batchDetail?.runs ?? []), [batchDetail]);

  const runCase = useRunEvalCase();
  const deleteCase = useDeleteEvalCase(agent.id);
  const startBatch = useStartEvalBatch(agent.id);

  const [editing, setEditing] = React.useState<EvalCase | null>(null);
  const [creating, setCreating] = React.useState(false);

  const runOne = (caseId: string) =>
    runCase.mutate(caseId, {
      onSuccess: () => toast.success(t("evalsTab.run")),
      onError: () => toast.error(t("errors.unreachable")),
    });

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={140} />
      </div>
    );
  }

  const hasCases = (cases ?? []).length > 0;

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
        {hasCases && (
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            loading={startBatch.isPending}
            onClick={() => startBatch.mutate()}
          >
            {t("dashboard.runEval", { count: cases?.length ?? 0 })}
          </Button>
        )}
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
          {t("evalsTab.newCase")}
        </Button>
      </div>

      {!hasCases ? (
        <EmptyState icon="FlaskConical" title={t("evalsTab.emptyCases")} />
      ) : (
        <>
          {latestBatch && (
            <div style={s.metricsRow}>
              <Card style={s.metricCard}>
                <div style={s.metricValue}>
                  {latestBatch.recall == null ? "—" : `${Math.round(latestBatch.recall * 100)}%`}
                </div>
                <div style={s.metricLabel}>{t("dashboard.metrics.recall")}</div>
              </Card>
              <Card style={s.metricCard}>
                <div style={s.metricValue}>
                  {latestBatch.precision == null ? "—" : `${Math.round(latestBatch.precision * 100)}%`}
                </div>
                <div style={s.metricLabel}>{t("dashboard.metrics.precision")}</div>
              </Card>
              <Card style={s.metricCard}>
                <div style={s.metricValue}>
                  {latestBatch.citation_accuracy == null ? "—" : `${Math.round(latestBatch.citation_accuracy * 100)}%`}
                </div>
                <div style={s.metricLabel}>{t("dashboard.metrics.citationAccuracy")}</div>
              </Card>
            </div>
          )}

          <div>
            <h3 style={s.sectionTitle}>{t("evalsTab.casesHeading")}</h3>
            {(cases ?? []).map((c) => {
              const summary = caseRunSummary(c, latestRuns);
              return (
                <div key={c.id} style={s.caseRow}>
                  <Badge color={c.expectation_type === "must_find" ? "var(--accent)" : "var(--warn)"} mono>
                    {c.expectation_type === "must_find" ? "MUST FIND" : "MUST NOT FLAG"}
                  </Badge>
                  <span style={s.caseName}>{c.name}</span>
                  <span style={s.caseMeta}>
                    {summary
                      ? `expected ${summary.expected} finding(s), got ${summary.got}${
                          summary.recallPct == null ? "" : t("evalsTab.recallSuffix", { recall: summary.recallPct })
                        }`
                      : t("evalsTab.neverRun")}
                  </span>
                  <div style={s.caseActions}>
                    <Button kind="ghost" size="sm" icon="Play" loading={runCase.isPending} onClick={() => runOne(c.id)}>
                      {t("evalsTab.run")}
                    </Button>
                    <Button kind="ghost" size="sm" icon="Edit" onClick={() => setEditing(c)}>
                      {t("evalsTab.edit")}
                    </Button>
                    <Button
                      kind="ghost"
                      size="sm"
                      icon="Trash"
                      onClick={() => window.confirm(t("evalsTab.confirmDelete")) && deleteCase.mutate(c.id)}
                    >
                      {t("evalsTab.delete")}
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}

      {editing && <EvalCaseEditor agentId={agent.id} evalCase={editing} onClose={() => setEditing(null)} />}
      {creating && <EvalCaseEditor agentId={agent.id} onClose={() => setCreating(false)} />}
    </div>
  );
}
