/* FindingsPanel — severity filter + hide-low-confidence + j/k navigation +
   FindingCard list, wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, Icon, SEV, type Severity } from "@devdigest/ui";
import type { FindingRecord, PrFile } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { EvalCaseEditor } from "@/components/eval-case-editor";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION, FILTERABLE_SEVERITIES } from "./constants";
import { visibleFindings, severityCounts, buildEvalSeed } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  targetFindingId = null,
  targetNonce = 0,
  agentId = null,
  prTitle = "",
  prBody = null,
  prFiles = [],
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
  /** From a `?finding=<id>` deep link (via ReviewRunAccordion). When this id
   *  is one of `findings`, focuses + scrolls to its card once `targetNonce`
   *  changes — it moves `focusIdx` through the SAME mechanism j/k navigation
   *  uses, rather than adding a second highlight system. */
  targetFindingId?: string | null;
  targetNonce?: number;
  /** The review's agent (owns any eval case created via "Turn into eval
   *  case" — AC-1). `null` for legacy CI-imported reviews with no agent_id;
   *  the action stays wired but has no agent to attribute the case to. */
  agentId?: string | null;
  /** The PR's own title/body/files — already loaded by the page, threaded
   *  down so "Turn into eval case" can seed a real `input_diff`/`input_meta`
   *  (AC-5) instead of opening the editor empty. */
  prTitle?: string;
  prBody?: string | null;
  prFiles?: PrFile[];
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [evalSeedFinding, setEvalSeedFinding] = React.useState<FindingRecord | null>(null);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const counts = React.useMemo(() => severityCounts(findings, hideLow), [findings, hideLow]);
  const shown = React.useMemo(
    () => visibleFindings(findings, hideLow, severity),
    [findings, hideLow, severity],
  );
  const [pendingScrollId, setPendingScrollId] = React.useState<string | null>(null);

  // A chip whose severity disappears (findings actioned away, or "hide low
  // confidence" flipped on) would otherwise leave the panel filtered to an
  // empty set with no chip rendered to switch it off.
  React.useEffect(() => {
    if (severity && !counts[severity]) setSeverity(null);
  }, [severity, counts]);

  // Deep-link focus. Gated on `targetNonce` actually changing (via
  // `lastNonceRef`), NOT on `shown` — `shown` reacts to the filters, and
  // re-running this on every change would re-hijack the user's focus and
  // scroll position every time they adjust one by hand.
  const lastNonceRef = React.useRef(0);
  React.useEffect(() => {
    if (!targetFindingId || targetNonce === lastNonceRef.current) return;
    if (!findings.some((f) => f.id === targetFindingId)) return;
    lastNonceRef.current = targetNonce;
    // The target might be filtered out by either filter — drop both so its
    // card actually renders.
    setHideLow(false);
    setSeverity(null);
    const ordered = visibleFindings(findings, false);
    const idx = ordered.findIndex((f) => f.id === targetFindingId);
    if (idx !== -1) setFocusIdx(idx);
    setPendingScrollId(targetFindingId);
  }, [targetFindingId, targetNonce, findings]);

  // Scrolls once the target's card is actually in the DOM — separated from
  // the effect above because the state resets there haven't committed yet
  // when that effect runs, so the card may not exist until `shown` updates.
  React.useEffect(() => {
    if (!pendingScrollId) return;
    const el = listRef.current?.querySelector<HTMLElement>(
      `[data-finding-id="${pendingScrollId}"]`,
    );
    if (el) {
      el.scrollIntoView({ behavior: "smooth", block: "center" });
      setPendingScrollId(null);
    }
  }, [shown, pendingScrollId]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  const chips = FILTERABLE_SEVERITIES.filter((sev) => (counts[sev] ?? 0) > 0);

  return (
    <div>
      <div style={s.toolbar}>
        {chips.map((sev) => {
          const tone = SEV[sev];
          const I = Icon[tone.icon];
          const active = severity === sev;
          return (
            <button
              key={sev}
              type="button"
              aria-pressed={active}
              // Toggles off when it is already the active filter, so the chip
              // is both the way in and the way out — there is no separate
              // "clear" control to look for.
              onClick={() => {
                setSeverity(active ? null : sev);
                setFocusIdx(0);
              }}
              style={s.chip(tone.c, tone.bg, active)}
            >
              <I size={13} />
              <span className="tnum">{counts[sev]}</span>
              {tone.label}
            </button>
          );
        })}
        {chips.length > 0 && <span style={s.divider} />}

        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      <div ref={listRef} style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              expandSignal={f.id === targetFindingId ? targetNonce : undefined}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onTurnIntoEvalCase={agentId ? () => setEvalSeedFinding(f) : undefined}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>

      {agentId && evalSeedFinding && (
        <EvalCaseEditor
          ownerKind="agent"
          ownerId={agentId}
          seed={buildEvalSeed(evalSeedFinding, { title: prTitle, body: prBody, files: prFiles })}
          onClose={() => setEvalSeedFinding(null)}
        />
      )}
    </div>
  );
}
