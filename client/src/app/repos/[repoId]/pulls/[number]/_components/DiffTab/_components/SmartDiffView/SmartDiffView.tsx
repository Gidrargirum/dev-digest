/* SmartDiffView — groups the diff into Core logic / Wiring / Boilerplate
   (see ./helpers `classify`/`groupFiles`, deterministic, no model call) and
   renders each group as its own collapsible `DiffViewer`, wired with Smart
   Diff's finding annotations (chips + the "unanchored findings" fallback,
   plus the LARGE file badge).

   Boilerplate is always collapsed on first render — it's the noisiest group
   — but its header still carries a findings count in TEXT (not color alone,
   WCAG AA — see plans/smart-diff.md), so a finding inside a collapsed
   Boilerplate group is never silently invisible (requirement 5). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, type IconName } from "@devdigest/ui";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import { DiffViewer, LARGE_FILE_LINES, type DiffAnnotationApi, type DiffFindingMark } from "@/components/diff-viewer";
import { groupFiles, findingsByPath, type SmartDiffGroupView } from "./helpers";
import { s } from "./styles";

const GROUP_ICON: Record<SmartDiffGroupView["role"], IconName> = {
  core: "Code",
  wiring: "Workflow",
  boilerplate: "Boxes",
};

const GROUP_LABEL_KEY: Record<SmartDiffGroupView["role"], string> = {
  core: "smartDiff.groupCore",
  wiring: "smartDiff.groupWiring",
  boilerplate: "smartDiff.groupBoilerplate",
};

// Boilerplate starts collapsed; Core logic and Wiring start expanded.
const INITIAL_OPEN: Record<SmartDiffGroupView["role"], boolean> = {
  core: true,
  wiring: true,
  boilerplate: false,
};

interface SmartDiffViewProps {
  files: PrFile[];
  reviews: ReviewRecord[];
  /** Same handler DiffViewer/FileCard already call: opens the finding's
   *  card, nothing else — no popup, no external link. */
  onOpenFinding: (id: string) => void;
}

export function SmartDiffView({ files, reviews, onOpenFinding }: SmartDiffViewProps) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(INITIAL_OPEN);

  const filesByPath = React.useMemo(() => new Map(files.map((f) => [f.path, f])), [files]);
  const groups = React.useMemo(() => groupFiles(files), [files]);

  const marksByPath = React.useMemo(() => {
    const raw = findingsByPath(reviews);
    const adapted = new Map<string, DiffFindingMark[]>();
    for (const [path, marks] of raw) {
      adapted.set(
        path,
        marks.map(({ id, startLine, endLine, severity, title }) => ({ id, startLine, endLine, severity, title })),
      );
    }
    return adapted;
  }, [reviews]);

  const annotations: DiffAnnotationApi = React.useMemo(
    () => ({ marksByPath, onOpenFinding, largeFileLines: LARGE_FILE_LINES }),
    [marksByPath, onOpenFinding],
  );

  return (
    <div>
      {groups.map((group) => {
        const groupFilesList = group.files
          .map((f) => filesByPath.get(f.path))
          .filter((f): f is PrFile => f != null);
        const additions = group.files.reduce((sum, f) => sum + f.additions, 0);
        const deletions = group.files.reduce((sum, f) => sum + f.deletions, 0);
        const findingsCount = group.files.reduce(
          (sum, f) => sum + (marksByPath.get(f.path)?.length ?? 0),
          0,
        );
        const isOpen = open[group.role];
        const GroupIcon = Icon[GROUP_ICON[group.role]];

        return (
          <div key={group.role} style={s.group}>
            <button
              type="button"
              style={s.groupHeader}
              aria-expanded={isOpen}
              onClick={() => setOpen((prev) => ({ ...prev, [group.role]: !prev[group.role] }))}
            >
              <Icon.ChevronRight
                size={13}
                style={{ transform: isOpen ? "rotate(90deg)" : "none", color: "var(--text-muted)" }}
              />
              <GroupIcon size={14} style={{ color: "var(--text-muted)" }} />
              <span style={s.groupTitle}>{t(GROUP_LABEL_KEY[group.role])}</span>
              <span style={s.groupSummary}>
                {t("smartDiff.groupSummary", {
                  files: group.files.length,
                  additions,
                  deletions,
                  findings: findingsCount,
                })}
              </span>
              {findingsCount > 0 && (
                <span style={s.groupFindingsCount}>
                  <Icon.AlertTriangle size={12} />
                  {findingsCount}
                </span>
              )}
            </button>
            {isOpen && (
              <div style={s.groupBody}>
                <DiffViewer files={groupFilesList} annotations={annotations} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
