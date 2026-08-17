/* ConventionCard — one extracted house-rule: the rule text (inline-editable),
   the grounding evidence (path:line-line + snippet), a measured confidence bar
   with the percentage AS TEXT, and the accept/reject triage column. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, FormField, Icon, ProgressBar, Textarea } from "@devdigest/ui";
import type { ConventionCandidate } from "@devdigest/shared";
import { ApiError } from "@/lib/api";
import { usePatchConvention } from "@/lib/hooks/conventions";
import { COPIED_RESET_MS, RULE_EDITOR_ROWS } from "./constants";
import { confidenceColor, confidencePct, evidenceLocation } from "./helpers";
import { s } from "./styles";

export function ConventionCard({ candidate, repoId }: { candidate: ConventionCandidate; repoId: string }) {
  const t = useTranslations("conventions");
  const patch = usePatchConvention();
  const [editing, setEditing] = React.useState(false);
  const [draftRule, setDraftRule] = React.useState(candidate.rule);
  const [saveError, setSaveError] = React.useState<string | null>(null);
  const [copied, setCopied] = React.useState(false);

  // "Copied" is transient: reset it on a timer that dies with the component.
  React.useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), COPIED_RESET_MS);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const pct = confidencePct(candidate.confidence);
  const location = evidenceLocation(candidate);
  const accepted = candidate.status === "accepted";
  const rejected = candidate.status === "rejected";

  const setStatus = (status: "pending" | "accepted" | "rejected") =>
    patch.mutate({ id: candidate.id, repoId, patch: { status } });

  const startEdit = () => {
    setDraftRule(candidate.rule);
    setSaveError(null);
    setEditing(true);
  };

  const cancelEdit = () => {
    setSaveError(null);
    setEditing(false);
  };

  // The editor closes on success only: a failed PATCH must not swallow text the
  // user typed, so the draft stays put and the failure is shown in place.
  const saveRule = () => {
    setSaveError(null);
    patch.mutate(
      { id: candidate.id, repoId, patch: { rule: draftRule } },
      {
        onSuccess: () => setEditing(false),
        onError: (err) =>
          setSaveError(err instanceof ApiError ? err.message : t("card.saveError")),
      },
    );
  };

  const copyLocation = () => {
    // Outside a secure context `navigator.clipboard` is undefined and the write
    // rejects — never claim "Copied" for a copy that did not happen.
    const write = navigator.clipboard?.writeText(location);
    if (!write) return;
    void write.then(() => setCopied(true)).catch(() => setCopied(false));
  };

  return (
    <div style={s.card(candidate.status)}>
      <div style={s.main}>
        {editing ? (
          <div>
            <FormField label={t("card.ruleLabel")}>
              <Textarea value={draftRule} onChange={setDraftRule} rows={RULE_EDITOR_ROWS} />
            </FormField>
            {saveError && (
              <div role="alert" style={s.editError}>
                {saveError}
              </div>
            )}
            <div style={s.editRow}>
              <Button
                kind="primary"
                size="sm"
                icon="Check"
                onClick={saveRule}
                disabled={patch.isPending}
              >
                {patch.isPending ? t("card.saving") : t("card.save")}
              </Button>
              <Button kind="ghost" size="sm" onClick={cancelEdit}>
                {t("card.cancel")}
              </Button>
            </div>
          </div>
        ) : (
          <div style={s.ruleRow}>
            <div style={s.rule}>{candidate.rule}</div>
            <button type="button" onClick={startEdit} aria-label={t("card.editRule")} style={s.iconBtn}>
              <Icon.Edit size={14} />
            </button>
          </div>
        )}

        <div>
          <div style={s.evidenceHeader}>
            <span className="mono" title={t("card.evidenceLocation")} style={s.evidencePath}>
              {location}
            </span>
            <button
              type="button"
              onClick={copyLocation}
              aria-label={t("card.copyLocation")}
              title={copied ? t("card.copied") : t("card.copyLocation")}
              style={s.iconBtn}
            >
              {copied ? <Icon.Check size={13} /> : <Icon.Copy size={13} />}
            </button>
          </div>
          <pre className="mono" style={s.snippet}>
            {candidate.evidence_snippet}
          </pre>
        </div>

        <div style={s.confidenceRow}>
          <span style={s.confidenceLabel}>{t("card.confidence")}</span>
          <div style={s.confidenceBar}>
            <ProgressBar value={pct} color={confidenceColor(candidate.confidence)} />
          </div>
          <span className="mono tnum" style={s.confidenceValue}>
            {t("card.confidencePct", { pct })}
          </span>
        </div>

        <div style={s.metaRow}>
          <Badge>{t(`card.category.${candidate.category}`)}</Badge>
          <Badge>
            {t("card.corroboration", {
              support: candidate.support,
              violations: candidate.violations,
            })}
          </Badge>
        </div>
      </div>

      {/* Triage state is never colour-only: the label switches with the status
          and `aria-pressed` carries it to assistive tech. */}
      <div style={s.side}>
        <Button
          kind={accepted ? "primary" : "secondary"}
          size="sm"
          icon="Check"
          full
          aria-pressed={accepted}
          disabled={patch.isPending}
          onClick={() => setStatus(accepted ? "pending" : "accepted")}
        >
          {accepted ? t("card.accepted") : t("card.accept")}
        </Button>
        <Button
          kind={rejected ? "danger" : "ghost"}
          size="sm"
          icon="X"
          full
          aria-pressed={rejected}
          disabled={patch.isPending}
          onClick={() => setStatus(rejected ? "pending" : "rejected")}
        >
          {rejected ? t("card.rejected") : t("card.reject")}
        </Button>
      </div>
    </div>
  );
}
