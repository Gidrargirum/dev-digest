import { githubBlobUrl, githubPrUrl } from "@/lib/github-urls";
import type { BlastRadius } from "@devdigest/shared";
import { GRAPH_MAX_NODES } from "./constants";

/** Builds a GitHub blob deep-link for a caller's `file:line`, mirroring the
 *  same compromise `FindingCard` makes: `undefined` when the PR's repo/head
 *  sha isn't known yet, so `MonoLink` falls back to inert text instead of a
 *  broken link. There is no in-app viewer for files outside the diff. */
export function callerHref(
  repoFullName: string | null | undefined,
  headSha: string | null | undefined,
  file: string,
  line: number,
): string | undefined {
  return repoFullName && headSha ? githubBlobUrl(repoFullName, headSha, file, line) : undefined;
}

/** Same compromise as `callerHref`: a prior PR's number is only linkable once
 *  we know which repo it lives in. `undefined` here means `MonoLink` renders
 *  inert text instead of a broken link. */
export function priorPrHref(repoFullName: string | null | undefined, number: number): string | undefined {
  return repoFullName ? githubPrUrl(repoFullName, number) : undefined;
}

/** `updated_at` is `null` when repo-intel never learned it — render nothing
 *  rather than "Invalid Date". Kept a plain function (no Intl config) to match
 *  the one other date-formatting call site in this client
 *  (`SkillDetail/VersionsTab`). */
export function formatPriorPrDate(updatedAt: string | null): string | null {
  if (!updatedAt) return null;
  const date = new Date(updatedAt);
  if (Number.isNaN(date.getTime())) return null;
  return date.toLocaleDateString();
}

export interface BlastChartResult {
  chart: string;
  totalNodes: number;
  shownNodes: number;
}

/** Mermaid rejects (or mis-renders) labels containing a bare `"` — a symbol,
 *  file path, or endpoint string could legitimately contain one. */
function escapeMermaidLabel(label: string): string {
  return label.replace(/"/g, "&quot;");
}

interface GraphNode {
  key: string;
  id: string;
  label: string;
}

/**
 * Pure Mermaid `flowchart LR` builder for the Graph view: changed symbol →
 * caller file → endpoint/cron, per symbol. Node ids are synthetic (`s0`,
 * `f0`, `e0`, `c0`, ...) — never the raw symbol/file/endpoint string, which
 * can contain characters that break Mermaid's node-id syntax. Labels carry
 * the real text, quoted and `"`-escaped.
 *
 * Deterministic: node registration order follows `blast.downstream` order,
 * so the same input always produces the same chart string.
 *
 * When the total node count exceeds `maxNodes`, nodes are dropped in reverse
 * priority (crons first, then endpoints, then files — symbols are kept
 * whenever possible) and any edge touching a dropped node is skipped. The
 * caller renders `shownNodes`/`totalNodes` as a visible "truncated" note —
 * `MermaidDiagram` renders nothing at all on invalid input, so a truncated
 * chart must still say what happened.
 */
export function buildBlastChart(blast: BlastRadius, maxNodes: number = GRAPH_MAX_NODES): BlastChartResult {
  const symbolIds = new Map<string, string>();
  const fileIds = new Map<string, string>();
  const endpointIds = new Map<string, string>();
  const cronIds = new Map<string, string>();

  for (const impact of blast.downstream) {
    if (!symbolIds.has(impact.symbol)) symbolIds.set(impact.symbol, `s${symbolIds.size}`);
  }
  for (const impact of blast.downstream) {
    for (const caller of impact.callers) {
      if (!fileIds.has(caller.file)) fileIds.set(caller.file, `f${fileIds.size}`);
    }
  }
  for (const impact of blast.downstream) {
    for (const endpoint of impact.endpoints_affected) {
      if (!endpointIds.has(endpoint)) endpointIds.set(endpoint, `e${endpointIds.size}`);
    }
  }
  for (const impact of blast.downstream) {
    for (const cron of impact.crons_affected) {
      if (!cronIds.has(cron)) cronIds.set(cron, `c${cronIds.size}`);
    }
  }

  const totalNodes = symbolIds.size + fileIds.size + endpointIds.size + cronIds.size;

  // Priority order for truncation: symbols first, then files, then
  // endpoints, then crons — the symbols are what the user asked about.
  const orderedNodes: GraphNode[] = [
    ...[...symbolIds.entries()].map(([key, id]) => ({ key, id, label: key })),
    ...[...fileIds.entries()].map(([key, id]) => ({ key, id, label: key })),
    ...[...endpointIds.entries()].map(([key, id]) => ({ key, id, label: key })),
    ...[...cronIds.entries()].map(([key, id]) => ({ key, id, label: key })),
  ];

  const kept = orderedNodes.slice(0, Math.max(0, maxNodes));
  const keptIds = new Set(kept.map((node) => node.id));

  const lines: string[] = ["flowchart LR"];
  for (const node of kept) {
    lines.push(`  ${node.id}["${escapeMermaidLabel(node.label)}"]`);
  }

  const drawnEdges = new Set<string>();
  const addEdge = (fromId: string | undefined, toId: string | undefined) => {
    if (!fromId || !toId || !keptIds.has(fromId) || !keptIds.has(toId)) return;
    const edgeKey = `${fromId}-->${toId}`;
    if (drawnEdges.has(edgeKey)) return;
    drawnEdges.add(edgeKey);
    lines.push(`  ${fromId} --> ${toId}`);
  };

  for (const impact of blast.downstream) {
    const symbolId = symbolIds.get(impact.symbol);
    const callerFileIds = [...new Set(impact.callers.map((caller) => fileIds.get(caller.file)))].filter(
      (id): id is string => !!id,
    );
    for (const fileId of callerFileIds) addEdge(symbolId, fileId);

    const endpointNodeIds = impact.endpoints_affected
      .map((endpoint) => endpointIds.get(endpoint))
      .filter((id): id is string => !!id);
    const cronNodeIds = impact.crons_affected
      .map((cron) => cronIds.get(cron))
      .filter((id): id is string => !!id);

    if (callerFileIds.length > 0) {
      for (const fileId of callerFileIds) {
        for (const endpointId of endpointNodeIds) addEdge(fileId, endpointId);
        for (const cronId of cronNodeIds) addEdge(fileId, cronId);
      }
    } else {
      // No known caller file for this symbol (edge case) — fall back to a
      // direct symbol → endpoint/cron edge instead of leaving the endpoint an
      // orphan node.
      for (const endpointId of endpointNodeIds) addEdge(symbolId, endpointId);
      for (const cronId of cronNodeIds) addEdge(symbolId, cronId);
    }
  }

  return { chart: lines.join("\n"), totalNodes, shownNodes: kept.length };
}
