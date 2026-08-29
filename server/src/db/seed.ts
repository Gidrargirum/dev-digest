import 'dotenv/config';
import { createDb, type Db } from './client.js';
import * as t from './schema.js';
import { eq, and } from 'drizzle-orm';
import {
  GENERAL_REVIEWER_PROMPT,
  SECURITY_REVIEWER_PROMPT,
  PERFORMANCE_REVIEWER_PROMPT,
} from './seed-prompts.js';
import {
  SEED_SKILLS,
  SEED_COMMUNITY_SKILLS,
  TEST_QUALITY_REVIEWER_PROMPT,
  API_CONTRACT_REVIEWER_PROMPT,
} from './seed-skills.js';
import { SEED_EVAL_CASES } from './seed-eval-cases.js';

/** Default provider/model for the built-in reviewer agents. */
const DEFAULT_PROVIDER = 'openrouter' as const;
const DEFAULT_MODEL = 'deepseek/deepseek-v4-flash';

/**
 * Pre-wired agent <-> skill links (Skills Lab demo data). Module-level (not
 * inside `seed()`) so it is unit-testable without Docker — a test can assert
 * every `skillName` here actually exists in `SEED_SKILLS` without touching
 * Postgres.
 */
export const AGENT_SKILL_LINKS: Array<{ agentName: string; skillName: string; order: number }> = [
  { agentName: 'Test Quality Reviewer', skillName: 'test-quality-rubric', order: 0 },
  { agentName: 'Test Quality Reviewer', skillName: 'pr-quality-rubric', order: 1 },
  { agentName: 'API Contract Reviewer', skillName: 'api-contract-breaking-change', order: 0 },
  { agentName: 'API Contract Reviewer', skillName: 'pr-quality-rubric', order: 1 },
  { agentName: 'API Contract Reviewer', skillName: 'api-contract-response-schema', order: 2 },
  { agentName: 'API Contract Reviewer', skillName: 'api-contract-semver-discipline', order: 3 },
  { agentName: 'API Contract Reviewer', skillName: 'api-contract-deprecation-policy', order: 4 },
];

/**
 * Seed the starter's demo data. Idempotent: re-running upserts the default
 * workspace/user and the demo fixtures.
 *
 * Seeds: default workspace + system user + membership, default settings,
 * demo repo (acme/payments-api), PR #482 with files/commits, a sample review
 * with a few findings, and the three built-in agents (General + Security +
 * Performance), all on the default openrouter/deepseek-v4-flash provider+model.
 *
 * Course lessons populate the other tables (skills, conventions, memory, eval,
 * …) once their features are built — they start empty here.
 */

export const DEFAULT_WORKSPACE_NAME = 'default';
export const SYSTEM_USER_EMAIL = 'you@local';

