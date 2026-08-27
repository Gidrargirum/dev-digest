"use client";

import React from "react";
import { Markdown, SectionLabel } from "@devdigest/ui";
import { usePrIntent } from "@/lib/hooks/reviews";
import { IntentCard } from "./_components/IntentCard";
import { BlastRadiusCard } from "./_components/BlastRadiusCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
  /** owner/repo + head sha — passed through to BlastRadiusCard for its
   *  file:line GitHub deep-links. */
  repoFullName?: string | null;
  headSha?: string | null;
}

export function OverviewTab({ prId, prBody, repoFullName, headSha }: OverviewTabProps) {
  const { data: intent } = usePrIntent(prId);

  return (
    <div style={s.grid}>
      <div style={s.column}>
        {intent && <IntentCard intent={intent} />}

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
