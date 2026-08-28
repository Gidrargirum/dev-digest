/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon } from "@devdigest/ui";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES } from "../constants";
import { parsePatch, isLargeFile, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { partitionMarks, marksForLine, as, type DiffAnnotationApi } from "../annotations";
import { s, chevronFor, targetFileHighlight } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { FindingMarks } from "../FindingMarks";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  annotations,
  isTarget = false,
  targetLine = null,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  /** This card is the `?file=` deep-link target (AC-25/28): expand if
   *  collapsed, scroll into view, and flash the target line. */
  isTarget?: boolean;
  targetLine?: number | null;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);
  const hasTargetLine =
    targetLine != null &&
    lines.some(
      (line) =>
        line.newNo === targetLine ||
        (line.newNo == null && line.oldNo === targetLine),
    );
  // A URL target expands the card without copying derived prop state into the
  // user's collapse preference. Removing the target restores that preference.
  const expanded = open || isTarget;

  // Deep-link target handling. Kept pending until this card is mounted (it
  // always is, once rendered) — expand, scroll, and flash the line for a few
  // seconds; `file`/`line` stay in the URL after the flash fades (AC-26).
  const cardRef = React.useRef<HTMLDivElement>(null);
  const [flash, setFlash] = React.useState(false);
  React.useEffect(() => {
    if (!isTarget) return;
    setFlash(true);
    // A rendered target line owns scrolling through CodeLine. Scrolling the
    // whole card afterwards would override it in long files; the card fallback
    // is only for file-only links or line numbers absent from the patch.
    const scrollId = !hasTargetLine
      ? window.setTimeout(() => {
          cardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
        }, 60)
      : undefined;
    const fadeId = window.setTimeout(() => setFlash(false), 2500);
    return () => {
      if (scrollId !== undefined) window.clearTimeout(scrollId);
      window.clearTimeout(fadeId);
    };
  }, [hasTargetLine, isTarget, targetLine]);
  const highlightLine = isTarget && flash && hasTargetLine ? targetLine : null;

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  // Same idea for Smart Diff's finding marks: anchor to a rendered line when
  // possible, else surface in the "unanchored findings" footer below — this
  // is the fallback the seeded PR #482 (patch = NULL on every file) needs to
  // be clickable at all (see plans/smart-diff.md).
  const fileMarks = annotations?.marksByPath.get(file.path);
  const { anchored: anchoredMarks, unanchored: unanchoredMarks } = React.useMemo(() => {
    if (!fileMarks) return { anchored: new Map(), unanchored: [] };
    return partitionMarks(fileMarks, lines);
  }, [fileMarks, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  const isLarge = !!annotations && isLargeFile(file, annotations.largeFileLines);
  const cardStyle = {
    ...s.fileCard,
    ...(isLarge ? s.fileCardLarge : {}),
    ...(isTarget && flash && !hasTargetLine ? targetFileHighlight : {}),
  };

  return (
    <div ref={cardRef} style={cardStyle}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(expanded)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {isLarge && (
          <span style={as.largeBadge}>
            <Icon.AlertTriangle size={12} />
            {t("diffViewer.largeBadge", { lines: (file.additions ?? 0) + (file.deletions ?? 0) })}
          </span>
        )}
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
      </div>
      {expanded && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                marks={marksForLine(ln, anchoredMarks)}
                annotations={annotations}
                highlightLine={highlightLine}
              />
            ))
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {annotations && unanchoredMarks.length > 0 && (
            <div style={as.unanchoredWrap}>
              <span style={as.unanchoredTitle}>
                {t("diffViewer.unanchoredTitle", { count: unanchoredMarks.length })}
              </span>
              <FindingMarks marks={unanchoredMarks} onOpenFinding={annotations.onOpenFinding} />
            </div>
          )}
        </div>
      )}
    </div>
  );
}
