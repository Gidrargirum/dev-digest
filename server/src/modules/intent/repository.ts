import { and, eq } from 'drizzle-orm';
import { IntentConfidence, PrIntentRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

/** `pr_intent` row shape — module-internal: it never leaves this file, so the
 *  storage shape stays behind the persistence boundary and the service works
 *  in `PrIntentRecord` terms only. */
type PrIntentRow = typeof t.prIntent.$inferSelect;

/**
 * Row → contract, validated rather than cast.
 *
 * `confidence` is a `text` column and the two scope arrays are `jsonb` with a
 * `$type<string[]>()` assertion, so Postgres gives TypeScript no guarantee any
 * of them still holds what the contract promises. Parsing here is the one place
 * that guarantee is established — it is also where `Intent`'s `.default()`s
 * actually run, since the client can only import TYPES from the vendored
 * contract (a runtime import breaks the webpack bundle) and therefore cannot
 * parse the payload itself.
 *
 * `confidence` degrades rather than rejects: an out-of-enum value falls back to
 * the column's own default (`'low'`, `db/schema/reviews.ts`), because a drifted
 * label is no reason to throw away an otherwise good intent. A row that fails
 * the remaining structure is corrupt, not merely stale: it is reported as "no
 * intent" so the caller treats it as a cache miss and recomputes over it,
 * instead of serving a malformed record the UI would crash on.
 */
export function rowToIntentRecord(row: PrIntentRow): PrIntentRecord | undefined {
  const parsed = PrIntentRecord.safeParse({
    pr_id: row.prId,
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    confidence: IntentConfidence.catch('low').parse(row.confidence),
    sources: row.sources,
    head_sha: row.headSha,
    computed_at: row.computedAt.toISOString(),
  });
  return parsed.success ? parsed.data : undefined;
}

export interface UpsertIntentInput {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  sources: string[];
  confidence: string;
  /** Cache key (decision #2 — `(pr_id, head_sha)`, PK is `pr_id` alone). */
  headSha: string;
}

/** `pr_intent` data access — PK is `pr_id`, so a new head SHA overwrites the
 *  row in place (no intent history, deliberately — see plans/intent-layer.md §3). */
export class IntentRepository {
  constructor(private db: Db) {}

  async findIntent(prId: string): Promise<PrIntentRecord | undefined> {
    const [row] = await this.db.select().from(t.prIntent).where(eq(t.prIntent.prId, prId));
    return row && rowToIntentRecord(row);
  }

  /**
   * Same lookup as `findIntent`, but scoped to a workspace via a join against
   * `pull_requests` — the tenancy check `GET /pulls/:id/intent` needs, moved
   * here so the route stops reaching into `reviews`' repository for it. A
   * `prId` that belongs to a different workspace (or doesn't exist) returns
   * `undefined`, same as "no intent computed yet" — the route can't
   * distinguish "wrong workspace" from "not computed", by design (no IDOR
   * signal leaked through response shape).
   */
  async findIntentForWorkspace(
    workspaceId: string,
    prId: string,
  ): Promise<PrIntentRecord | undefined> {
    const [row] = await this.db
      .select({ intent: t.prIntent })
      .from(t.prIntent)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prIntent.prId))
      .where(and(eq(t.prIntent.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)));
    return row?.intent && rowToIntentRecord(row.intent);
  }

  async upsertIntent(input: UpsertIntentInput): Promise<PrIntentRecord> {
    const computedAt = new Date();
    const [row] = await this.db
      .insert(t.prIntent)
      .values({
        prId: input.prId,
        intent: input.intent,
        inScope: input.inScope,
        outOfScope: input.outOfScope,
        sources: input.sources,
        confidence: input.confidence,
        headSha: input.headSha,
        computedAt,
      })
      .onConflictDoUpdate({
        target: t.prIntent.prId,
        set: {
          intent: input.intent,
          inScope: input.inScope,
          outOfScope: input.outOfScope,
          sources: input.sources,
          confidence: input.confidence,
          headSha: input.headSha,
          computedAt,
        },
      })
      .returning();
    // Upsert with a values() clause always returns exactly one row, and we
    // wrote it from validated inputs a moment ago — a parse failure here means
    // the contract and the schema have drifted apart, which is a bug, not data.
    const record = rowToIntentRecord(row!);
    if (!record) throw new Error('pr_intent row does not satisfy PrIntentRecord after upsert');
    return record;
  }
}
