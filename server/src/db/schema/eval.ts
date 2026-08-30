import { pgTable, uuid, text, integer, boolean, jsonb, timestamp, doublePrecision, index } from 'drizzle-orm/pg-core';
import { workspaces } from './core';
import { pullRequests } from './pulls';
import { agents } from './agents';

// ============================================================ Eval / Conformance / Compose

export const evalCases = pgTable(
  'eval_cases',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull(),
    ownerId: uuid('owner_id').notNull(),
    // Amendment A (AC-38): the baseline agent whose provider/model/system
    // prompt/remaining skills supply both passes of a skill-owned case.
    // Nullable at the DB level — required for `owner_kind = 'skill'` is a
    // SERVICE-level invariant (EvalService), not a column constraint, so a
    // case survives its baseline agent being deleted (AC-39 turns the next
    // run into a 400, not a broken row). `set null` on delete, never cascade
    // — the case must outlive the agent.
    baselineAgentId: uuid('baseline_agent_id').references(() => agents.id, { onDelete: 'set null' }),
    name: text('name').notNull(),
    inputDiff: text('input_diff'),
    inputFiles: jsonb('input_files'),
    inputMeta: jsonb('input_meta'),
    // Closed set (AC-6): must_find expects >=1 matching finding, must_not_flag
    // expects zero findings on this input (a false positive if any land).
    expectationType: text('expectation_type', { enum: ['must_find', 'must_not_flag'] })
      .notNull()
      .default('must_find'),
    expectedOutput: jsonb('expected_output'),
    notes: text('notes'),
  },
  (t) => ({
    ownerIdx: index('eval_cases_owner_idx').on(t.ownerKind, t.ownerId),
    baselineAgentIdx: index('eval_cases_baseline_agent_idx').on(t.baselineAgentId),
  }),
);

export const evalBatches = pgTable(
  'eval_batches',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    // Snapshotted up front (AC-13) — never drifts if the agent is edited mid-run.
    // For a skill batch (Amendment A) this is the BASELINE agent, not the
    // skill under test — a batch records exactly one agent/version pair.
    agentVersion: integer('agent_version').notNull(),
    // Amendment A (AC-40): what the batch actually measures. `'agent'`/agentId
    // for the base spec's agent batches (default, matches every row inserted
    // before this column existed). `'skill'`/skillId for a skill batch —
    // `ownerId` nullable so the migration doesn't need a backfill on an
    // already-populated table; the DTO falls back to `agentId` when null.
    ownerKind: text('owner_kind', { enum: ['skill', 'agent'] }).notNull().default('agent'),
    ownerId: uuid('owner_id'),
    // The skill's version (`skills.version`) in force at execution time
    // (AC-40) — null for an agent batch, which has no skill behind it.
    skillVersion: integer('skill_version'),
    status: text('status', { enum: ['running', 'done', 'failed', 'cancelled'] })
      .notNull()
      .default('running'),
    startedAt: timestamp('started_at', { withTimezone: true }).defaultNow().notNull(),
    finishedAt: timestamp('finished_at', { withTimezone: true }),
    casesTotal: integer('cases_total'),
    casesPassed: integer('cases_passed'),
    // Macro-averaged over cases with a value for that metric (AC-26); null when
    // no case contributed a value for it (AC-22 — never substitute 0/1).
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    noFlagRate: doublePrecision('no_flag_rate'),
    costUsd: doublePrecision('cost_usd'),
    durationMs: integer('duration_ms'),
    // Batch-level macro-averaged marginal effect (AC-50) — null for an agent
    // batch, which has no with/without distinction.
    marginalRecall: doublePrecision('marginal_recall'),
    marginalPrecision: doublePrecision('marginal_precision'),
    marginalCitationAccuracy: doublePrecision('marginal_citation_accuracy'),
  },
  (t) => ({
    agentStartedIdx: index('eval_batches_agent_started_idx').on(t.agentId, t.startedAt),
    workspaceIdx: index('eval_batches_workspace_idx').on(t.workspaceId),
    ownerStartedIdx: index('eval_batches_owner_started_idx').on(t.ownerKind, t.ownerId, t.startedAt),
  }),
);

export const evalRuns = pgTable(
  'eval_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    caseId: uuid('case_id')
      .notNull()
      .references(() => evalCases.id, { onDelete: 'cascade' }),
    // No code path or seed writes eval_runs today, so NOT NULL is safe (see
    // docs/plans/2026-08-29-eval-pipeline.plan.md Risks).
    batchId: uuid('batch_id')
      .notNull()
      .references(() => evalBatches.id, { onDelete: 'cascade' }),
    ranAt: timestamp('ran_at', { withTimezone: true }).defaultNow().notNull(),
    actualOutput: jsonb('actual_output'),
    pass: boolean('pass'),
    recall: doublePrecision('recall'),
    precision: doublePrecision('precision'),
    citationAccuracy: doublePrecision('citation_accuracy'),
    matched: jsonb('matched'),
    unmatched: jsonb('unmatched'),
    durationMs: integer('duration_ms'),
    costUsd: doublePrecision('cost_usd'),
  },
  (t) => ({
    batchIdx: index('eval_runs_batch_idx').on(t.batchId),
    caseIdx: index('eval_runs_case_idx').on(t.caseId),
  }),
);

export const conformanceChecks = pgTable('conformance_checks', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  specId: text('spec_id').notNull(),
  completenessPct: doublePrecision('completeness_pct'),
  items: jsonb('items'),
});

export const composedReviews = pgTable('composed_reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  body: text('body').notNull(),
  verdict: text('verdict'),
  postedAt: timestamp('posted_at', { withTimezone: true }),
  githubReviewId: text('github_review_id'),
});
