/* SkillCard — mirrors AgentCard: icon box, name, enabled toggle, delete,
   2-line description clamp, type/source meta row. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useDeleteSkill } from "@/lib/hooks/skills";
import { sourceIcon, typeColor } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  sk,
  active,
  onClick,
  onToggle,
}: {
  sk: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const needsVetting = sk.source !== "manual" && !sk.enabled;
  const SourceIcon = Icon[sourceIcon(sk.source)];

  return (
    <div onClick={onClick} style={s.card(!!active, sk.enabled)}>
      <div style={s.headerRow}>
        <div style={s.iconBox}>
          <Icon.Sparkles size={15} />
        </div>
        <span className="mono" style={s.name}>
          {sk.name}
        </span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={sk.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            if (window.confirm(`Delete skill "${sk.name}"? This cannot be undone.`)) del.mutate(sk.id);
          }}
          disabled={del.isPending}
          title="Delete skill"
          aria-label="Delete skill"
          style={s.deleteBtn}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{sk.description}</div>
      <div style={s.metaRow}>
        <Badge color={typeColor(sk.type)}>{t(`listItem.type.${sk.type}`)}</Badge>
        <span style={s.sourceChip}>
          <SourceIcon size={12} />
          {t(`listItem.source.${sk.source}`)}
        </span>
        {needsVetting && (
          <span style={s.vettingBadge} title={t("listItem.vettingTitle")}>
            {t("listItem.needsVetting")}
          </span>
        )}
      </div>
    </div>
  );
}
