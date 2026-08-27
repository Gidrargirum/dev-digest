import { and, eq } from 'drizzle-orm';
import { PrWhyRiskBrief, RiskLevel } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { InputFile, StateKeyFile } from './helpers.js';

/** `pr_why_risk_brief` row shape — module-internal: never leaves this file, so
 *  the storage shape stays behind the persistence boundary. */
type PrWhyRiskBriefRow = typeof t.prWhyRiskBrief.$inferSelect;

export interface BriefPrRow {
  id: string;
  repoId: string;
  number: number;
  title: string;
  body: string | null;
  branch: string;
  headSha: string;
}

export interface UpsertBriefInput {
  prId: string;
  prStateKey: string;
  what: string;
  why: string;
  riskLevel: string;
  risks: unknown[];
  reviewFocus: unknown[];
  risksTotal: number;
  reviewFocusTotal: number;
  sources: string[];
  model: string | null;
  computedAt: Date;
}

/**
 * Row → contract, validated rather than cast. This is the ONE place the
 * contract is parsed (the client can only import TYPES from the vendored
 * contract — a runtime import breaks the webpack bundle — so it cannot parse
 * the payload itself). `risk_level` degrades to `'low'` on a drifted label
 * rather than throwing (mirrors `rowToIntentRecord`); a structurally broken
 * row → `undefined`, i.e. treated as a cache miss and recomputed over.
 */
export function rowToBrief(row: PrWhyRiskBriefRow): PrWhyRiskBrief | undefined {
  const parsed = PrWhyRiskBrief.safeParse({
    pr_id: row.prId,
    what: row.what,
    why: row.why,
    risk_level: RiskLevel.catch('low').parse(row.riskLevel),
    risks: row.risks,
    review_focus: row.reviewFocus,
    risks_total: row.risksTotal,
    review_focus_total: row.reviewFocusTotal,
    sources: row.sources,
    pr_state_key: row.prStateKey,
    model: row.model,
    computed_at: row.computedAt.toISOString(),
  });
  return parsed.success ? parsed.data : undefined;
}

/** `pr_why_risk_brief` data access — PK is `pr_id`, overwritten in place. No
 *  business logic (state key / grounding / caps live in the service). */
export class BriefRepository {
  constructor(private db: Db) {}

  /**
   * Resolve a PR scoped to a workspace. "Wrong workspace" and "does not exist"
   * both return `undefined` — no IDOR signal through response shape (AC-22).
   */
  async resolvePr(workspaceId: string, prId: string): Promise<BriefPrRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.pullRequests)
      .where(and(eq(t.pullRequests.workspaceId, workspaceId), eq(t.pullRequests.id, prId)));
    if (!row) return undefined;
    return {
      id: row.id,
      repoId: row.repoId,
      number: row.number,
      title: row.title,
      body: row.body,
      branch: row.branch,
      headSha: row.headSha,
    };
  }

  async resolveRepoRef(repoId: string): Promise<{ owner: string; name: string } | undefined> {
    const [row] = await this.db.select().from(t.repos).where(eq(t.repos.id, repoId));
    return row ? { owner: row.owner, name: row.name } : undefined;
  }

  async getChangedFiles(prId: string): Promise<InputFile[]> {
    const rows = await this.db.select().from(t.prFiles).where(eq(t.prFiles.prId, prId));
    return rows.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      patch: f.patch ?? null,
    }));
  }

  /** Diff-stats slice for the state key (AC-4). */
  async getStateKeyFiles(prId: string): Promise<StateKeyFile[]> {
    return this.getChangedFiles(prId);
  }

  async findBrief(prId: string): Promise<PrWhyRiskBrief | undefined> {
    const [row] = await this.db
      .select()
      .from(t.prWhyRiskBrief)
      .where(eq(t.prWhyRiskBrief.prId, prId));
    return row && rowToBrief(row);
  }

  /** Same lookup, scoped to a workspace via a join on `pull_requests` (AC-22). */
  async findBriefForWorkspace(
    workspaceId: string,
    prId: string,
  ): Promise<PrWhyRiskBrief | undefined> {
    const [row] = await this.db
      .select({ brief: t.prWhyRiskBrief })
      .from(t.prWhyRiskBrief)
      .innerJoin(t.pullRequests, eq(t.pullRequests.id, t.prWhyRiskBrief.prId))
      .where(
        and(eq(t.prWhyRiskBrief.prId, prId), eq(t.pullRequests.workspaceId, workspaceId)),
      );
    return row?.brief && rowToBrief(row.brief);
  }

  async upsertBrief(input: UpsertBriefInput): Promise<PrWhyRiskBrief> {
    const set = {
      prStateKey: input.prStateKey,
      what: input.what,
      why: input.why,
      riskLevel: input.riskLevel,
      risks: input.risks,
      reviewFocus: input.reviewFocus,
      risksTotal: input.risksTotal,
      reviewFocusTotal: input.reviewFocusTotal,
      sources: input.sources,
      model: input.model,
      computedAt: input.computedAt,
    };
    const [row] = await this.db
      .insert(t.prWhyRiskBrief)
      .values({ prId: input.prId, ...set })
      .onConflictDoUpdate({ target: t.prWhyRiskBrief.prId, set })
      .returning();
    const brief = rowToBrief(row!);
    if (!brief) {
      throw new Error('pr_why_risk_brief row does not satisfy PrWhyRiskBrief after upsert');
    }
    return brief;
  }
}
