/* WhyRiskBriefCard — the PR Brief on the Overview tab
   (spec 2026-08-27-pr-why-risk-brief). Renders `what`, `why`, the risk-level
   indicator and the Review Focus block. `risks[]` is NOT rendered here (AC-24)
   — its only home is the Intent block. Brief text is rendered as plain text
   (JSX escaping); never Markdown, never dangerouslySetInnerHTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Skeleton, ErrorState, Button, Badge, Icon } from "@devdigest/ui";
import type { PrWhyRiskBrief } from "@/lib/types";
import { ApiError } from "@/lib/api";
import { usePrWhyRiskBrief, useRegeneratePrBrief } from "@/lib/hooks";
import { RISK_LEVEL } from "./constants";
import { focusRef } from "./helpers";
import { s } from "./styles";

/** Section wrapper — module-level so it is a stable component identity, not a
 *  factory recreated on every render of the card. */
function BriefFrame({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section>
      <SectionLabel icon="Target">{title}</SectionLabel>
      {children}
    </section>
  );
}

interface Props {
  prId: string | null | undefined;
  /** Owned by page.tsx (the page owns navigation) — one batched navigation to
   *  Files Changed with the target line addressed (AC-27). */
  onOpenLine: (path: string, line: number) => void;
}

export function WhyRiskBriefCard({ prId, onOpenLine }: Props) {
  const t = useTranslations("prReview");
  const { data, isLoading, isError, refetch } = usePrWhyRiskBrief(prId);
  const regen = useRegeneratePrBrief(prId);

  // AC-37: the reader decides when the content changes. `accepted` is the
  // version currently on screen; a newer poll result is surfaced as a notice,
  // not swapped in. One effect adopts the first brief — not a derived-state
  // chain.
  const [accepted, setAccepted] = React.useState<PrWhyRiskBrief | null>(null);
  const incoming = data?.brief ?? null;
  React.useEffect(() => {
    if (incoming && !accepted) setAccepted(incoming);
  }, [incoming, accepted]);

  const startRegen = () => regen.mutate(undefined, { onSuccess: () => void refetch() });
  const rateLimited =
    regen.error instanceof ApiError && regen.error.status === 429 ? regen.error : null;

  if (isLoading && !data) {
    return (
      <BriefFrame title={t("whyRiskBrief.title")}>
        <div style={s.card}>
          <Skeleton height={16} width={120} />
          <Skeleton height={40} />
          <Skeleton height={40} />
        </div>
      </BriefFrame>
    );
  }

  if (isError) {
    return (
      <BriefFrame title={t("whyRiskBrief.title")}>
        <div style={s.card}>
          <ErrorState
            title={t("whyRiskBrief.errorTitle")}
            onRetry={() => void refetch()}
          />
        </div>
      </BriefFrame>
    );
  }

  if (!incoming && !accepted) {
    // AC-33 — an explicit state with a way out, unlike the intent card.
    return (
      <BriefFrame title={t("whyRiskBrief.title")}>
        <div style={s.card}>
          <p style={s.bodyText}>{t("whyRiskBrief.notGeneratedTitle")}</p>
          <p style={s.truncNote}>{t("whyRiskBrief.notGeneratedBody")}</p>
          <div>
            <Button
              kind="secondary"
              size="sm"
              icon="Sparkles"
              disabled={regen.isPending || !prId}
              onClick={startRegen}
            >
              {regen.isPending ? t("whyRiskBrief.regenerating") : t("whyRiskBrief.generate")}
            </Button>
          </div>
        </div>
      </BriefFrame>
    );
  }

  const shown = (accepted ?? incoming) as PrWhyRiskBrief;
  const hasUpdate =
    !!accepted &&
    !!incoming &&
    (accepted.pr_state_key !== incoming.pr_state_key ||
      accepted.computed_at !== incoming.computed_at);
  const level = RISK_LEVEL[shown.risk_level] ?? RISK_LEVEL.low;
  // Total lookup: `risk_level` arrives over the wire and is not parsed on the
  // client (client insight, 2026-08-19) — an out-of-enum value must not crash.
  const levelLabel: Record<string, string> = {
    high: t("whyRiskBrief.riskLevelValue.high"),
    medium: t("whyRiskBrief.riskLevelValue.medium"),
    low: t("whyRiskBrief.riskLevelValue.low"),
  };
  const focusTruncated = shown.review_focus_total > shown.review_focus.length;

  const regenLabel = regen.isPending
    ? t("whyRiskBrief.regenerating")
    : rateLimited
      ? t("whyRiskBrief.rateLimited", { seconds: rateLimited.retryAfter ?? 60 })
      : t("whyRiskBrief.regenerate");

  return (
    <BriefFrame title={t("whyRiskBrief.title")}>
      <div style={s.card}>
        {hasUpdate && (
          <div style={s.updatedNotice} role="status">
            <Icon.RefreshCw size={14} />
            <span>{t("whyRiskBrief.updatedTitle")}</span>
            <Button kind="ghost" size="sm" onClick={() => setAccepted(incoming)}>
              {t("whyRiskBrief.updatedAction")}
            </Button>
          </div>
        )}

        <div style={s.levelRow}>
          <Badge color={level.color} bg={level.bg} icon={level.icon} style={s.levelBadge}>
            {levelLabel[shown.risk_level] ?? levelLabel.low}
          </Badge>
        </div>

        <div style={s.block}>
          <span style={s.blockTitle}>{t("whyRiskBrief.what")}</span>
          <p style={s.bodyText}>{shown.what}</p>
        </div>
        <div style={s.block}>
          <span style={s.blockTitle}>{t("whyRiskBrief.why")}</span>
          <p style={s.bodyText}>{shown.why}</p>
        </div>

        <div style={s.block}>
          <span style={s.blockTitle}>{t("whyRiskBrief.reviewFocus")}</span>
          <ul style={s.focusList}>
            {shown.review_focus.map((f, i) => (
              <li key={`${f.path}:${f.line}:${i}`}>
                <button
                  type="button"
                  style={s.focusButton}
                  aria-label={t("whyRiskBrief.reviewFocusEntry", {
                    path: f.path,
                    line: f.line,
                    reason: f.reason,
                  })}
                  onClick={() => onOpenLine(f.path, f.line)}
                >
                  <span className="mono" style={s.focusRef}>
                    {focusRef(f.path, f.line)}
                  </span>
                  <span style={s.focusReason}>{f.reason}</span>
                </button>
              </li>
            ))}
          </ul>
          {focusTruncated && (
            <span style={s.truncNote}>
              {t("whyRiskBrief.reviewFocusShowing", {
                shown: shown.review_focus.length,
                total: shown.review_focus_total,
              })}
            </span>
          )}
        </div>

        <div style={s.footer}>
          {shown.sources.length > 0 && (
            <span style={s.sources}>
              {t("whyRiskBrief.sources", { list: shown.sources.join(", ") })}
            </span>
          )}
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            disabled={regen.isPending || !!rateLimited || !prId}
            onClick={startRegen}
          >
            {regenLabel}
          </Button>
        </div>
      </div>
    </BriefFrame>
  );
}
