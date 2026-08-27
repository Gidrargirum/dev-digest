/* BlastRadiusCard — read-only impact map for a PR's diff: which symbols were
   declared in the changed files, who calls them, and which endpoints/crons
   might be affected (up to two hops of the reverse import graph). Every fact
   comes from the repo-intel index via GET /pulls/:id/blast — no model call.
   Lives in Overview's right column, next to IntentCard. Ships Tree AND Graph
   views (local toggle, not URL state — this is one card's view preference)
   plus a collapsed-by-default "Prior PRs touching these files" section. */
"use client";

import React from "react";
import { Badge, Button, EmptyState, ErrorState, Icon, MonoLink, SectionLabel, Skeleton } from "@devdigest/ui";
import { usePrBlast } from "@/lib/hooks/blast";
import { MermaidDiagram } from "@/components/mermaid-diagram";
import type { BlastRadius, DownstreamImpact, PriorPrRef } from "@devdigest/shared";
import type { BlastView } from "./constants";
import { PARTIAL_NOTE_PREFIX } from "./constants";
import { buildBlastChart, callerHref, formatPriorPrDate, priorPrHref } from "./helpers";
import { s } from "./styles";

interface BlastRadiusCardProps {
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

/** Graph view — the Mermaid alternative to the Tree's expandable list. Chart
 *  build is pure (helpers.ts) and re-runs only when the underlying blast data
 *  changes; `MermaidDiagram` renders `null` on invalid/empty input, so the
 *  truncation note below it is the only thing keeping a heavily-capped chart
 *  from looking like a blank, broken card. */
function GraphView({ blast }: { blast: BlastRadius }) {
  const { chart, totalNodes, shownNodes } = React.useMemo(() => buildBlastChart(blast), [blast]);

  return (
    <div>
      <MermaidDiagram chart={chart} />
      {shownNodes < totalNodes && (
        <div style={s.graphNote}>
          Showing {shownNodes} of {totalNodes} nodes
        </div>
      )}
    </div>
  );
}

function PriorPrsSection({
  priorPrs,
  expanded,
  onToggle,
  repoFullName,
}: {
  priorPrs: PriorPrRef[];
  expanded: boolean;
  onToggle: () => void;
  repoFullName?: string | null;
}) {
  if (priorPrs.length === 0) return null;

  return (
    <div style={s.priorPrsSection}>
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
        style={s.priorPrsToggle}
      >
        <div style={s.priorPrsToggleLabel}>
          <Icon.Clock size={14} />
          Prior PRs touching these files
        </div>
        <div style={s.priorPrsToggleMeta}>
          <Badge>{priorPrs.length}</Badge>
          <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
        </div>
      </div>

      {expanded && (
        <ul style={s.priorPrsList}>
          {priorPrs.map((pr) => {
            const date = formatPriorPrDate(pr.updated_at);
            return (
              <li key={pr.number} style={s.priorPrRow}>
                <div style={s.priorPrLeft}>
                  <MonoLink href={priorPrHref(repoFullName, pr.number)}>#{pr.number}</MonoLink>
                  <span style={s.priorPrTitle}>{pr.title}</span>
                </div>
                <div style={s.priorPrMeta}>
                  <span>{pr.overlap_count} files</span>
                  {date && <span>{date}</span>}
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

export function BlastRadiusCard({ prId, repoFullName, headSha }: BlastRadiusCardProps) {
  const { data, isLoading, isError, refetch } = usePrBlast(prId);
  const [expanded, setExpanded] = React.useState<ReadonlySet<string>>(new Set());
  const [view, setView] = React.useState<BlastView>("tree");
  const [priorPrsExpanded, setPriorPrsExpanded] = React.useState(false);

  const toggle = React.useCallback((symbol: string) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(symbol)) next.delete(symbol);
      else next.add(symbol);
      return next;
    });
  }, []);

  return (
    <section>
      <SectionLabel icon="Workflow">Blast Radius</SectionLabel>
      <div style={s.card}>
        {isLoading ? (
          <div style={s.loading}>
            <Skeleton height={20} width={280} />
            <Skeleton height={120} />
          </div>
        ) : isError || !data ? (
          <ErrorState
            title="Couldn't load the blast radius"
            body="Something went wrong fetching downstream impact for this PR."
            onRetry={() => refetch()}
          />
        ) : (
          <>
            <div role="group" aria-label="Impact counts" style={s.countsRow}>
              <div style={s.counts}>
                <Badge icon="Code">{data.counts.symbols} symbols</Badge>
                <Badge icon="Users">{data.counts.callers} callers</Badge>
                <Badge icon="Globe">{data.counts.endpoints} endpoints</Badge>
                <Badge icon="Clock">{data.counts.crons} crons</Badge>
              </div>
              <div style={s.viewToggle}>
                <Button kind={view === "tree" ? "primary" : "ghost"} size="sm" onClick={() => setView("tree")}>
                  Tree
                </Button>
                <Button kind={view === "graph" ? "primary" : "ghost"} size="sm" onClick={() => setView("graph")}>
                  Graph
                </Button>
              </div>
            </div>

            {data.status === "partial" && data.reason && (
              <div style={s.partialNote}>
                <Icon.AlertTriangle size={14} />
                <span>
                  {PARTIAL_NOTE_PREFIX} {data.reason} — some callers may be missing, the index is partial.
                </span>
              </div>
            )}

            {data.status === "degraded" || !data.blast || data.blast.downstream.length === 0 ? (
              <EmptyState
                icon="Workflow"
                title={data.status === "degraded" ? "Blast radius unavailable" : "No downstream impact found"}
                body={
                  data.status === "degraded"
                    ? (data.reason ?? "This repo hasn't been indexed yet.")
                    : "No callers, endpoints, or crons were found for the changed symbols."
                }
              />
            ) : view === "tree" ? (
              <ul style={s.list}>
                {data.blast.downstream.map((impact) => (
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
              <GraphView blast={data.blast} />
            )}

            <PriorPrsSection
              priorPrs={data.prior_prs}
              expanded={priorPrsExpanded}
              onToggle={() => setPriorPrsExpanded((v) => !v)}
              repoFullName={repoFullName}
            />
          </>
        )}
      </div>
    </section>
  );
}
