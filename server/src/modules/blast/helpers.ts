import type {
  BlastCaller,
  BlastRadius,
  ChangedSymbol,
  DownstreamImpact,
  PrBlastResponse,
} from '@devdigest/shared';
import type { BlastDegradedReason, BlastRadiusResult } from './types.js';

/** Human-readable text for each degraded reason the repo-intel facade emits. */
const DEGRADED_REASON_MESSAGES: Record<BlastDegradedReason, string> = {
  flag_off: 'Repo intelligence is disabled for this workspace.',
  index_failed: 'The last index attempt for this repo failed.',
  index_partial: 'The repo index is only partially built.',
  repo_too_large: 'This repo is too large to index.',
  no_data: 'This repo has not been indexed yet.',
};

/** Fallback width, used only if `hopWidthLimit` is somehow absent on a capped result. */
const FALLBACK_HOP_WIDTH_LIMIT = 200;

const HOP2_FAILED_REASON =
  'the second-hop reverse-import lookup failed — some endpoints/crons two hops away may be missing (direct callers are unaffected)';

function hopCappedReason(hopWidthLimit?: number): string {
  const limit = hopWidthLimit ?? FALLBACK_HOP_WIDTH_LIMIT;
  return `reverse-import fan-out exceeded ${limit} files at one hop — some endpoints may be missing`;
}

function degradedReasonMessage(reason?: BlastDegradedReason): string {
  return reason
    ? DEGRADED_REASON_MESSAGES[reason]
    : 'Blast radius is unavailable for this repo right now.';
}

/**
 * `BlastResult` (repo-intel's read model) → `PrBlastResponse` (the HTTP/shared
 * contract). Pure mapping, no I/O — per spec §"application (service.ts)":
 * group `callers` by `viaSymbol` into `downstream[]`, attribute
 * endpoints/crons per symbol from the `factsByFile` of that symbol's caller
 * files, and compute `status`/`reason`/`counts` from the degraded/hopCapped
 * signals already carried by `BlastResult`.
 */
export function mapBlastResult(result: BlastRadiusResult): PrBlastResponse {
  if (result.degraded) {
    return {
      status: 'degraded',
      reason: degradedReasonMessage(result.reason),
      blast: null,
      counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    };
  }

  const changed_symbols: ChangedSymbol[] = result.changedSymbols.map((s) => ({
    name: s.name,
    file: s.file,
    kind: s.kind,
  }));

  const callersBySymbol = new Map<string, typeof result.callers>();
  for (const caller of result.callers) {
    const group = callersBySymbol.get(caller.viaSymbol);
    if (group) group.push(caller);
    else callersBySymbol.set(caller.viaSymbol, [caller]);
  }

  const truncatedSymbols = new Set(result.truncatedSymbols ?? []);
  const factsByFile = result.factsByFile ?? {};
  const hop2ByHop1 = result.hop2ByHop1 ?? {};

  const downstream: DownstreamImpact[] = changed_symbols.map((sym) => {
    const callerRows = callersBySymbol.get(sym.name) ?? [];
    const callers: BlastCaller[] = callerRows.map((c) => ({
      name: c.symbol,
      file: c.file,
      line: c.line,
    }));

    const endpoints = new Set<string>();
    const crons = new Set<string>();
    for (const caller of callerRows) {
      const facts = factsByFile[caller.file];
      if (facts) {
        for (const endpoint of facts.endpoints) endpoints.add(endpoint);
        for (const cron of facts.crons) crons.add(cron);
      }

      // Hop-2 attribution: files that import this symbol's hop-1 caller
      // file (without calling the symbol directly) still count as
      // downstream of THIS symbol — per spec "Depth-2 endpoint discovery".
      // `hop2ByHop1` ties each hop-2 file back to the specific hop-1 file
      // it was discovered through, so this stays per-symbol precise rather
      // than smearing every hop-2 endpoint across every changed symbol in
      // the PR.
      for (const hop2File of hop2ByHop1[caller.file] ?? []) {
        const hop2Facts = factsByFile[hop2File];
        if (!hop2Facts) continue;
        for (const endpoint of hop2Facts.endpoints) endpoints.add(endpoint);
        for (const cron of hop2Facts.crons) crons.add(cron);
      }
    }

    return {
      symbol: sym.name,
      callers,
      endpoints_affected: [...endpoints],
      crons_affected: [...crons],
      callers_truncated: truncatedSymbols.has(sym.name),
    };
  });

  const allEndpoints = new Set<string>();
  const allCrons = new Set<string>();
  let totalCallers = 0;
  for (const d of downstream) {
    totalCallers += d.callers.length;
    for (const e of d.endpoints_affected) allEndpoints.add(e);
    for (const c of d.crons_affected) allCrons.add(c);
  }

  const blast: BlastRadius = {
    changed_symbols,
    downstream,
    summary: `${changed_symbols.length} symbols · ${totalCallers} callers · ${allEndpoints.size} endpoints`,
  };

  const counts = {
    symbols: changed_symbols.length,
    callers: totalCallers,
    endpoints: allEndpoints.size,
    crons: allCrons.size,
  };

  // Both `hopCapped` (hop-2 completed but was too wide) and `hop2Failed`
  // (the hop-2 request itself errored) mean "hop-1 data is trustworthy, but
  // some hop-2 endpoints/crons may be missing" — neither ever implies
  // `degraded` (see repo-intel/types.ts's BlastResult doc comments). Prefer
  // the width-cap message when both are somehow set, since it's the more
  // specific/actionable of the two.
  if (result.hopCapped) {
    return { status: 'partial', reason: hopCappedReason(result.hopWidthLimit), blast, counts };
  }
  if (result.hop2Failed) {
    return { status: 'partial', reason: HOP2_FAILED_REASON, blast, counts };
  }

  return { status: 'ok', reason: null, blast, counts };
}
