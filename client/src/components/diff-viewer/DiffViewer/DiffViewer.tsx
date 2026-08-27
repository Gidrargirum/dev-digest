/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffAnnotationApi } from "../annotations";
import { type DiffTargetApi } from "../targeting";
import { s } from "../styles";
import { FileCard } from "../FileCard";

export function DiffViewer({
  files,
  commenting,
  annotations,
  targeting,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** Smart Diff finding marks + large-file badge. Optional, exactly like
   *  `commenting` — `undefined` leaves normal-mode rendering unchanged. */
  annotations?: DiffAnnotationApi;
  /** A file/line to scroll to and mark. Optional, exactly like `commenting` —
   *  `undefined` leaves rendering unchanged (spec 2026-08-27, AC-28/AC-29). */
  targeting?: DiffTargetApi;
}) {
  const t = useTranslations("shell");
  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard
          key={i}
          file={f}
          commenting={commenting}
          annotations={annotations}
          targeting={targeting}
        />
      ))}
    </div>
  );
}
