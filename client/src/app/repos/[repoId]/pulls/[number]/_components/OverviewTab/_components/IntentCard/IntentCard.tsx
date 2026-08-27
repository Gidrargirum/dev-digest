/* IntentCard — derived PR intent (Overview tab). Renders only when an intent
   has been computed; a null intent means "no card", not an error/empty state,
   mirroring the Description block above it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Icon } from "@devdigest/ui";
import type { PrIntentRecord } from "@devdigest/shared";
import type { BriefRisk } from "@/lib/types";
import { s, confidenceColors } from "./styles";

function ScopeList({ items, muted }: { items: string[]; muted: boolean }) {
  return (
    <ul style={s.list}>
      {items.map((item) => (
        <li key={item} style={s.listItem(muted)}>
          <span style={s.bullet} aria-hidden="true">
            ·
          </span>
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

/** `risks[]` from the Why + Risk Brief — the Intent block is the ONLY place
 *  they render (spec 2026-08-27, AC-25). A flex `<ul>` drops `list-item`
 *  markers silently, so the bullet is a real element, exactly like `ScopeList`
 *  above (client insight, 2026-08-19). */
function RiskList({
  risks,
  risksTotal,
  showingLabel,
}: {
  risks: BriefRisk[];
  risksTotal: number;
  showingLabel: (shown: number, total: number) => string;
}) {
  return (
    <>
      <ul style={s.list}>
        {risks.map((risk, i) => {
          const ref =
            risk.path != null && risk.line != null
              ? `${risk.path}:${risk.line}`
              : risk.path ?? null;
          return (
            <li key={`${risk.title}:${i}`} style={s.listItem(false)}>
              <span style={s.bullet} aria-hidden="true">
                ·
              </span>
              <span>
                {risk.title}
                {ref != null && (
                  <>
                    {" "}
                    <span className="mono" style={s.bullet}>
                      {ref}
                    </span>
                  </>
                )}
              </span>
            </li>
          );
        })}
      </ul>
      {risksTotal > risks.length && (
        <div style={s.listItem(true)}>{showingLabel(risks.length, risksTotal)}</div>
      )}
    </>
  );
}

export function IntentCard({
  intent,
  risks,
  risksTotal,
}: {
  intent: PrIntentRecord;
  /** From the Why + Risk Brief hook in OverviewTab — the card fetches nothing
   *  itself (AC-34). Optional: absent until a brief exists. */
  risks?: BriefRisk[];
  risksTotal?: number;
}) {
  const t = useTranslations("prReview");
  // Total lookup on purpose: `confidence` arrives over the wire, and a value
  // outside the enum must not turn a rendering concern into a crash.
  const confidence = confidenceColors[intent.confidence] ?? confidenceColors.low!;

  return (
    <section>
      <SectionLabel icon="Target">{t("intent.title")}</SectionLabel>
      <div style={s.card}>
        <p style={s.quote}>“{intent.intent}”</p>

        <div style={s.columns}>
          <div>
            <div style={s.columnTitle("var(--sugg)")}>
              <Icon.Check size={14} />
              {t("intent.inScope")}
            </div>
            <ScopeList items={intent.in_scope} muted={false} />
          </div>
          <div>
            {/* Muted, not `--crit`: "out of scope" is a boundary, not a
                problem — red would read as a finding the user must act on. */}
            <div style={s.columnTitle("var(--text-muted)")}>
              <Icon.X size={14} />
              {t("intent.outOfScope")}
            </div>
            <ScopeList items={intent.out_of_scope} muted />
          </div>
        </div>

        {intent.risk_areas.length > 0 && (
          <div style={s.riskSection}>
            <div style={s.columnTitle("var(--warn)")}>
              <Icon.AlertTriangle size={14} />
              {t("intent.riskAreas")}
            </div>
            <div style={s.riskChips}>
              {intent.risk_areas.map((area) => (
                <Badge key={area} color="var(--warn)" bg="var(--warn-bg)" style={s.riskChip}>
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        )}

        {risks && risks.length > 0 && (
          <div style={s.riskSection}>
            <div style={s.columnTitle("var(--crit)")}>
              <Icon.AlertTriangle size={14} />
              {t("intent.risks")}
            </div>
            <RiskList
              risks={risks}
              risksTotal={risksTotal ?? risks.length}
              showingLabel={(shown, total) =>
                t("intent.risksShowing", { shown, total })
              }
            />
          </div>
        )}

        {/* Inside the card, not in the SectionLabel's `right` slot: that slot
            is pinned to the far edge of a full-width row, which detaches the
            badge from the thing it describes. */}
        <div style={s.footer}>
          <Badge color={confidence.color} bg={confidence.bg}>
            {t("intent.confidence", { level: t(`intent.confidenceLevel.${intent.confidence}`) })}
          </Badge>
        </div>
      </div>
    </section>
  );
}