export async function seed(db: Db): Promise<{ workspaceId: string; userId: string }> {
  // ---- workspace + user (no-auth defaults) ----
  let [ws] = await db
    .select()
    .from(t.workspaces)
    .where(eq(t.workspaces.name, DEFAULT_WORKSPACE_NAME));
  if (!ws) {
    [ws] = await db
      .insert(t.workspaces)
      .values({ name: DEFAULT_WORKSPACE_NAME })
      .returning();
  }
  const workspaceId = ws!.id;

  let [user] = await db.select().from(t.users).where(eq(t.users.email, SYSTEM_USER_EMAIL));
  if (!user) {
    [user] = await db
      .insert(t.users)
      .values({ email: SYSTEM_USER_EMAIL, name: 'You' })
      .returning();
  }
  const userId = user!.id;

  await db
    .insert(t.workspaceMembers)
    .values({ workspaceId, userId, role: 'owner' })
    .onConflictDoNothing();

  // ---- default settings ----
  const defaultSettings: Record<string, unknown> = {
    polling_interval_min: 5,
    theme: 'dark',
    density: 'regular',
    sync_to_folder: true,
  };
  for (const [key, value] of Object.entries(defaultSettings)) {
    await db
      .insert(t.settings)
      .values({ workspaceId, userId, key, value })
      .onConflictDoNothing();
  }

  // ---- demo repo (acme/payments-api) ----
  let [repo] = await db
    .select()
    .from(t.repos)
    .where(and(eq(t.repos.workspaceId, workspaceId), eq(t.repos.fullName, 'acme/payments-api')));
  if (!repo) {
    [repo] = await db
      .insert(t.repos)
      .values({
        workspaceId,
        owner: 'acme',
        name: 'payments-api',
        fullName: 'acme/payments-api',
        defaultBranch: 'main',
        clonePath: null,
        createdBy: userId,
      })
      .returning();
  }
  const repoId = repo!.id;

  // ---- PR #482 (rate limiting) ----
  let [pr] = await db
    .select()
    .from(t.pullRequests)
    .where(and(eq(t.pullRequests.repoId, repoId), eq(t.pullRequests.number, 482)));
  if (!pr) {
    [pr] = await db
      .insert(t.pullRequests)
      .values({
        workspaceId,
        repoId,
        number: 482,
        title: 'Add rate limiting to public API endpoints',
        author: 'marisa.koch',
        branch: 'feat/rate-limit-public',
        base: 'main',
        headSha: 'a1b2c3d4e5f6',
        additions: 247,
        deletions: 38,
        filesCount: 9,
        status: 'needs_review',
        body: 'Add rate limiting to public API endpoints to prevent abuse from unauthenticated clients.',
      })
      .returning();

    // pr_files (subset)
    await db.insert(t.prFiles).values([
      { prId: pr!.id, path: 'src/middleware/ratelimit.ts', additions: 84, deletions: 0 },
      { prId: pr!.id, path: 'src/api/public/webhooks.ts', additions: 31, deletions: 6 },
      { prId: pr!.id, path: 'src/config.ts', additions: 4, deletions: 0 },
      { prId: pr!.id, path: 'src/api/users.ts', additions: 7, deletions: 2 },
    ]);

    // pr_commits
    await db.insert(t.prCommits).values({
      prId: pr!.id,
      sha: 'a1b2c3d4e5f6',
      message: 'Add token-bucket rate limiter',
      author: 'marisa.koch',
    });

    // a sample review + findings so the PR shows results before the first run
    const [review] = await db
      .insert(t.reviews)
      .values({
        workspaceId,
        prId: pr!.id,
        kind: 'review',
        verdict: 'request_changes',
        summary:
          'Solid middleware approach, but a Stripe secret key is committed in plaintext and the user-list endpoint introduces an N+1 query under the new limiter.',
        score: 61,
        model: 'seed',
      })
      .returning();

    await db.insert(t.findings).values([
      {
        reviewId: review!.id,
        file: 'src/config.ts',
        startLine: 12,
        endLine: 12,
        severity: 'CRITICAL',
        category: 'security',
        title: 'Hardcoded Stripe secret key in commit',
        rationale: 'Line 12 contains a literal `sk_live_` Stripe secret key.',
        suggestion: 'Move to env var and rotate the key immediately.',
        confidence: 0.98,
      },
      {
        reviewId: review!.id,
        file: 'src/api/users.ts',
        startLine: 45,
        endLine: 52,
        severity: 'WARNING',
        category: 'perf',
        title: 'N+1 query in user list endpoint',
        rationale: 'Loop issues one query per user → N+1.',
        suggestion: 'Use a single IN query and group in memory.',
        confidence: 0.86,
      },
    ]);
  }

  // ---- built-in agents (the three starter presets) ----
  // Prompt bodies live in ./seed-prompts.ts (mirrored in docs/agent-prompts/*.md).
  const seedAgents: Array<typeof t.agents.$inferInsert> = [
    {
      workspaceId,
      name: 'General Reviewer',
      description: 'Reviews a PR diff for bugs, correctness, and clarity.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: GENERAL_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Security Reviewer',
      description: 'Flags secrets, injection, SSRF and the lethal trifecta before merge.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: SECURITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Performance Reviewer',
      description: 'Catches N+1 queries, missing indexes, and hot-path allocations.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: PERFORMANCE_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'Test Quality Reviewer',
      description: 'Flags untested branches, missing edge cases, and flaky test patterns.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: TEST_QUALITY_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
    {
      workspaceId,
      name: 'API Contract Reviewer',
      description: 'Flags breaking changes to route signatures, request/response shapes, and status codes.',
      provider: DEFAULT_PROVIDER,
      model: DEFAULT_MODEL,
      systemPrompt: API_CONTRACT_REVIEWER_PROMPT,
      enabled: true,
      version: 1,
      createdBy: userId,
    },
  ];
  for (const a of seedAgents) {
    const [existing] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, a.name)));
    if (!existing) await db.insert(t.agents).values(a);
  }

  // ---- community skills catalog (global, no workspace scope) ----
  // Left unimported into the workspace `skills` table on purpose so a student
  // can walk through the "import from community" flow manually.
  for (const cs of SEED_COMMUNITY_SKILLS) {
    const [existing] = await db
      .select()
      .from(t.communitySkills)
      .where(eq(t.communitySkills.name, cs.name));
    if (!existing) {
      await db.insert(t.communitySkills).values({
        name: cs.name,
        repo: cs.repo,
        stars: cs.stars,
        lang: cs.lang,
        description: cs.description,
        type: cs.type,
        body: cs.body,
      });
    }
  }

  // ---- workspace skills (Skills Lab demo data) ----
  // Body strings live in ./seed-skills.ts. Mirrors AgentsRepository.insert's
  // version-snapshot pattern: insert the skill row, then snapshot version 1
  // into skill_versions.
  for (const def of SEED_SKILLS) {
    const [existing] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, def.name)));
    if (!existing) {
      const [inserted] = await db
        .insert(t.skills)
        .values({
          workspaceId,
          name: def.name,
          description: def.description,
          type: def.type,
          source: def.source,
          body: def.body,
          enabled: def.enabled,
          version: 1,
        })
        .returning();
      await db.insert(t.skillVersions).values({
        skillId: inserted!.id,
        version: 1,
        body: def.body,
      });
    }
  }

  // ---- agent <-> skill links (Test Quality + API Contract come pre-wired) ----
  // Skills are opt-in; General/Security/Performance stay without links so a
  // student sees at least one agent demonstrating prompt assembly with skills.
  for (const link of AGENT_SKILL_LINKS) {
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, link.agentName)));
    const [skill] = await db
      .select()
      .from(t.skills)
      .where(and(eq(t.skills.workspaceId, workspaceId), eq(t.skills.name, link.skillName)));
    if (agent && skill) {
      await db
        .insert(t.agentSkills)
        .values({ agentId: agent.id, skillId: skill.id, order: link.order, enabled: true })
        .onConflictDoNothing();
    }
  }

  // ---- backfill agent_id on the seeded PR #482 review ----
  // The review is inserted earlier (before agents exist), so it starts with a
  // null agent_id. Attach it to General Reviewer now that the agent row
  // exists — findings on a review with no agent can never be turned into an
  // eval case from the UI (FindingsPanel only wires up the action when
  // `agentId` is truthy). Idempotent: re-running always sets the same value.
  const [generalReviewer] = await db
    .select()
    .from(t.agents)
    .where(and(eq(t.agents.workspaceId, workspaceId), eq(t.agents.name, 'General Reviewer')));
  if (generalReviewer) {
    await db
      .update(t.reviews)
      .set({ agentId: generalReviewer.id })
      .where(eq(t.reviews.prId, pr!.id));
  }

  // ---- eval cases (L06) — demo cases for the General Reviewer agent ----
  if (generalReviewer) {
    for (const def of SEED_EVAL_CASES) {
      const [existing] = await db
        .select()
        .from(t.evalCases)
        .where(
          and(
            eq(t.evalCases.workspaceId, workspaceId),
            eq(t.evalCases.ownerKind, 'agent'),
            eq(t.evalCases.ownerId, generalReviewer.id),
            eq(t.evalCases.name, def.name),
          ),
        );
      if (!existing) {
        await db.insert(t.evalCases).values({
          workspaceId,
          ownerKind: 'agent',
          ownerId: generalReviewer.id,
          name: def.name,
          inputDiff: def.inputDiff,
          expectationType: def.expectationType,
          expectedOutput: def.expectedOutput,
          notes: def.notes,
        });
      }
    }
  }

  return { workspaceId, userId };
}

// CLI entrypoint
if (import.meta.url === `file://${process.argv[1]}`) {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('DATABASE_URL is required');
    process.exit(1);
  }
  const handle = createDb(url);
  seed(handle.db)
    .then(async (r) => {
      console.log('✓ seeded', r);
      await handle.close();
      process.exit(0);
    })
    .catch(async (err) => {
      console.error('✗ seed failed:', err);
      await handle.close();
      process.exit(1);
    });
}
