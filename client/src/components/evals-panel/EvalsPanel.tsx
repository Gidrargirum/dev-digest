/* EvalsPanel — the case list + metric cards + Run/Edit/Delete/New actions
   shared by the agent editor's "Evals" tab (AC-10/AC-11) and the skill
   detail view's "Evals" tab (AC-55, Amendment A). Promoted to the shared
   layer because a skill screen is a different feature from the agent editor
   and `src/components/` may not be reached across features — this is the
   second consumer that triggers promotion (frontend-architecture). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Badge, EmptyState, Skeleton, Card, Icon } from "@devdigest/ui";
import type { EvalCase, EvalOwnerKind } from "@devdigest/shared";
import { EvalCaseEditor } from "@/components/eval-case-editor";
import {
  useEvalCases,
  useSkillEvalCases,
  useEvalBatches,
  useSkillEvalBatches,
  useEvalBatch,
  useRunEvalCase,
  useDeleteEvalCase,
  useDeleteSkillEvalCase,
  useRunAgentEvalBatch,
  useRunSkillEvalBatch,
} from "@/lib/hooks/eval";
import { useToast } from "@/lib/toast";
import { runsByCase, caseRunSummary, caseMarginalText } from "./helpers";
import { s } from "./styles";

export function EvalsPanel({
  ownerKind,
  ownerId,
  baselineAgentId,
  skillName,
}: {
  ownerKind: EvalOwnerKind;
  ownerId: string;
  /** Amendment A — threaded to a freshly created skill case as its initial
   *  baseline-agent suggestion (AC-38); meaningless for `ownerKind === "agent"`. */
  baselineAgentId?: string;
  /** Amendment A — used to pre-fill a new skill case's name (AC-59). */
  skillName?: string;
}) {
  const t = useTranslations("eval");
  const toast = useToast();
  const isSkill = ownerKind === "skill";

  // Both branches' hooks are always called (rules of hooks); each is
  // `enabled` only for its own ownerKind, so the unused branch never fetches.
  const agentCases = useEvalCases(!isSkill ? ownerId : null);
  const skillCases = useSkillEvalCases(isSkill ? ownerId : null);
  const { data: cases, isLoading } = isSkill ? skillCases : agentCases;

  const agentBatches = useEvalBatches(!isSkill ? ownerId : null);
  const skillBatches = useSkillEvalBatches(isSkill ? ownerId : null);
  const { data: batches } = isSkill ? skillBatches : agentBatches;
  const latestBatch = batches?.[0] ?? null;

  // Owner-agnostic (`GET /eval-runs/:batchId`) — reused unchanged for both.
  const { data: batchDetail } = useEvalBatch(latestBatch?.id);
  const latestRuns = React.useMemo(() => runsByCase(batchDetail?.runs ?? []), [batchDetail]);

  const runCase = useRunEvalCase();
  const deleteAgentCase = useDeleteEvalCase(!isSkill ? ownerId : null);
  const deleteSkillCase = useDeleteSkillEvalCase(isSkill ? ownerId : null);
  const deleteCase = isSkill ? deleteSkillCase : deleteAgentCase;

  const runAgentBatch = useRunAgentEvalBatch(!isSkill ? ownerId : null);
  const runSkillBatch = useRunSkillEvalBatch(isSkill ? ownerId : null);
  const { run: runAllEvals, isRunning: allEvalsRunning } = isSkill ? runSkillBatch : runAgentBatch;

  const [editing, setEditing] = React.useState<EvalCase | null>(null);
  const [creating, setCreating] = React.useState(false);
  // `runCase` is one shared mutation for every row — `runCase.isPending` alone
  // can't tell rows apart, so every row's Run button lit up together whenever
  // any one of them was clicked. Track which case is actually running instead.
  const [runningCaseId, setRunningCaseId] = React.useState<string | null>(null);
  // A batch ("Run eval (N)") already executes every case sequentially, so a
  // per-case Run click while it's in flight would start a SECOND, overlapping
  // batch over the same cases — confusing results, wasted provider calls.
  // Symmetrically, block the batch button while a single case is running.
  // Neither used to know about the other, so all six buttons stayed clickable
  // regardless of what was already running.
  const anyRunning = allEvalsRunning || runningCaseId !== null;

  const runOne = (caseId: string) => {
    if (anyRunning) return;
    setRunningCaseId(caseId);
    runCase.mutate(caseId, {
      onSuccess: () => toast.success(t("evalsTab.run")),
      onError: () => toast.error(t("errors.unreachable")),
      onSettled: () => setRunningCaseId((current) => (current === caseId ? null : current)),
    });
  };

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={24} width={200} />
        <Skeleton height={140} />
      </div>
    );
  }

  const hasCases = (cases ?? []).length > 0;
  const editorProps = { ownerKind, ownerId, baselineAgentId, skillName };

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <h2 style={s.h2}>{t("evalsTab.metricsTitle")}</h2>
        {hasCases && (
          <Button
            kind="secondary"
            size="sm"
            icon="Play"
            loading={allEvalsRunning}
            disabled={anyRunning}
            onClick={() => !anyRunning && runAllEvals()}
          >
            {allEvalsRunning ? t("dashboard.running") : t("dashboard.runEval", { count: cases?.length ?? 0 })}
          </Button>
        )}
        <Button kind="primary" size="sm" icon="Plus" onClick={() => setCreating(true)}>
          {t("evalsTab.newCase")}
        </Button>
      </div>

      {isSkill && hasCases && <div style={s.costWarning}>{t("caseEditor.skillCostWarning")}</div>}

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
              const marginal = caseMarginalText(c, latestRuns);
              return (
                <div key={c.id} style={s.caseRow}>
                  <Badge color={c.expectation_type === "must_find" ? "var(--accent)" : "var(--warn)"} mono>
                    {c.expectation_type === "must_find" ? "MUST FIND" : "MUST NOT FLAG"}
                  </Badge>
                  <div style={s.caseNameCol}>
                    <span style={s.caseName}>{c.name}</span>
                    {marginal && <span style={s.caseMarginal}>{marginal}</span>}
                  </div>
                  {summary ? (
                    <>
                      <span style={s.caseStatus(summary.pass)}>
                        {summary.pass == null ? (
                          <Icon.Dot size={14} />
                        ) : summary.pass ? (
                          <Icon.CheckCircle size={14} />
                        ) : (
                          <Icon.XCircle size={14} />
                        )}
                        {summary.pass == null ? "—" : summary.pass ? t("evalsTab.passed") : t("evalsTab.failed")}
                      </span>
                      <span style={s.caseMeta}>
                        {`expected ${summary.expected} finding(s), got ${summary.got}${
                          summary.recallPct == null ? "" : t("evalsTab.recallSuffix", { recall: summary.recallPct })
                        }`}
                      </span>
                    </>
                  ) : (
                    <span style={s.caseMeta}>{t("evalsTab.neverRun")}</span>
                  )}
                  <div style={s.caseActions}>
                    <Button
                      kind="ghost"
                      size="sm"
                      icon="Play"
                      loading={runningCaseId === c.id}
                      disabled={anyRunning && runningCaseId !== c.id}
                      onClick={() => runOne(c.id)}
                    >
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

      {editing && <EvalCaseEditor {...editorProps} evalCase={editing} onClose={() => setEditing(null)} />}
      {creating && <EvalCaseEditor {...editorProps} onClose={() => setCreating(false)} />}
    </div>
  );
}
