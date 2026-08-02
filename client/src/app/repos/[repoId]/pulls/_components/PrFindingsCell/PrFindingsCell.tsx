/* PrFindingsCell — the FINDINGS column of the PR list: per-severity counters
   with a hover popover listing the findings themselves.

   The counters come from the list response (`pr.findings_breakdown`); the
   finding details are fetched only once the popover opens, so the list request
   stays small. The popover body is a separate component precisely so mounting
   it is what triggers the fetch. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { FindingsBreakdown } from "@devdigest/shared";
import { FindingsBreakdownBadges, totalFindings } from "@/components/findings-breakdown";
import { FindingsPopoverList } from "@/components/findings-popover-list";
import { HoverCard } from "@/components/hover-card";
import { usePrReviews } from "@/lib/hooks/reviews";

function PrFindingsPanel({ prId, total }: { prId: string; total: number }) {
  const t = useTranslations("prReview");
  const { data, isPending, isError } = usePrReviews(prId);
  const findings = (data ?? []).flatMap((r) => r.findings);
  return (
    <FindingsPopoverList
      findings={findings}
      title={t("findingsPopover.title", { count: total })}
      loading={isPending}
      error={isError}
    />
  );
}

export function PrFindingsCell({
  prId,
  counts,
}: {
  prId: string | null | undefined;
  counts: FindingsBreakdown | null | undefined;
}) {
  const t = useTranslations("prReview");
  const total = totalFindings(counts);
  // Nothing to hover over when there are no findings — keep the plain em dash.
  if (total === 0 || !prId) return <FindingsBreakdownBadges counts={counts} />;
  return (
    <HoverCard
      label={t("findingsPopover.trigger")}
      panel={<PrFindingsPanel prId={prId} total={total} />}
    >
      <FindingsBreakdownBadges counts={counts} />
    </HoverCard>
  );
}

export default PrFindingsCell;
