/* IntentCard — derived PR intent (Overview tab). Renders only when an intent
   has been computed; a null intent means "no card", not an error/empty state,
   mirroring the Description block above it.

   The Risk Areas section is driven by the PR Brief (`brief.risks`), not the
   Intent — an accordion below the scope columns (AC-22). Hidden when there is
   no Brief or it flags no risks. `risk.severity` is deliberately not shown. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Badge, Icon } from "@devdigest/ui";
import type { Brief, PrIntentRecord, Risk } from "@devdigest/shared";
import { parseFileRef } from "../../helpers";
import { RISK_KIND_ICON } from "./constants";
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

function RiskRow({
  risk,
  onOpenFile,
}: {
  risk: Risk;
  onOpenFile?: (path: string, line: number | null) => void;
}) {
  const [open, setOpen] = React.useState(false);
  // Total lookup over the wire enum — a drifted kind still renders an icon.
  const iconName = RISK_KIND_ICON[risk.kind] ?? RISK_KIND_ICON.other;
  const RiskIcon = Icon[iconName];

  return (
    <li style={s.riskRow}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setOpen((v) => !v);
          }
        }}
        style={s.riskHeader}
      >
        <RiskIcon size={14} />
        <span style={s.riskTitle}>{risk.title}</span>
        <Icon.ChevronDown size={15} style={s.chevron(open)} />
      </div>
      {risk.file_refs.length > 0 && (
        <div style={s.riskRefs}>
          {risk.file_refs.map((ref, i) => {
            const { path, line } = parseFileRef(ref);
            return (
              <button
                key={`${ref}:${i}`}
                type="button"
                style={s.riskRef}
                onClick={() => onOpenFile?.(path, line)}
              >
                {ref}
              </button>
            );
          })}
        </div>
      )}
      {open && (
        <div style={s.riskBody}>
          <p style={s.riskExplanation}>{risk.explanation}</p>
        </div>
      )}
    </li>
  );
}

export function IntentCard({
  intent,
  brief,
  onOpenFile,
}: {
  intent: PrIntentRecord;
  brief?: Brief | null;
  onOpenFile?: (path: string, line: number | null) => void;
}) {
  const t = useTranslations("prReview");
  // Total lookup on purpose: `confidence` arrives over the wire, and a value
  // outside the enum must not turn a rendering concern into a crash.
  const confidence = confidenceColors[intent.confidence] ?? confidenceColors.low!;
  const risks = brief?.risks ?? [];

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

        {risks.length > 0 && (
          <div style={s.riskSection}>
            <div style={s.columnTitle("var(--warn)")}>
              <Icon.AlertTriangle size={14} />
              {t("intent.riskAreas")}
            </div>
            <ul style={s.riskList}>
              {risks.map((risk, i) => (
                <RiskRow key={`${risk.kind}:${risk.title}:${i}`} risk={risk} onOpenFile={onOpenFile} />
              ))}
            </ul>
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
