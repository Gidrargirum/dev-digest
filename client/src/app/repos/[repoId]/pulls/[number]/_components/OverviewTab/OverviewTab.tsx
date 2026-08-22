"use client";

import React from "react";
import { SectionLabel } from "@devdigest/ui";
import { usePrIntent } from "@/lib/hooks/reviews";
import { IntentCard } from "./_components/IntentCard";
import { s } from "./styles";

interface OverviewTabProps {
  prId: string | null | undefined;
  prBody: string | null | undefined;
}

export function OverviewTab({ prId, prBody }: OverviewTabProps) {
  const { data: intent } = usePrIntent(prId);

  return (
    <div style={s.column}>
      {intent && <IntentCard intent={intent} />}

      {prBody && (
        <section>
          <SectionLabel icon="MessageSquare">Description</SectionLabel>
          <div style={s.descriptionBox}>{prBody}</div>
        </section>
      )}
    </div>
  );
}
