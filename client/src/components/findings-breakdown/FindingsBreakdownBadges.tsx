/* FindingsBreakdownBadges — the per-severity counters shown in the PR list's
   FINDINGS column and on each row of the Agent runs timeline. A severity with
   no findings is not rendered at all; nothing at all renders as an em dash. */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingsBreakdown } from "@devdigest/shared";
import { BREAKDOWN_ORDER } from "./constants";
import { totalFindings } from "./helpers";
import { s } from "./styles";

export function FindingsBreakdownBadges({
  counts,
  emptyLabel = "—",
}: {
  counts: FindingsBreakdown | null | undefined;
  /** What to show when there is nothing to count. */
  emptyLabel?: string;
}) {
  if (totalFindings(counts) === 0) return <span style={s.empty}>{emptyLabel}</span>;
  return (
    <span style={s.row}>
      {BREAKDOWN_ORDER.map(({ key, severity }) => {
        const n = counts![key];
        if (n === 0) return null;
        const sev = SEV[severity];
        const I = Icon[sev.icon];
        return (
          <span key={key} style={s.counter(sev.c)} aria-label={`${sev.label}: ${n}`}>
            <I size={13} />
            <span className="tnum">{n}</span>
          </span>
        );
      })}
    </span>
  );
}

export default FindingsBreakdownBadges;
