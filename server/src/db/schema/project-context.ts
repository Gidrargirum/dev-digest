import { pgTable, uuid, text, integer, timestamp, primaryKey, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { agents } from './agents';
import { skills } from './skills';
import { repos } from './repos';

// ============================================================ Project Context Folder
//
// Stores ONLY the document's repo-relative path + its order (AC-8) — never a
// copy of the content text. Scoped per (agent|skill, repository) pair (Edge
// cases: agents are workspace-scoped, the catalog is repo-scoped), so the
// same agent run against another repo starts with an empty Context list.
// Identity of a document is its full path, never its file name.

export const agentContextDocs = pgTable(
  'agent_context_docs',
  {
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.agentId, t.repoId, t.path] }),
    repoIdx: index('agent_context_docs_repo_idx').on(t.repoId),
  }),
);

// ------------------------------------------------------------ Authored nodes
//
// Postgres is the SOURCE OF TRUTH for authored document content (AC-24); the
// file under `server/clones/<repo>/.devdigest/**` is a derived projection,
// rewritten from this table when it drifts (AC-25) and never committed to git.
//
// One table for both kinds (`doc` | `folder`) so the (repo_id, path) primary
// key is a single uniqueness guard that also enforces AC-38: a path can name a
// doc OR a folder, never both. `content_sha` is the drift-detection baseline
// (sha256 of the content last written to disk) — a projection whose file hash
// differs (or is missing) is stale and gets rewritten.

export const projectContextNodes = pgTable(
  'project_context_nodes',
  {
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    /** Repo-relative, forward-slash normalized, no leading/trailing slash. */
    path: text('path').notNull(),
    /** 'doc' | 'folder' — TEXT, not a PG enum (evolving set, project convention). */
    kind: text('kind', { enum: ['doc', 'folder'] }).notNull(),
    /** Authored content; always '' for a folder. */
    content: text('content').notNull().default(''),
    /** sha256 of the content last projected to disk — drift baseline for AC-25. */
    contentSha: text('content_sha').notNull().default(''),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.repoId, t.path] }),
    repoIdx: index('project_context_nodes_repo_idx').on(t.repoId),
  }),
);

export const skillContextDocs = pgTable(
  'skill_context_docs',
  {
    skillId: uuid('skill_id')
      .notNull()
      .references(() => skills.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    path: text('path').notNull(),
    order: integer('order').notNull().default(0),
    createdAt: now(),
  },
  (t) => ({
    pk: primaryKey({ columns: [t.skillId, t.repoId, t.path] }),
    repoIdx: index('skill_context_docs_repo_idx').on(t.repoId),
  }),
);
