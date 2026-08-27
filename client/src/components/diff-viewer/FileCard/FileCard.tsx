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
import { resolveTarget, ts, TARGET_LINE_ID, type DiffTargetApi } from "../targeting";
import { s, chevronFor } from "../styles";
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
  targeting,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  annotations?: DiffAnnotationApi;
  targeting?: DiffTargetApi;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Line addressing (spec 2026-08-27). `TargetState` is computed during render
  // from props + `lines` — never stored via useEffect (that would be derived
  // state). When this file is targeted the card is forced open even if a large
  // file would otherwise collapse under AUTO_EXPAND_MAX_LINES (AC-28).
  const targetState = resolveTarget(file.path, lines, targeting);
  const cardRef = React.useRef<HTMLDivElement>(null);
  const isOpen = open || targetState !== "none";

  React.useEffect(() => {
    if (targetState === "none") return;
    // Synchronizing with an external system (the DOM scroll position) — the
    // legitimate useEffect case.
    const id = window.setTimeout(() => {
      const anchoredEl =
        targetState === "anchored" ? document.getElementById(TARGET_LINE_ID) : null;
      (anchoredEl ?? cardRef.current)?.scrollIntoView({ block: "center", behavior: "smooth" });
      targeting?.onResolved?.(targetState === "anchored" ? "anchored" : "unanchored");
    }, 0);
    return () => window.clearTimeout(id);
  }, [targetState, targeting]);

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

  return (
    <div ref={cardRef} style={isLarge ? { ...s.fileCard, ...s.fileCardLarge } : s.fileCard}>
      <div onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(isOpen)} />
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
      {isOpen && (
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
                isTarget={
                  targetState === "anchored" &&
                  targeting?.line != null &&
                  (ln.newNo === targeting.line || ln.oldNo === targeting.line)
                }
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
          {/* The deep-link target line fell outside every rendered hunk (or the
              patch is absent): say so in the card footer, next to the
              unanchored finding-chip block, per AC-29's precedent. */}
          {targetState === "unanchored" && (
            <div style={ts.unanchoredNote}>{t("diffViewer.targetLineUnavailable")}</div>
          )}
        </div>
      )}
    </div>
  );
}
