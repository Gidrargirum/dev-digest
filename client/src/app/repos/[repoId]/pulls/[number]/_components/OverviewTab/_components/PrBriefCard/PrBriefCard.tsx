/* PrBriefCard — the full-width PR Brief block above the Intent/Blast grid
   (AC-18). Shows the model's `what` / `why` and a coloured risk rail, plus
   review metrics (score/verdict/cost/tokens/duration) resolved from the run
   history by `brief.run_id` — never from the Brief itself (AC-19).

   States: loading skeleton · error card (stays mounted, retry via the same
   control — AC-30) · "no Brief yet" nudge (AC-21) · full card. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import type { PrBriefRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import { useRegenerateBrief } from "@/lib/hooks/brief";
import { useRunReview } from "@/lib/hooks/reviews";
import { RISK_RAIL } from "./constants";
import { resolveBriefMetrics } from "./helpers";
import { MetricsRow } from "./MetricsRow";
import { s } from "./styles";

interface BriefState {
  loading: boolean;
  error: boolean;
  value: PrBriefRecord | null;
  onRetry: () => void;
}

interface BriefMetrics {
  runs: RunSummary[];
  reviews: ReviewRecord[];
}

interface ReviewAction {
  onStart?: () => void;
  onStarted?: () => void;
}

interface PrBriefCardProps {
  prId: string | null;
  state: BriefState;
  metrics: BriefMetrics;
  reviewAction?: ReviewAction;
}

export function PrBriefCard({
  prId,
  state,
  metrics,
  reviewAction,
}: PrBriefCardProps) {
  const t = useTranslations("prReview");
  const regen = useRegenerateBrief(prId);
  const runReview = useRunReview();

  const header = <SectionLabel icon="Sparkles">{t("brief.title")}</SectionLabel>;

  if (state.loading) {
    return (
      <section>
        {header}
        <div style={s.card}>
          <div style={s.loading}>
            <Skeleton height={18} width={320} />
            <Skeleton height={64} />
            <Skeleton height={40} />
          </div>
        </div>
      </section>
    );
  }

  if (state.error) {
    return (
      <section>
        {header}
        <div style={s.card}>
          <ErrorState
            title={t("brief.errorTitle")}
            body={t("brief.errorBody")}
            onRetry={state.onRetry}
          />
        </div>
      </section>
    );
  }

  if (!state.value) {
    return (
      <section>
        {header}
        <div style={s.card}>
          <div style={s.nudge}>
            <span style={s.nudgeTitle}>{t("brief.nudgeTitle")}</span>
            <p style={s.nudgeBody}>{t("brief.nudgeBody")}</p>
            <Button
              kind="primary"
              size="sm"
              icon="Sparkles"
              disabled={!prId || runReview.isPending}
              loading={runReview.isPending}
              onClick={() => {
                if (!prId) return;
                reviewAction?.onStart?.();
                runReview.mutate(
                  { prId, all: true },
                  { onSuccess: () => reviewAction?.onStarted?.() },
                );
              }}
            >
              {t("runReview.runReview")}
            </Button>
          </div>
        </div>
      </section>
    );
  }

  const brief = state.value;
  const rail = RISK_RAIL[brief.risk_level] ?? RISK_RAIL.medium!;
  const resolvedMetrics = resolveBriefMetrics(brief, metrics.runs, metrics.reviews);

  const regenerate = () => regen.mutate();

  return (
    <section>
      {header}
      <div style={s.card}>
        <div style={s.railRow}>
          <div style={s.rail(rail.rail)} aria-hidden="true" />
          <div style={s.railBody}>
            <div>
              <div style={s.fieldLabel("var(--text-muted)")}>{t("brief.whatLabel")}</div>
              <p style={s.fieldText}>{brief.what}</p>
            </div>
            <div>
              <div style={s.fieldLabel("var(--text-muted)")}>{t("brief.whyLabel")}</div>
              <p style={s.fieldText}>{brief.why}</p>
            </div>
            <span style={s.riskLevel(rail.label)}>
              {t("brief.riskLevel", { level: t(`brief.riskLevelName.${brief.risk_level}`) })}
            </span>
          </div>
        </div>

        <MetricsRow metrics={resolvedMetrics} />

        {regen.isError && (
          <div role="alert" style={s.regenError}>
            <Icon.AlertTriangle size={15} />
            <span>{t("brief.errorTitle")}</span>
          </div>
        )}

        <div style={s.footer}>
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            disabled={regen.isPending || !prId}
            loading={regen.isPending}
            onClick={regenerate}
          >
            {regen.isPending
              ? t("brief.recalculating")
              : regen.isError
                ? t("brief.retry")
                : t("brief.regenerate")}
          </Button>
        </div>
      </div>
    </section>
  );
}
