import { and, eq, sql } from 'drizzle-orm';
import type { PrBriefRecord } from '@devdigest/shared';
import { PrBriefRecord as PrBriefRecordSchema } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type {
  BriefChangedFile,
  BriefIntentFacts,
  BriefLockedRepository,
  BriefPullContext,
  BriefRepositoryPort,
  BriefResolvedPr,
  UpsertBriefInput,
} from './types.js';

/** Transaction handle inferred from Drizzle — the executor the lock is held on. */
type BriefTx = Parameters<Parameters<Db['transaction']>[0]>[0];

type PrBriefRow = typeof t.prBrief.$inferSelect;

/** The `pr_brief` upsert, shared by the plain and the lock-scoped repositories. */
async function writeBrief(exec: Db | BriefTx, input: UpsertBriefInput): Promise<void> {
  const generatedAt = new Date();
  await exec
    .insert(t.prBrief)
    .values({
      prId: input.prId,
      json: input.brief,
      headSha: input.headSha,
      runId: input.runId,
      generatedAt,
    })
    .onConflictDoUpdate({
      target: t.prBrief.prId,
      set: {
        json: input.brief,
        headSha: input.headSha,
        runId: input.runId,
        generatedAt,
      },
    });
}

/** PR body + repo owner/name — shared by the plain and lock-scoped repositories. */
async function selectPullContext(
  exec: Db | BriefTx,
  prId: string,
): Promise<BriefPullContext | undefined> {
  const [row] = await exec
    .select({
      body: t.pullRequests.body,
      owner: t.repos.owner,
      name: t.repos.name,
    })
    .from(t.pullRequests)
    .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
    .where(eq(t.pullRequests.id, prId));
  return row ? { body: row.body, repoRef: { owner: row.owner, name: row.name } } : undefined;
}

/**
 * Row → contract, validated on the read boundary (mirrors `rowToIntentRecord`).
 * A row whose stored `json` no longer satisfies `Brief` is read as "no Brief"
 * so the caller treats it as a cache miss rather than serving something the UI
 * would crash on.
 */
export function rowToBriefRecord(row: PrBriefRow): PrBriefRecord | undefined {
  const json = (row.json ?? {}) as Record<string, unknown>;
  const parsed = PrBriefRecordSchema.safeParse({
    ...json,
    pr_id: row.prId,
    head_sha: row.headSha,
    run_id: row.runId,
    generated_at: row.generatedAt.toISOString(),
  });
  return parsed.success ? parsed.data : undefined;
}

/**
 * `pr_brief` data access plus the advisory lock that serializes generation
 * (AC-7). The only file in `modules/brief/` that imports `db/schema`; it never
 * imports another module's repository (`pr_intent` is read directly — its own
 * table, not `intent`'s persistence).
 */
export class BriefRepository implements BriefRepositoryPort {
  constructor(private db: Db) {}

  /**
   * Resolve `:id` to a PR in the caller's workspace. `undefined` means "does
   * not exist" and "belongs to another workspace" identically — no IDOR signal
   * (mirrors `BlastRepository.resolvePr`). Feeds the route's `404` (decision #3).
   */
  async resolvePr(workspaceId: string, prId: string): Promise<BriefResolvedPr | undefined> {
    const [row] = await this.db
      .select({
        id: t.pullRequests.id,
        repoId: t.pullRequests.repoId,
        headSha: t.pullRequests.headSha,
      })
      .from(t.pullRequests)
      .innerJoin(t.repos, eq(t.repos.id, t.pullRequests.repoId))
      .where(and(eq(t.pullRequests.id, prId), eq(t.repos.workspaceId, workspaceId)));
    return row;
  }

  async findBrief(prId: string): Promise<PrBriefRecord | undefined> {
    const [row] = await this.db.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row && rowToBriefRecord(row);
  }

  async getChangedFiles(prId: string): Promise<BriefChangedFile[]> {
    return this.db
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async findIntentFacts(prId: string): Promise<BriefIntentFacts | undefined> {
    const [row] = await this.db
      .select({
        intent: t.prIntent.intent,
        inScope: t.prIntent.inScope,
        outOfScope: t.prIntent.outOfScope,
      })
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    return row;
  }

  async upsertBrief(input: UpsertBriefInput): Promise<void> {
    await writeBrief(this.db, input);
  }

  /**
   * Run `fn` while holding a Postgres advisory lock keyed on `pr_id` (AC-7).
   * The lock is transaction-scoped (`pg_advisory_xact_lock`), so it releases
   * on commit/rollback. `fn` receives tx-bound reads/writes so the cache
   * re-check inside the lock sees the same connection that holds it.
   */
  async withPrLock<T>(prId: string, fn: (tx: BriefLockedRepository) => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`pr_brief:${prId}`}))`);
      return fn(new BriefTxRepository(tx));
    });
  }

}

/**
 * The lock-scoped view of `pr_brief` — every method runs on the transaction
 * that holds the advisory lock, so the cache re-check and the upsert inside
 * {@link BriefRepository.withPrLock} are atomic against a competing generation.
 */
export class BriefTxRepository implements BriefLockedRepository {
  constructor(private tx: BriefTx) {}

  async findBrief(prId: string): Promise<PrBriefRecord | undefined> {
    const [row] = await this.tx.select().from(t.prBrief).where(eq(t.prBrief.prId, prId));
    return row && rowToBriefRecord(row);
  }

  async getChangedFiles(prId: string): Promise<BriefChangedFile[]> {
    return this.tx
      .select({
        path: t.prFiles.path,
        additions: t.prFiles.additions,
        deletions: t.prFiles.deletions,
      })
      .from(t.prFiles)
      .where(eq(t.prFiles.prId, prId));
  }

  async findIntentFacts(prId: string): Promise<BriefIntentFacts | undefined> {
    const [row] = await this.tx
      .select({
        intent: t.prIntent.intent,
        inScope: t.prIntent.inScope,
        outOfScope: t.prIntent.outOfScope,
      })
      .from(t.prIntent)
      .where(eq(t.prIntent.prId, prId));
    return row;
  }

  findPullContext(prId: string): Promise<BriefPullContext | undefined> {
    return selectPullContext(this.tx, prId);
  }

  upsertBrief(input: UpsertBriefInput): Promise<void> {
    return writeBrief(this.tx, input);
  }
}
