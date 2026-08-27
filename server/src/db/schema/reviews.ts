import { sql } from 'drizzle-orm';
import { pgTable, uuid, text, integer, jsonb, timestamp, doublePrecision } from 'drizzle-orm/pg-core';
import { now } from './_shared';
import { workspaces } from './core';
import { pullRequests } from './pulls';

// ============================================================ Review & findings

export const reviews = pgTable('reviews', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id')
    .notNull()
    .references(() => workspaces.id, { onDelete: 'cascade' }),
  prId: uuid('pr_id')
    .notNull()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  agentId: uuid('agent_id'),
  /** The agent_run that produced this review (links the timeline run ↔ review). */
  runId: uuid('run_id'),
  kind: text('kind', { enum: ['summary', 'review'] }).notNull(),
  verdict: text('verdict'),
  summary: text('summary'),
  score: integer('score'),
  model: text('model'),
  createdAt: now(),
});

export const findings = pgTable('findings', {
  id: uuid('id').primaryKey().defaultRandom(),
  reviewId: uuid('review_id')
    .notNull()
    .references(() => reviews.id, { onDelete: 'cascade' }),
  file: text('file').notNull(),
  startLine: integer('start_line').notNull(),
  endLine: integer('end_line').notNull(),
  severity: text('severity').notNull(),
  category: text('category').notNull(),
  title: text('title').notNull(),
  rationale: text('rationale').notNull(),
  suggestion: text('suggestion'),
  confidence: doublePrecision('confidence').notNull(),
  kind: text('kind').notNull().default('finding'),
  trifectaComponents: jsonb('trifecta_components').$type<string[]>(),
  acceptedAt: timestamp('accepted_at', { withTimezone: true }),
  dismissedAt: timestamp('dismissed_at', { withTimezone: true }),
});

export const prIntent = pgTable('pr_intent', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  intent: text('intent').notNull(),
  inScope: jsonb('in_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  outOfScope: jsonb('out_of_scope').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  riskAreas: jsonb('risk_areas').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  confidence: text('confidence').notNull().default('low'), // 'low' | 'medium' | 'high'
  headSha: text('head_sha').notNull().default(''), // cache key
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});

export const prBrief = pgTable('pr_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  json: jsonb('json').notNull(),
});

/**
 * Why + Risk Brief (spec 2026-08-27-pr-why-risk-brief) — a separate table from
 * `pr_brief` above: it carries a `pr_state_key` cache column (`head_sha` +
 * diff-stats digest, AC-4) that `pr_brief` has no place for, and it stores a
 * different, grounded shape. One brief per PR, overwritten in place (PK on
 * `pr_id`, same as `pr_intent`) — no brief history by design.
 */
export const prWhyRiskBrief = pgTable('pr_why_risk_brief', {
  prId: uuid('pr_id')
    .primaryKey()
    .references(() => pullRequests.id, { onDelete: 'cascade' }),
  prStateKey: text('pr_state_key').notNull(), // AC-4
  what: text('what').notNull(),
  why: text('why').notNull(),
  // 'high' | 'medium' | 'low' — text, not a PG enum: business-logic-driven and
  // validated by Zod (`RiskLevel.catch('low')`) at the read boundary, so a
  // drifted label degrades rather than throws (mirrors `pr_intent.confidence`).
  riskLevel: text('risk_level').notNull(),
  risks: jsonb('risks').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  reviewFocus: jsonb('review_focus').$type<unknown[]>().notNull().default(sql`'[]'::jsonb`),
  risksTotal: integer('risks_total').notNull().default(0),
  reviewFocusTotal: integer('review_focus_total').notNull().default(0),
  sources: jsonb('sources').$type<string[]>().notNull().default(sql`'[]'::jsonb`),
  model: text('model'),
  computedAt: timestamp('computed_at', { withTimezone: true }).notNull().defaultNow(),
});
