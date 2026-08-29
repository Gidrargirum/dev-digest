/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type DiffAnnotationApi, type DiffFindingMark } from "../annotations";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor, targetRowHighlight } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { FindingMarks } from "../FindingMarks";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  marks,
  annotations,
  highlightLine,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** Smart Diff finding marks anchored to this line (empty when
   *  `annotations` is undefined — plain diff mode is unaffected). */
  marks?: DiffFindingMark[];
  annotations?: DiffAnnotationApi;
  /** Deep-link target line (AC-25) — flash this row and scroll it into view
   *  while set. `null` in every non-deep-link render. */
  highlightLine?: number | null;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);
  const rowRef = React.useRef<HTMLDivElement>(null);
  const isHit =
    highlightLine != null &&
    (ln.newNo === highlightLine || (ln.newNo == null && ln.oldNo === highlightLine));
  React.useEffect(() => {
    if (isHit) rowRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [isHit]);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;

  return (
    <div
      ref={rowRef}
      aria-current={isHit ? "location" : undefined}
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={isHit ? { ...lineRowFor(ln.kind), ...targetRowHighlight } : lineRowFor(ln.kind)}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {annotations && marks && marks.length > 0 && (
        <FindingMarks marks={marks} onOpenFinding={annotations.onOpenFinding} />
      )}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}
    </div>
  );
}
