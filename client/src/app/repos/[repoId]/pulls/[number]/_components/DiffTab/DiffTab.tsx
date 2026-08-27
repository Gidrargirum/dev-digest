"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Button } from "@devdigest/ui";
import { DiffViewer, type DiffCommentApi } from "@/components/diff-viewer";
import type { DiffTarget } from "@/lib/hooks/diff-target";
import { usePrComments, useCreatePrComment } from "@/lib/hooks/reviews";
import { notify } from "@/lib/toast";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { SmartDiffView } from "./_components/SmartDiffView";
import { affectedFilesCount } from "./_components/SmartDiffView/helpers";
import { sumChangedLines } from "./helpers";
import { s } from "./styles";
import type { DiffMode } from "./constants";

interface DiffTabProps {
  prId: string | null;
  filesCount: number;
  files: PrFile[];
  reviews: ReviewRecord[];
  /** Inline commenting is offered only on open PRs (GitHub rejects otherwise). */
  canComment?: boolean;
  /** Owned by page.tsx, kept in `?diffMode=` so it survives a round trip
   *  through the Agent runs tab. Defaults to "normal" (see ./constants). */
  diffMode: DiffMode;
  /** A file/line to scroll to in the diff (Review Focus deep-link, AC-28). */
  target?: DiffTarget | null;
  onSetDiffMode: (mode: DiffMode) => void;
  /** Deep-links straight to the finding's card — routed through page.tsx's
   *  batched `setParams` (tab + finding + clearing diffMode in one replace). */
  onOpenFinding: (id: string) => void;
}

export function DiffTab({
  prId,
  filesCount,
  files,
  reviews,
  canComment,
  diffMode,
  target,
  onSetDiffMode,
  onOpenFinding,
}: DiffTabProps) {
  const t = useTranslations("shell");
  const { data: comments } = usePrComments(prId);
  const create = useCreatePrComment(prId);
  // Comments start hidden so the diff is clean by default — toggle to reveal.
  const [showComments, setShowComments] = React.useState(false);

  const commentCount = comments?.length ?? 0;

  const commenting: DiffCommentApi = {
    comments: comments ?? [],
    canComment: !!canComment && !!prId,
    showComments,
    posting: create.isPending,
    onSubmit: async (input) => {
      try {
        const res = await create.mutateAsync(input);
        setShowComments(true); // a just-posted comment shouldn't stay hidden
        return res;
      } catch (err) {
        notify.error(err instanceof Error ? err.message : "Couldn't post the comment to GitHub.");
        throw err;
      }
    },
  };

  const { additions, deletions } = sumChangedLines(files);

  return (
    <section>
      <SectionLabel
        icon="Code"
        right={
          <div style={s.headerRight}>
            {commentCount > 0 && (
              <Button
                kind="ghost"
                size="sm"
                icon={showComments ? "EyeOff" : "Eye"}
                onClick={() => setShowComments((v) => !v)}
              >
                {showComments ? "Hide comments" : "Show comments"} ({commentCount})
              </Button>
            )}
            <div style={s.modeSwitch}>
              <Button
                kind={diffMode === "normal" ? "primary" : "ghost"}
                size="sm"
                active={diffMode === "normal"}
                onClick={() => onSetDiffMode("normal")}
              >
                {t("smartDiff.normalMode")}
              </Button>
              <Button
                kind={diffMode === "smart" ? "primary" : "ghost"}
                size="sm"
                icon="Sparkles"
                active={diffMode === "smart"}
                onClick={() => onSetDiffMode("smart")}
              >
                {t("smartDiff.smartMode")}
              </Button>
            </div>
          </div>
        }
      >
        {diffMode === "smart"
          ? t("smartDiff.smartFilesSummary", {
              count: affectedFilesCount(files),
              additions,
              deletions,
            })
          : t("smartDiff.filesSummary", { count: filesCount })}
      </SectionLabel>
      {diffMode === "smart" && !target ? (
        <SmartDiffView files={files} reviews={reviews} onOpenFinding={onOpenFinding} />
      ) : (
        // A line is not addressable in smart mode — a target forces normal.
        <DiffViewer
          files={files}
          commenting={commenting}
          targeting={target ?? undefined}
        />
      )}
    </section>
  );
}
