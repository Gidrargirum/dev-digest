/* FindingsPopoverList — the body of the findings hover popover, shared by the
   PR list's FINDINGS column and the Agent runs timeline. Purely presentational:
   the caller decides where the findings come from and owns loading/error. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  Skeleton,
  SeverityBadge,
  CategoryTag,
  ConfidenceNum,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { sortBySeverity } from "@/components/findings-breakdown";
import { POPOVER_LIMIT } from "./constants";
import { lineLabel } from "./helpers";
import { s } from "./styles";

export function FindingsPopoverList({
  findings,
  title,
  limit = POPOVER_LIMIT,
  loading,
  error,
}: {
  findings: FindingRecord[];
  /** Popover heading, e.g. "6 findings" or "2 findings in this run". */
  title: string;
  limit?: number;
  loading?: boolean;
  error?: boolean;
}) {
  const t = useTranslations("prReview");

  if (loading) {
    return (
      <div style={s.skeletonStack}>
        <Skeleton width="60%" height={12} />
        <Skeleton height={12} />
        <Skeleton width="80%" height={12} />
      </div>
    );
  }
  if (error) return <div style={s.state}>{t("findingsPopover.error")}</div>;

  const sorted = sortBySeverity(findings);
  if (sorted.length === 0) return <div style={s.state}>{t("findingsPopover.empty")}</div>;
  const shown = sorted.slice(0, limit);
  const hidden = sorted.length - shown.length;

  return (
    <div>
      <div style={s.header}>
        <Icon.AlertOctagon size={13} />
        {title}
      </div>
      <div style={s.list}>
        {shown.map((f) => (
          <div key={f.id} style={s.item}>
            <div style={s.titleRow}>
              <SeverityBadge severity={f.severity as Severity} compact />
              <span style={s.title}>{f.title}</span>
              <CategoryTag category={f.category as Category} />
            </div>
            <div style={s.metaRow}>
              <span className="mono" style={s.file}>
                {f.file}:{lineLabel(f.start_line, f.end_line)}
              </span>
              <ConfidenceNum value={f.confidence} />
            </div>
            <div style={s.rationale}>{f.rationale}</div>
          </div>
        ))}
      </div>
      {hidden > 0 && <div style={s.more}>{t("findingsPopover.more", { count: hidden })}</div>}
    </div>
  );
}

export default FindingsPopoverList;
