/* CompareRunsPopup — the two-batch comparison (AC-27/AC-28/AC-29): signed
   deltas for recall/precision/citation_accuracy/cost, a textual system-prompt
   diff from the two agent_versions snapshots, and Promote. Deltas carry the
   sign in the text, never colour alone (Accessibility). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Modal, Button, Card } from "@devdigest/ui";
import type { EvalBatch } from "@devdigest/shared";
import { useAgentVersion, usePromoteAgentVersion } from "@/lib/hooks/agents";
import { useToast } from "@/lib/toast";
import { diffLines, signedDelta } from "./helpers";
import { MODAL_WIDTH } from "./constants";
import { s } from "./styles";

export function CompareRunsPopup({
  agentId,
  older,
  newer,
  onClose,
}: {
  agentId: string;
  older: EvalBatch;
  newer: EvalBatch;
  onClose: () => void;
}) {
  const t = useTranslations("eval");
  const toast = useToast();
  const { data: versionA } = useAgentVersion(agentId, older.agent_version);
  const { data: versionB } = useAgentVersion(agentId, newer.agent_version);
  const promote = usePromoteAgentVersion(agentId);

  const lines = versionA && versionB ? diffLines(versionA.config.system_prompt, versionB.config.system_prompt) : [];

  const doPromote = async (version: number) => {
    try {
      await promote.mutateAsync(version);
      toast.success(t("compare.promoted", { version }));
      onClose();
    } catch {
      toast.error(t("errors.unreachable"));
    }
  };

  const costDelta =
    older.cost_usd != null && newer.cost_usd != null ? (newer.cost_usd - older.cost_usd).toFixed(4) : "—";

  return (
    <Modal
      width={MODAL_WIDTH}
      title={t("compare.title")}
      subtitle={t("compare.subtitle", { a: `v${older.agent_version}`, b: `v${newer.agent_version}` })}
      onClose={onClose}
    >
      <div style={s.body}>
        <div style={s.deltaRow}>
          <Card style={s.deltaCard}>
            <div style={s.deltaValue(newer.recall != null && older.recall != null && newer.recall >= older.recall, older.recall == null || newer.recall == null)}>
              {signedDelta(older.recall, newer.recall)}
            </div>
            <div style={s.deltaLabel}>{t("compare.recall")}</div>
          </Card>
          <Card style={s.deltaCard}>
            <div
              style={s.deltaValue(
                newer.precision != null && older.precision != null && newer.precision >= older.precision,
                older.precision == null || newer.precision == null,
              )}
            >
              {signedDelta(older.precision, newer.precision)}
            </div>
            <div style={s.deltaLabel}>{t("compare.precision")}</div>
          </Card>
          <Card style={s.deltaCard}>
            <div
              style={s.deltaValue(
                newer.citation_accuracy != null &&
                  older.citation_accuracy != null &&
                  newer.citation_accuracy >= older.citation_accuracy,
                older.citation_accuracy == null || newer.citation_accuracy == null,
              )}
            >
              {signedDelta(older.citation_accuracy, newer.citation_accuracy)}
            </div>
            <div style={s.deltaLabel}>{t("compare.citationAccuracy")}</div>
          </Card>
          <Card style={s.deltaCard}>
            <div style={s.deltaValue(false, older.cost_usd == null || newer.cost_usd == null)}>${costDelta}</div>
            <div style={s.deltaLabel}>{t("compare.cost")}</div>
          </Card>
        </div>

        <div>
          <div style={s.sectionTitle}>{t("compare.systemPromptDiff")}</div>
          <div style={s.diffBox}>
            {lines.map((l, i) => (
              <div key={i} style={s.diffLine(l.type)}>
                {(l.type === "add" ? "+ " : l.type === "del" ? "- " : "  ") + l.text}
              </div>
            ))}
          </div>
        </div>

        <div style={s.promoteRow}>
          <Button kind="secondary" disabled={promote.isPending} onClick={() => doPromote(older.agent_version)}>
            {promote.isPending ? t("compare.promoting") : `${t("compare.promote")} v${older.agent_version}`}
          </Button>
          <Button kind="primary" disabled={promote.isPending} onClick={() => doPromote(newer.agent_version)}>
            {promote.isPending ? t("compare.promoting") : `${t("compare.promote")} v${newer.agent_version}`}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
