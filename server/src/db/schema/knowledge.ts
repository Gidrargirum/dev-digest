import { pgTable, uuid, text, jsonb, timestamp, doublePrecision, integer, vector, index } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { repos } from './repos';
import { skills } from './skills';

// ============================================================ Knowledge / RAG

export const memory = pgTable(
  'memory',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scope: text('scope', { enum: ['repo', 'global', 'team'] }).notNull(),
    kind: text('kind', {
      enum: ['decision', 'convention', 'preference', 'fact', 'learning'],
    }).notNull(),
    content: text('content').notNull(),
    embedding: vector('embedding', { dimensions: 1536 }),
    confidence: doublePrecision('confidence'),
    sources: jsonb('sources'),
    createdAt: now(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    lastUsedAt: timestamp('last_used_at', { withTimezone: true }),
  },
  (t) => ({ wsIdx: index('memory_ws_idx').on(t.workspaceId) }),
);

/**
 * One extraction run over a repo. Keeps the "Detected from N sample files ·
 * last scan …" header honest and gives candidates a parent to be superseded by.
 */
export const conventionScans = pgTable(
  'convention_scans',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id')
      .notNull()
      .references(() => repos.id, { onDelete: 'cascade' }),
    status: text('status', { enum: ['queued', 'running', 'done', 'failed'] })
      .notNull()
      .default('queued'),
    sampleFiles: integer('sample_files').notNull().default(0),
    /** Candidates the model proposed, BEFORE the evidence gate. */
    candidatesRaw: integer('candidates_raw').notNull().default(0),
    /** Candidates that survived verification + corroboration. */
    candidatesKept: integer('candidates_kept').notNull().default(0),
    model: text('model'),
    tokensIn: integer('tokens_in'),
    tokensOut: integer('tokens_out'),
    costUsd: doublePrecision('cost_usd'),
    error: text('error'),
    createdAt: now(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
  },
  // `latestScan` filters (workspace_id, repo_id) and takes the newest row.
  (t) => ({
    repoIdx: index('convention_scans_repo_idx').on(t.workspaceId, t.repoId, t.createdAt),
  }),
);

export const conventions = pgTable(
  'conventions',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    repoId: uuid('repo_id').references(() => repos.id, { onDelete: 'cascade' }),
    scanId: uuid('scan_id').references(() => conventionScans.id, { onDelete: 'cascade' }),
    category: text('category', {
      enum: [
        'naming',
        'structure',
        'error-handling',
        'async',
        'testing',
        'api',
        'imports',
        'security',
        'other',
      ],
    })
      .notNull()
      .default('other'),
    rule: text('rule').notNull(),
    /** Hash of the normalized rule — the dedup key across re-scans. */
    ruleHash: text('rule_hash').notNull(),
    evidencePath: text('evidence_path'),
    evidenceLine: integer('evidence_line'),
    evidenceEndLine: integer('evidence_end_line'),
    evidenceSnippet: text('evidence_snippet'),
    /** MEASURED: support/(support+violations), or 1 for config-derived rules. */
    confidence: doublePrecision('confidence'),
    /** The model's self-report, kept for diagnostics only. */
    modelConfidence: doublePrecision('model_confidence'),
    support: integer('support').notNull().default(0),
    violations: integer('violations').notNull().default(0),
    origin: text('origin', { enum: ['config', 'model'] })
      .notNull()
      .default('model'),
    status: text('status', { enum: ['pending', 'accepted', 'rejected'] })
      .notNull()
      .default('pending'),
    skillId: uuid('skill_id').references(() => skills.id, { onDelete: 'set null' }),
    createdAt: now(),
  },
  // Every read leads with `workspace_id` (tenancy guard), so the index must
  // too. `skill_id` and `scan_id` are indexed because Postgres does not index
  // referencing columns automatically, and both are on cascade/set-null paths.
  (t) => ({
    repoStatusIdx: index('conventions_repo_status_idx').on(t.workspaceId, t.repoId, t.status),
    scanIdx: index('conventions_scan_idx').on(t.scanId),
    skillIdx: index('conventions_skill_idx').on(t.skillId),
  }),
);
