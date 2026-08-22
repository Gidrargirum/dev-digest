/* FindingMarks — a row of clickable finding chips. Used both under a
   rendered diff line (anchored findings) and in FileCard's "unanchored
   findings" footer (findings whose line never rendered, e.g. an empty
   `patch`). A click does exactly one thing: `onOpenFinding(id)` — no popup,
   no `window.open`, no GitHub link. */
"use client";

import React from "react";
import { SeverityBadge, type Severity } from "@devdigest/ui";
import { as, type DiffFindingMark } from "../annotations";

export function FindingMarks({
  marks,
  onOpenFinding,
}: {
  marks: DiffFindingMark[];
  onOpenFinding: (id: string) => void;
}) {
  if (marks.length === 0) return null;
  return (
    <div style={as.marksRow}>
      {marks.map((m) => (
        <button
          key={m.id}
          type="button"
          aria-label={`Open finding: ${m.title}`}
          onClick={() => onOpenFinding(m.id)}
          style={as.chip}
        >
          <SeverityBadge severity={m.severity as Severity} compact />
          <span style={as.chipTitle}>{m.title}</span>
        </button>
      ))}
    </div>
  );
}
