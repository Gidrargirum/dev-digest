"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Modal, Skeleton } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useRestoreSkillVersion } from "@/lib/hooks/skills";
import { useToast } from "@/lib/toast";
import { diffLines } from "./helpers";
import { s } from "./styles";

/** Versions tab — newest-first history with per-row Diff/Restore actions. */
export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const toast = useToast();
  const { data: versions, isLoading } = useSkillVersions(skill.id);
  const restore = useRestoreSkillVersion();
  const [diffAgainst, setDiffAgainst] = React.useState<SkillVersion | null>(null);

  const doRestore = (version: number) =>
    restore.mutate(
      { id: skill.id, version },
      { onSuccess: (data) => toast.success(t("versions.restored", { version: data.version })) },
    );

  return (
    <div style={s.wrap}>
      <h2 style={s.heading}>{t("versions.heading")}</h2>
      <p style={s.explainer}>{t("versions.explainer")}</p>

      {isLoading && <Skeleton height={140} />}
      {!isLoading && (versions ?? []).length === 0 && (
        <div style={{ fontSize: 13, color: "var(--text-muted)" }}>{t("versions.empty")}</div>
      )}
      {(versions ?? []).map((v) => {
        const isCurrent = v.version === skill.version;
        return (
          <div key={v.version} style={s.row}>
            <Badge mono color="var(--text-secondary)">
              {t("preview.version", { version: v.version })}
            </Badge>
            <span style={s.date}>{new Date(v.created_at).toLocaleDateString()}</span>
            <div style={s.versionBadge} />
            {isCurrent ? (
              <Badge color="var(--ok)">{t("versions.current")}</Badge>
            ) : (
              <div style={s.actions}>
                <Button kind="secondary" size="sm" onClick={() => setDiffAgainst(v)}>
                  {t("versions.diff")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="History"
                  disabled={restore.isPending}
                  onClick={() => doRestore(v.version)}
                >
                  {restore.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
              </div>
            )}
          </div>
        );
      })}

      {diffAgainst && (
        <Modal
          width={780}
          title={t("versions.diffTitle", { from: diffAgainst.version, to: skill.version })}
          onClose={() => setDiffAgainst(null)}
        >
          <pre className="mono" style={s.diffPre}>
            {diffLines(diffAgainst.body, skill.body).map((line, i) => (
              <div key={i} style={s.diffLine(line.kind)}>
                {line.text || " "}
              </div>
            ))}
          </pre>
        </Modal>
      )}
    </div>
  );
}
