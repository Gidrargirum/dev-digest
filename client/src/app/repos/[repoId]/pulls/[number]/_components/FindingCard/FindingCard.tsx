/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  expandSignal,
  onAction,
  pending,
  repoFullName,
  headSha,
  onTurnIntoEvalCase,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  /** Bumping this (e.g. a deep-link nonce) force-expands the card, even if
   *  the user had collapsed it. `0`/`undefined` is "no signal" — mirrors the
   *  targetNonce pattern used by ReviewRunAccordion. */
  expandSignal?: number;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** "Turn into eval case" (AC-1). Undefined when the caller has no agent id
   *  to attribute a case to (e.g. no `onTurnIntoEvalCase` handler wired). */
  onTurnIntoEvalCase?: () => void;
}) {
  const t = useTranslations("prReview");
  const tEval = useTranslations("eval");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  React.useEffect(() => {
    if (expandSignal) setExpanded(true);
  }, [expandSignal]);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
          </div>
          <div style={s.metaRow}>
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              style={accepted ? s.acceptActive : undefined}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              style={dismissed ? s.dismissActive : undefined}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {muted && (
              <Button
                kind="ghost"
                size="sm"
                icon="RefreshCw"
                disabled={pending}
                title={t("finding.reset")}
                aria-label={t("finding.reset")}
                onClick={() => onAction?.("reset")}
              />
            )}
            <Button
              kind="ghost"
              size="sm"
              icon="FlaskConical"
              disabled={!muted}
              title={!muted ? tEval("findingCard.turnIntoEvalCaseDisabled") : undefined}
              onClick={() => onTurnIntoEvalCase?.()}
            >
              {tEval("findingCard.turnIntoEvalCase")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
