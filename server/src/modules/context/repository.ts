import { and, asc, eq, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';
import type { OrderedDoc } from './helpers.js';

/** One authored node (doc or folder) as stored in `project_context_nodes`. */
export interface ContextNodeRow {
  path: string;
  kind: 'doc' | 'folder';
  content: string;
  contentSha: string;
}

/**
 * Project Context Folder — data access. Owns `agent_context_docs` and
 * `skill_context_docs`; also reads `repos.clone_path` (a cross-domain read,
 * same pattern `AgentsRepository.linkedSkills` uses joining `skills` — the
 * repository ring, not the service ring, is where cross-table reads belong).
 */
export class ContextRepository {
  constructor(private db: Db) {}

  /** A repo's clone path, or `undefined` if the repo doesn't exist / isn't cloned yet. */
  async getClonePath(repoId: string): Promise<string | undefined> {
    const [row] = await this.db
      .select({ clonePath: t.repos.clonePath })
      .from(t.repos)
      .where(eq(t.repos.id, repoId));
    return row?.clonePath ?? undefined;
  }

  /** An agent's own attached documents (path, order) for one repository. */
  async agentAttachments(agentId: string, repoId: string): Promise<OrderedDoc[]> {
    const rows = await this.db
      .select({ path: t.agentContextDocs.path, order: t.agentContextDocs.order })
      .from(t.agentContextDocs)
      .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)))
      .orderBy(asc(t.agentContextDocs.order));
    return rows;
  }

  /** A skill's own attached documents (path, order) for one repository. */
  async skillAttachments(skillId: string, repoId: string): Promise<OrderedDoc[]> {
    const rows = await this.db
      .select({ path: t.skillContextDocs.path, order: t.skillContextDocs.order })
      .from(t.skillContextDocs)
      .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)))
      .orderBy(asc(t.skillContextDocs.order));
    return rows;
  }

  /**
   * The documents inherited from an agent's ENABLED skills (both the link's
   * `enabled` flag and the skill's own `enabled` flag), flattened and ordered
   * by skill-link order first, then each skill's own document order — the
   * exact order `mergeAttachments` (AC-11) expects for the inherited half.
   */
  async enabledSkillAttachmentsForAgent(agentId: string, repoId: string): Promise<OrderedDoc[]> {
    const rows = await this.db
      .select({
        path: t.skillContextDocs.path,
        order: t.skillContextDocs.order,
      })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(
        t.skillContextDocs,
        and(eq(t.skillContextDocs.skillId, t.skills.id), eq(t.skillContextDocs.repoId, repoId)),
      )
      .where(
        and(
          eq(t.agentSkills.agentId, agentId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      )
      .orderBy(asc(t.agentSkills.order), asc(t.skillContextDocs.order));
    return rows;
  }

  /** Replace the full set of an agent's attached documents (last save wins). */
  async setAgentAttachments(agentId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.agentContextDocs)
        .where(and(eq(t.agentContextDocs.agentId, agentId), eq(t.agentContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.agentContextDocs)
        .values(paths.map((path, order) => ({ agentId, repoId, path, order })));
    });
  }

  /** Replace the full set of a skill's attached documents (last save wins). */
  async setSkillAttachments(skillId: string, repoId: string, paths: string[]): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx
        .delete(t.skillContextDocs)
        .where(and(eq(t.skillContextDocs.skillId, skillId), eq(t.skillContextDocs.repoId, repoId)));
      if (paths.length === 0) return;
      await tx
        .insert(t.skillContextDocs)
        .values(paths.map((path, order) => ({ skillId, repoId, path, order })));
    });
  }

  // ---------------------------------------------------------- Authored nodes

  /** Every authored node (doc + folder) for a repository. */
  async listNodes(repoId: string): Promise<ContextNodeRow[]> {
    return this.db
      .select({
        path: t.projectContextNodes.path,
        kind: t.projectContextNodes.kind,
        content: t.projectContextNodes.content,
        contentSha: t.projectContextNodes.contentSha,
      })
      .from(t.projectContextNodes)
      .where(eq(t.projectContextNodes.repoId, repoId));
  }

  /** A single authored node by path, or `undefined`. */
  async getNode(repoId: string, path: string): Promise<ContextNodeRow | undefined> {
    const [row] = await this.db
      .select({
        path: t.projectContextNodes.path,
        kind: t.projectContextNodes.kind,
        content: t.projectContextNodes.content,
        contentSha: t.projectContextNodes.contentSha,
      })
      .from(t.projectContextNodes)
      .where(
        and(eq(t.projectContextNodes.repoId, repoId), eq(t.projectContextNodes.path, path)),
      );
    return row;
  }

  /**
   * Insert or update a `doc` node. The update only fires when the existing row
   * is itself a `doc` — a path already naming a `folder` is left untouched
   * (AC-38; the caller has already rejected that collision, this is defense).
   */
  async upsertDoc(
    repoId: string,
    path: string,
    content: string,
    contentSha: string,
  ): Promise<void> {
    await this.db
      .insert(t.projectContextNodes)
      .values({ repoId, path, kind: 'doc', content, contentSha })
      .onConflictDoUpdate({
        target: [t.projectContextNodes.repoId, t.projectContextNodes.path],
        set: { content, contentSha, updatedAt: sql`now()` },
        setWhere: eq(t.projectContextNodes.kind, 'doc'),
      });
  }

  /** Register a folder node; a no-op if any node already exists at that path. */
  async insertFolder(repoId: string, path: string): Promise<void> {
    await this.db
      .insert(t.projectContextNodes)
      .values({ repoId, path, kind: 'folder', content: '', contentSha: '' })
      .onConflictDoNothing({
        target: [t.projectContextNodes.repoId, t.projectContextNodes.path],
      });
  }

  // ------------------------------------------------------ COVERAGE (AC-39/40)

  /** Total number of agents in a workspace — the COVERAGE denominator. */
  async countWorkspaceAgents(workspaceId: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(t.agents)
      .where(eq(t.agents.workspaceId, workspaceId));
    return row?.n ?? 0;
  }

  /**
   * Distinct workspace agents that have this exact document attached — directly
   * (`agent_context_docs`) or inherited via an enabled skill link whose skill
   * is itself enabled. The COVERAGE numerator (AC-39).
   */
  async countAgentsUsingDoc(
    workspaceId: string,
    repoId: string,
    path: string,
  ): Promise<number> {
    const direct = await this.db
      .select({ agentId: t.agentContextDocs.agentId })
      .from(t.agentContextDocs)
      .innerJoin(t.agents, eq(t.agentContextDocs.agentId, t.agents.id))
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentContextDocs.repoId, repoId),
          eq(t.agentContextDocs.path, path),
        ),
      );

    const inherited = await this.db
      .select({ agentId: t.agentSkills.agentId })
      .from(t.agentSkills)
      .innerJoin(t.agents, eq(t.agentSkills.agentId, t.agents.id))
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(
        t.skillContextDocs,
        and(
          eq(t.skillContextDocs.skillId, t.skills.id),
          eq(t.skillContextDocs.repoId, repoId),
          eq(t.skillContextDocs.path, path),
        ),
      )
      .where(
        and(
          eq(t.agents.workspaceId, workspaceId),
          eq(t.agentSkills.enabled, true),
          eq(t.skills.enabled, true),
        ),
      );

    const ids = new Set<string>();
    for (const r of [...direct, ...inherited]) ids.add(r.agentId);
    return ids.size;
  }

  /**
   * "Used by N agents" (AC-23) for every document attached (directly or via
   * an enabled skill) in a repository, in one bulk pass rather than one query
   * per catalog row. Returns a map of repo-relative path → distinct agent count.
   */
  async usageCounts(repoId: string): Promise<Map<string, number>> {
    const direct = await this.db
      .select({ agentId: t.agentContextDocs.agentId, path: t.agentContextDocs.path })
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.repoId, repoId));

    const inherited = await this.db
      .select({ agentId: t.agentSkills.agentId, path: t.skillContextDocs.path })
      .from(t.agentSkills)
      .innerJoin(t.skills, eq(t.agentSkills.skillId, t.skills.id))
      .innerJoin(
        t.skillContextDocs,
        and(eq(t.skillContextDocs.skillId, t.skills.id), eq(t.skillContextDocs.repoId, repoId)),
      )
      .where(and(eq(t.agentSkills.enabled, true), eq(t.skills.enabled, true)));

    const byPath = new Map<string, Set<string>>();
    for (const row of [...direct, ...inherited]) {
      const agents = byPath.get(row.path) ?? new Set<string>();
      agents.add(row.agentId);
      byPath.set(row.path, agents);
    }
    return new Map([...byPath].map(([path, agents]) => [path, agents.size]));
  }
}
