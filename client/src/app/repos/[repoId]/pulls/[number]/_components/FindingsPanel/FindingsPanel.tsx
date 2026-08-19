/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "../FindingCard";
import { useFindingAction } from "@/lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import { visibleFindings } from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
  targetFindingId = null,
  targetNonce = 0,
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
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const listRef = React.useRef<HTMLDivElement | null>(null);

  const shown = React.useMemo(() => visibleFindings(findings, hideLow), [findings, hideLow]);
  const [pendingScrollId, setPendingScrollId] = React.useState<string | null>(null);

  // Deep-link focus. Gated on `targetNonce` actually changing (via
  // `lastNonceRef`), NOT on `shown` — `shown` reacts to the hideLow toggle,
  // and re-running this on every toggle would re-hijack the user's focus and
  // scroll position every time they flip "hide low confidence" by hand.
  const lastNonceRef = React.useRef(0);
  React.useEffect(() => {
    if (!targetFindingId || targetNonce === lastNonceRef.current) return;
    if (!findings.some((f) => f.id === targetFindingId)) return;
    lastNonceRef.current = targetNonce;
    // The target might be filtered out by "hide low confidence" — drop the
    // toggle so its card actually renders.
    setHideLow(false);
    const ordered = visibleFindings(findings, false);
    const idx = ordered.findIndex((f) => f.id === targetFindingId);
    if (idx !== -1) setFocusIdx(idx);
    setPendingScrollId(targetFindingId);
  }, [targetFindingId, targetNonce, findings]);

  // Scrolls once the target's card is actually in the DOM — separated from
  // the effect above because `setHideLow(false)` there hasn't committed yet
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

  return (
    <div>
      <div style={s.toolbar}>
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
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>
    </div>
  );
}
