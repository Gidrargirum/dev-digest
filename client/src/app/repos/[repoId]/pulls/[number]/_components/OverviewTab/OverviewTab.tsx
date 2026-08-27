"use client";

import React from "react";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { usePrIntent } from "@/lib/hooks/reviews";
import { usePrWhyRiskBrief } from "@/lib/hooks";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { WhyRiskBriefCard } from "./_components/WhyRiskBriefCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  /** owner/repo + head sha — passed through to BlastRadiusCard for its
   *  file:line GitHub deep-links. */
  repoFullName?: string | null;
  headSha?: string | null;
  /** Owned by page.tsx — a Review Focus click navigates to Files Changed with
   *  the target line addressed (spec 2026-08-27, AC-27). Optional so existing
   *  render tests that don't exercise navigation still type-check. */
  onOpenLine?: (path: string, line: number) => void;
}

const NOOP = () => {};

export function OverviewTab({
  prId,
  prBody,
  repoFullName,
  headSha,
  onOpenLine,
}: OverviewTabProps) {
  const { data: intent } = usePrIntent(prId);
  // The single access point for brief data (AC-34). `risks[]` render only in
  // the Intent block (AC-25); the PR Brief card never renders them.
  const { data: brief } = usePrWhyRiskBrief(prId);
  const risks = brief?.brief?.risks;
  const risksTotal = brief?.brief?.risks_total;

  return (
    <div style={s.grid}>
      <div style={s.column}>
        <WhyRiskBriefCard prId={prId} onOpenLine={onOpenLine ?? NOOP} />

        {intent && <IntentCard intent={intent} risks={risks} risksTotal={risksTotal} />}

        {prBody && (
          <section>
            <SectionLabel icon="MessageSquare">Description</SectionLabel>
            <div style={s.descriptionBox}>
              <Markdown>{prBody}</Markdown>
            </div>
          </section>
        )}
      </div>

      <BlastRadiusCard prId={prId ?? null} repoFullName={repoFullName} headSha={headSha} />
    </div>
  );
}
