"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Markdown, Icon, Badge } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { s } from "./styles";

/** Preview tab — rendered Markdown body, with an untrusted-source banner
    for non-manual skills. */
export function PreviewTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  return (
    <div style={s.wrap}>
      {skill.source !== "manual" && (
        <div style={s.notice}>
          <Icon.AlertTriangle size={15} />
          <span style={{ flex: 1 }}>{t("preview.untrustedNotice")}</span>
          <Badge color="var(--warn)" bg="var(--warn-bg)">
            {t("preview.untrustedBadge")}
          </Badge>
        </div>
      )}
      <div style={s.card}>
        <Markdown>{skill.body}</Markdown>
      </div>
    </div>
  );
}
