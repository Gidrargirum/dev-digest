/* BlastTab — read-only impact map for a PR's diff: which symbols were
   declared in the changed files, who calls them, and which endpoints/crons
   might be affected (up to two hops of the reverse import graph). Every fact
   comes from the repo-intel index via GET /pulls/:id/blast — no model call.
   Tree view only; "Prior PRs touching these files" and the Graph toggle are
   deferred (specs/blast-radius.md). */
"use client";

import React from "react";
import { Badge, EmptyState, ErrorState, Icon, MonoLink, Skeleton } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks/blast";
import type { DownstreamImpact } from "@devdigest/shared";
import { PARTIAL_NOTE_PREFIX } from "./constants";
import { callerHref } from "./helpers";
import { s } from "./styles";

interface BlastTabProps {
  prId: string | null;
  /** owner/repo + head sha — used to deep-link a caller's file:line to GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
}

interface DownstreamEntryProps {
  impact: DownstreamImpact;
  expanded: boolean;
  onToggle: () => void;
  repoFullName?: string | null;
  headSha?: string | null;
}

function DownstreamEntry({ impact, expanded, onToggle, repoFullName, headSha }: DownstreamEntryProps) {
  return (
    <li style={s.entry}>
      <div
        role="button"
        tabIndex={0}
        aria-expanded={expanded}
        onClick={onToggle}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            onToggle();
          }
        }}
        style={s.entryHeader}
      >
        <span style={s.entrySymbol}>{impact.symbol}</span>
        <div style={s.entryMeta}>
          <Badge icon="Users">{impact.callers.length} callers</Badge>
          <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
        </div>
      </div>

      {expanded && (
        <div style={s.entryBody}>
          {impact.callers.length > 0 && (
            <div>
              <ul style={s.callerList}>
                {impact.callers.map((caller) => (
                  <li key={`${caller.file}:${caller.line}:${caller.name}`} style={s.callerRow}>
                    <MonoLink href={callerHref(repoFullName, headSha, caller.file, caller.line)}>
                      {caller.file}:{caller.line}
                    </MonoLink>
                    <span style={s.callerName}>{caller.name}</span>
                  </li>
                ))}
              </ul>
              {impact.callers_truncated && (
                <div style={s.truncatedNote}>
                  Caller list truncated — more callers exist than shown here.
                </div>
              )}
            </div>
          )}

          {impact.endpoints_affected.length > 0 && (
            <div>
              <div style={s.sectionTitle}>Endpoints affected</div>
              <div style={s.chipRow}>
                {impact.endpoints_affected.map((endpoint) => (
                  <Badge key={endpoint} icon="Globe" mono>
                    {endpoint}
                  </Badge>
                ))}
              </div>
            </div>
          )}

          {impact.crons_affected.length > 0 && (
            <div>
              <div style={s.sectionTitle}>Crons affected</div>
              <div style={s.chipRow}>
                {impact.crons_affected.map((cron) => (
                  <Badge key={cron} icon="Clock" mono>
                    {cron}
                  </Badge>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </li>
  );
}

export function BlastTab({ prId, repoFullName, headSha }: BlastTabProps) {
  const { data, isLoading, isError, refetch } = usePrBlast(prId);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());

  const toggle = React.useCallback((symbol: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  if (isLoading) {
    return (
      <div style={s.loading}>
        <Skeleton height={20} width={280} />
        <Skeleton height={120} />
      </div>
    );
  }

  if (isError || !data) {
    return (
      <ErrorState
        title="Couldn't load the blast radius"
        body="Something went wrong fetching downstream impact for this PR."
        onRetry={() => refetch()}
      />
    );
  }

  const { status, reason, blast, counts } = data;

  return (
    <section>
      <div role="group" aria-label="Impact counts" style={s.countsRow}>
        <Badge icon="Code">{counts.symbols} symbols</Badge>
        <Badge icon="Users">{counts.callers} callers</Badge>
        <Badge icon="Globe">{counts.endpoints} endpoints</Badge>
        <Badge icon="Clock">{counts.crons} crons</Badge>
      </div>

      {status === "partial" && reason && (
        <div style={s.partialNote}>
          <Icon.AlertTriangle size={14} />
          <span>
            {PARTIAL_NOTE_PREFIX} {reason} — some callers may be missing, the index is partial.
          </span>
        </div>
      )}

      {status === "degraded" ? (
        <EmptyState
          icon="Workflow"
          title="Blast radius unavailable"
          body={reason ?? "This repo hasn't been indexed yet."}
        />
      ) : blast && blast.downstream.length > 0 ? (
        <ul style={s.list}>
          {blast.downstream.map((impact) => (
            <DownstreamEntry
              key={impact.symbol}
              impact={impact}
              expanded={expanded.has(impact.symbol)}
              onToggle={() => toggle(impact.symbol)}
              repoFullName={repoFullName}
              headSha={headSha}
            />
          ))}
        </ul>
      ) : (
        <EmptyState
          icon="Workflow"
          title="No downstream impact found"
          body="No callers, endpoints, or crons were found for the changed symbols."
        />
      )}
    </section>
  );
}
