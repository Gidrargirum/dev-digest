"use client";

import React from "react";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { usePrIntent } from "@/lib/hooks/reviews";
import { usePrBrief } from "@/lib/hooks/brief";
import type { ReviewRecord, RunSummary } from "@devdigest/shared";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { PrBriefCard } from "./_components/PrBriefCard";
import { ReviewFocus } from "./_components/ReviewFocus";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  /** owner/repo + head sha — passed through to BlastRadiusCard for its
   *  file:line GitHub deep-links. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Run history + persisted reviews — the PR Brief card resolves its review
   *  metrics (AC-19) from these, keyed by `brief.run_id`. */
  reviewContext?: { runs: RunSummary[]; reviews: ReviewRecord[] };
  /** Route-level effects shared with the header action; PrBriefCard owns the
   *  actual run mutation through the same `useRunReview` action (AC-21). */
  reviewActions?: { onRunStart?: () => void; onRunsStarted?: () => void };
  /** Opens the normal diff at a file (and optional line) — wired to the Risk
   *  Areas / Review Focus file references (AC-24). */
  onOpenFile?: (path: string, line: number | null) => void;
}

export function OverviewTab({
  prId,
  prBody,
  repoFullName,
  headSha,
  reviewContext,
  reviewActions,
  onOpenFile,
}: OverviewTabProps) {
  const { data: intent } = usePrIntent(prId);
  const briefQuery = usePrBrief(prId, headSha);
  const brief = briefQuery.data?.brief ?? null;

  return (
    <div style={s.wrap}>
      <PrBriefCard
        prId={prId ?? null}
        state={{
          loading: briefQuery.isLoading,
          error: briefQuery.isError && !brief,
          value: brief,
          onRetry: () => void briefQuery.refetch(),
        }}
        metrics={{
          runs: reviewContext?.runs ?? [],
          reviews: reviewContext?.reviews ?? [],
        }}
        reviewAction={{
          onStart: reviewActions?.onRunStart,
          onStarted: reviewActions?.onRunsStarted,
        }}
      />

      <div style={s.grid}>
        <div style={s.column}>
          {intent && <IntentCard intent={intent} brief={brief} onOpenFile={onOpenFile} />}
        </div>

        <BlastRadiusCard prId={prId ?? null} repoFullName={repoFullName} headSha={headSha} />
      </div>

      <ReviewFocus items={brief?.review_focus ?? []} onOpenFile={onOpenFile} />

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>
            <Markdown>{prBody}</Markdown>
          </div>
        </section>
      )}
    </div>
  );
}
