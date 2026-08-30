import { and, desc, eq, gte, ilike, inArray } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { SkillRow, SkillVersionRow, CommunitySkillRow } from '../../db/rows.js';
import { INITIAL_SKILL_VERSION } from './constants.js';
import { EVAL_CASE_OWNER_KIND_SKILL } from '../_shared/constants.js';

/**
 * Skills data-access layer. The ONLY place that touches `skills`,
 * `skill_versions`, `community_skills`, `agent_skills`, `findings` and
 * `reviews` for the purposes of this module. Every workspace-owned query is
 * scoped by `workspaceId` (tenancy guard) — mirrors `AgentsRepository`.
 */

export interface InsertSkill {
  workspaceId: string;
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled?: boolean;
}

export interface UpdateSkill {
  name?: string;
  description?: string;
  type?: string;
  body?: string;
  enabled?: boolean;
}

export interface SkillStatsRaw {
  usedBy: { id: string; name: string }[];
  findings30d: number;
  accepted30d: number;
  byCategory: { category: string; count: number }[];
}

export class SkillsRepository {
  constructor(private db: Db) {}

  async list(workspaceId: string): Promise<SkillRow[]> {
    return this.db.select().from(t.skills).where(eq(t.skills.workspaceId, workspaceId));
  }

  async getById(workspaceId: string, id: string): Promise<SkillRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)));
    return row;
  }

  /**
   * Delete a skill (scoped to workspace). `skill_versions`/`agent_skills`
   * cascade at the DB level. This skill's `eval_cases` (owner_kind='skill')
   * carry no FK — `owner_id` is polymorphic — so cascade delete does not
   * apply (base spec's Module interactions, mirrored for skills by Amendment
   * A). Deleted explicitly in the SAME transaction, mirroring
   * `AgentsRepository.deleteById`; their `eval_runs` cascade via
   * `eval_runs.case_id`. Returns false if no such skill existed in the
   * workspace.
   */
  async deleteById(workspaceId: string, id: string): Promise<boolean> {
    return this.db.transaction(async (tx) => {
      const rows = await tx
        .delete(t.skills)
        .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
        .returning({ id: t.skills.id });
      if (rows.length === 0) return false;
      await tx
        .delete(t.evalCases)
        .where(and(eq(t.evalCases.ownerKind, EVAL_CASE_OWNER_KIND_SKILL), eq(t.evalCases.ownerId, id)));
      return true;
    });
  }

  async insert(values: InsertSkill): Promise<SkillRow> {
    const [row] = await this.db
      .insert(t.skills)
      .values({
        workspaceId: values.workspaceId,
        name: values.name,
        description: values.description,
        type: values.type as 'rubric' | 'convention' | 'security' | 'custom',
        source: values.source as 'manual' | 'imported_url' | 'extracted' | 'community',
        body: values.body,
        enabled: values.enabled,
      })
      .returning();
    await this.snapshotVersion(row!, INITIAL_SKILL_VERSION);
    return row!;
  }

  async update(workspaceId: string, id: string, patch: UpdateSkill): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;

    const bodyChanged = patch.body !== undefined && patch.body !== existing.body;
    const nextVersion = bodyChanged ? existing.version + 1 : existing.version;

    const [row] = await this.db
      .update(t.skills)
      .set({
        name: patch.name,
        description: patch.description,
        type: patch.type as 'rubric' | 'convention' | 'security' | 'custom' | undefined,
        body: patch.body,
        enabled: patch.enabled,
        version: nextVersion,
      })
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.id, id)))
      .returning();

    if (bodyChanged && row) {
      await this.snapshotVersion(row, nextVersion);
    }
    return row;
  }

  private async snapshotVersion(row: SkillRow, version: number): Promise<void> {
    await this.db
      .insert(t.skillVersions)
      .values({ skillId: row.id, version, body: row.body })
      .onConflictDoNothing();
  }

  async listVersions(skillId: string): Promise<SkillVersionRow[]> {
    return this.db
      .select()
      .from(t.skillVersions)
      .where(eq(t.skillVersions.skillId, skillId))
      .orderBy(desc(t.skillVersions.version));
  }

  async getVersion(skillId: string, version: number): Promise<SkillVersionRow | undefined> {
    const [row] = await this.db
      .select()
      .from(t.skillVersions)
      .where(and(eq(t.skillVersions.skillId, skillId), eq(t.skillVersions.version, version)));
    return row;
  }

  /**
   * Restore a past body onto the skill — implemented as a normal `update()`
   * call (which snapshots a NEW version), never a rewrite of history.
   */
  async restoreVersion(workspaceId: string, id: string, version: number): Promise<SkillRow | undefined> {
    const existing = await this.getById(workspaceId, id);
    if (!existing) return undefined;
    const target = await this.getVersion(id, version);
    if (!target) return undefined;
    return this.update(workspaceId, id, { body: target.body });
  }

  /**
   * Usage + last-30-day finding stats for a skill, joined through the agents
   * that currently link it. No agents using it → nothing to query.
   */
  async statsFor(skillId: string): Promise<SkillStatsRaw> {
    const usedBy = await this.db
      .select({ id: t.agents.id, name: t.agents.name })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .where(eq(t.agentSkills.skillId, skillId));

    if (usedBy.length === 0) {
      return { usedBy: [], findings30d: 0, accepted30d: 0, byCategory: [] };
    }

    const agentIds = usedBy.map((a) => a.id);
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

    const findingRows = await this.db
      .select({
        category: t.findings.category,
        acceptedAt: t.findings.acceptedAt,
      })
      .from(t.findings)
      .innerJoin(t.reviews, eq(t.findings.reviewId, t.reviews.id))
      .where(and(inArray(t.reviews.agentId, agentIds), gte(t.reviews.createdAt, thirtyDaysAgo)));

    const findings30d = findingRows.length;
    const accepted30d = findingRows.filter((f) => f.acceptedAt !== null).length;

    const byCategoryCounts = new Map<string, number>();
    for (const f of findingRows) {
      byCategoryCounts.set(f.category, (byCategoryCounts.get(f.category) ?? 0) + 1);
    }
    const byCategory = [...byCategoryCounts.entries()].map(([category, count]) => ({ category, count }));

    return { usedBy, findings30d, accepted30d, byCategory };
  }

  async listCommunity(q?: string, lang?: string): Promise<CommunitySkillRow[]> {
    const conditions = [];
    if (q) conditions.push(ilike(t.communitySkills.name, `%${q}%`));
    if (lang && lang !== 'any') conditions.push(eq(t.communitySkills.lang, lang));

    if (conditions.length === 0) {
      return this.db.select().from(t.communitySkills);
    }
    return this.db
      .select()
      .from(t.communitySkills)
      .where(and(...conditions));
  }

  async getCommunity(id: string): Promise<CommunitySkillRow | undefined> {
    const [row] = await this.db.select().from(t.communitySkills).where(eq(t.communitySkills.id, id));
    return row;
  }
}
