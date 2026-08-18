/* IntentCard — derived PR intent (Overview tab). Renders only when an intent
   has been computed; a null intent means "no card", not an error/empty state,
   mirroring the Description block above it. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Icon } from "@devdigest/ui";
import type { PrIntentRecord, IntentConfidence } from "@devdigest/shared";
import { s } from "./styles";

const CONFIDENCE_COLOR: Record<IntentConfidence, { color: string; bg: string }> = {
  low: { color: "var(--text-muted)", bg: "var(--bg-hover)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  high: { color: "var(--sugg)", bg: "var(--sugg-bg)" },
};

export function IntentCard({ intent }: { intent: PrIntentRecord }) {
  const t = useTranslations("prReview");
  // Total lookup on purpose: `confidence` arrives over the wire, and a value
  // outside the enum must not turn a rendering concern into a crash.
  const confidenceColors = CONFIDENCE_COLOR[intent.confidence] ?? CONFIDENCE_COLOR.low;

  return (
    <section>
      <SectionLabel
        icon="Target"
        right={
          <Badge color={confidenceColors.color} bg={confidenceColors.bg}>
            {t("intent.confidence", { level: t(`intent.confidenceLevel.${intent.confidence}`) })}
          </Badge>
        }
      >
        {t("intent.title")}
      </SectionLabel>
      <div style={s.card}>
        <p style={s.quote}>“{intent.intent}”</p>
        <div style={s.columns}>
          <div>
            <div style={s.columnTitle("var(--sugg)")}>
              <Icon.Check size={14} />
              {t("intent.inScope")}
            </div>
            <ul style={s.list}>
              {intent.in_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
          <div>
            <div style={s.columnTitle("var(--crit)")}>
              <Icon.X size={14} />
              {t("intent.outOfScope")}
            </div>
            <ul style={s.list}>
              {intent.out_of_scope.map((item, i) => (
                <li key={i}>{item}</li>
              ))}
            </ul>
          </div>
        </div>
        {intent.risk_areas.length > 0 && (
          <div style={s.riskSection}>
            <div style={s.columnTitle("var(--warn)")}>
              <Icon.AlertTriangle size={14} />
              {t("intent.riskAreas")}
            </div>
            <div style={s.riskChips}>
              {intent.risk_areas.map((area, i) => (
                <Badge key={i} color="var(--warn)" bg="var(--warn-bg)">
                  {area}
                </Badge>
              ))}
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
