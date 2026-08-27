import { getBlast } from '../api/client.js';
import { resolvePull, resolveRepo } from '../api/resolve.js';
import type { GetBlastRadiusInput, GetBlastRadiusOutput } from './schemas.js';

const NOT_INDEXED_REASON =
  'Репозиторій ще не проіндексовано — запусти Resync у Studio і повтори виклик.';

/**
 * Thin client of `GET /pulls/:id/blast` (`server/src/modules/blast/
 * routes.ts`) — no blast-radius logic is duplicated here, only resolution
 * (repo/PR by human identifier, per `api/resolve.ts`) and mapping into the
 * tool's terse output shape (`docs/agent-prompts/mcp-server-best-practices.md`
 * §7, "result not operation" / "terse structured response").
 *
 * `status: 'degraded'` from the API is a normal, successful result here —
 * NOT a thrown error — the same rule `get_conventions` follows for "never
 * scanned". `reason` names the next step so the model isn't stuck.
 * `status: 'ok'` with an empty `symbols[]`/`downstream[]` is likewise a
 * genuine, successful empty answer (no callers found), not an error.
 */
export async function getBlastRadius(input: GetBlastRadiusInput): Promise<GetBlastRadiusOutput> {
  const repo = await resolveRepo(input.repo);
  const pull = await resolvePull(repo.id, input.pr);
  const response = await getBlast(pull.id);

  if (response.status === 'degraded' || response.blast === null) {
    return {
      status: 'degraded',
      reason: response.reason ?? NOT_INDEXED_REASON,
      summary: '',
      symbols: [],
      counts: response.counts,
    };
  }

  const blast = response.blast;
  const symbolMeta = new Map(blast.changed_symbols.map((s) => [s.name, s]));

  const symbols = blast.downstream.map((d) => {
    const meta = symbolMeta.get(d.symbol);
    return {
      name: d.symbol,
      file: meta?.file ?? '',
      kind: meta?.kind ?? '',
      callers: d.callers,
      endpoints: d.endpoints_affected,
      crons: d.crons_affected,
      callers_truncated: d.callers_truncated,
    };
  });

  return {
    status: response.status,
    ...(response.status === 'partial' && response.reason ? { reason: response.reason } : {}),
    summary: blast.summary,
    symbols,
    counts: response.counts,
  };
}
