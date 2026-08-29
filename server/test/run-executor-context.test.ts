import { describe, it, expect } from 'vitest';
import { randomUUID } from 'node:crypto';
import type { RunTrace } from '@devdigest/shared';
import { Container } from '../src/platform/container.js';
import { loadConfig } from '../src/platform/config.js';
import { MockGitClient, MockLLMProvider, MockContextDocsReader } from '../src/adapters/mocks.js';
import { ContextService } from '../src/modules/context/service.js';
import type { ContextRepository } from '../src/modules/context/repository.js';
import type { OrderedDoc } from '../src/modules/context/helpers.js';
import { ReviewRunExecutor } from '../src/modules/reviews/run-executor.js';
import type { ReviewRepository, FindingRow, PullRow, ReviewRow } from '../src/modules/reviews/repository.js';
import type { AgentRow, RepoRow } from '../src/db/rows.js';
import type { Db } from '../src/db/client.js';
import type { AgentsRepository } from '../src/modules/agents/repository.js';

/**
 * Project Context Folder (specs/2026-08-26-project-context-folder.md) — the
 * run-executor's wiring of `container.projectContext` into the review run.
 * server-unit lane: substitutes the outside world via `ContainerOverrides`
 * (never module mocks), per server/AGENTS.md.
 *
 * A clean "approve, zero findings" fixture is used throughout so the
 * grounding/reduce machinery stays out of the way of what these tests assert.
 */

const APPROVE_FIXTURE = { verdict: 'approve', summary: 'looks good', score: 100, findings: [] };

function buildAgent(overrides: Partial<AgentRow> = {}): AgentRow {
  return {
    id: 'agent-1',
    workspaceId: 'ws-1',
    name: 'Reviewer',
    description: '',
    provider: 'openai',
    model: 'gpt-4.1',
    systemPrompt: 'You are a reviewer.',
    outputSchema: null,
    strategy: 'single-pass',
    ciFailOn: 'critical',
    repoIntel: false, // keep repo-intel enrichment out of scope for this test
    enabled: true,
    version: 1,
    createdBy: null,
    createdAt: new Date(),
    ...overrides,
  } as unknown as AgentRow;
}

function buildPull(overrides: Partial<PullRow> = {}): PullRow {
  return {
    id: 'pull-1',
    workspaceId: 'ws-1',
    repoId: 'repo-1',
    number: 42,
    title: 'Add rate limiting',
    author: 'octocat',
    branch: 'feature/rate-limit',
    base: 'main',
    headSha: 'deadbeef',
    lastReviewedSha: null,
    additions: 1,
    deletions: 0,
    filesCount: 1,
    status: 'needs_review',
    body: null,
    openedAt: null,
    updatedAt: null,
    ...overrides,
  } as unknown as PullRow;
}

function buildRepoRow(overrides: Partial<RepoRow> = {}): RepoRow {
  return {
    id: 'repo-1',
    workspaceId: 'ws-1',
    owner: 'acme',
    name: 'widgets',
    clonePath: '/clones/acme/widgets',
    ...overrides,
  } as unknown as RepoRow;
}

/** Records everything the executor persists, so tests can assert on the trace. */
class FakeReviewRepository {
  savedTraces: RunTrace[] = [];
  completed: { runId: string; values: Record<string, unknown> }[] = [];

  async getPrFiles() {
    return [];
  }
  async insertReview(values: Record<string, unknown>): Promise<ReviewRow> {
    return { id: 'review-1', ...values } as unknown as ReviewRow;
  }
  async insertFindings(_reviewId: string, findings: unknown[]): Promise<FindingRow[]> {
    return findings as FindingRow[];
  }
  async markReviewed() {}
  async completeAgentRun(runId: string, values: Record<string, unknown>) {
    this.completed.push({ runId, values });
  }
  async saveRunTrace(_runId: string, trace: RunTrace) {
    this.savedTraces.push(trace);
  }
}

function fakeContextRepo(overrides: Partial<ContextRepository> = {}): ContextRepository {
  const base = {
    getClonePath: async () => '/clones/acme/widgets',
    agentAttachments: async (): Promise<OrderedDoc[]> => [],
    skillAttachments: async (): Promise<OrderedDoc[]> => [],
    enabledSkillAttachmentsForAgent: async (): Promise<OrderedDoc[]> => [],
    setAgentAttachments: async () => undefined,
    setSkillAttachments: async () => undefined,
    usageCounts: async () => new Map<string, number>(),
  };
  return { ...base, ...overrides } as unknown as ContextRepository;
}

const noLinkedSkillsAgentsRepo = { linkedSkills: async () => [] } as unknown as AgentsRepository;

function buildExecutor(opts: {
  llm: MockLLMProvider;
  projectContext: ContextService;
}): { executor: ReviewRunExecutor; reviewRepo: FakeReviewRepository; container: Container } {
  const config = loadConfig({} as NodeJS.ProcessEnv);
  const container = new Container(config, {} as Db, {
    git: new MockGitClient(),
    llm: { openai: opts.llm },
    intent: {
      resolveForRun: async () => {
        throw new Error('intent disabled in this test');
      },
      get: async () => undefined,
    },
    projectContext: opts.projectContext,
  });
  const reviewRepo = new FakeReviewRepository();
  const executor = new ReviewRunExecutor(
    container,
    reviewRepo as unknown as ReviewRepository,
    noLinkedSkillsAgentsRepo,
  );
  return { executor, reviewRepo, container };
}

describe('ReviewRunExecutor — Project Context Folder (AC-14/15/18/21)', () => {
  it('AC-14: no attachments → specs_read is empty and prompt_assembly.specs is null', async () => {
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const projectContext = new ContextService(
      fakeContextRepo(), // getClonePath resolves, but agentAttachments() is empty
      new MockContextDocsReader({ entries: [] }),
      { count: (s: string) => s.length },
    );
    const { executor, reviewRepo } = buildExecutor({ llm, projectContext });
    const runId = randomUUID();

    await executor.executeRuns('ws-1', buildPull(), buildRepoRow(), [{ agent: buildAgent(), runId }]);

    expect(reviewRepo.savedTraces).toHaveLength(1);
    const trace = reviewRepo.savedTraces[0]!;
    expect(trace.specs_read).toEqual([]);
    expect(trace.prompt_assembly.specs).toBeNull();
    expect(reviewRepo.completed[0]!.values.status).toBe('done');
  });

  it('AC-13/15/18: attached documents reach the prompt with their path, in order, with exactly one LLM call', async () => {
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    const reader = new MockContextDocsReader({
      entries: [
        { path: '.devdigest/specs/architecture.md', sizeBytes: 20 },
        { path: '.devdigest/specs/security.md', sizeBytes: 10 },
      ],
      files: {
        '.devdigest/specs/architecture.md': 'api/ must not import db/ directly.',
        '.devdigest/specs/security.md': 'No secrets in logs.',
      },
    });
    const contextRepo = fakeContextRepo({
      agentAttachments: async (): Promise<OrderedDoc[]> => [
        { path: '.devdigest/specs/architecture.md', order: 0 },
        { path: '.devdigest/specs/security.md', order: 1 },
      ],
    });
    const projectContext = new ContextService(contextRepo, reader, { count: (s: string) => s.length });
    const { executor, reviewRepo } = buildExecutor({ llm, projectContext });
    const runId = randomUUID();

    await executor.executeRuns('ws-1', buildPull(), buildRepoRow(), [{ agent: buildAgent(), runId }]);

    const trace = reviewRepo.savedTraces[0]!;
    // specs_read lists both documents, in the attached order (AC-18).
    expect(trace.specs_read).toEqual([
      '.devdigest/specs/architecture.md · ≈34 tokens',
      '.devdigest/specs/security.md · ≈19 tokens',
    ]);
    // The repo-relative path is inside the rendered block itself (AC-13).
    const specsBlock = trace.prompt_assembly.specs as string;
    expect(specsBlock).toContain('.devdigest/specs/architecture.md');
    expect(specsBlock).toContain('api/ must not import db/ directly.');
    expect(specsBlock).toContain('.devdigest/specs/security.md');
    expect(specsBlock.indexOf('.devdigest/specs/architecture.md')).toBeLessThan(
      specsBlock.indexOf('.devdigest/specs/security.md'),
    );
    // Mechanical insertion only — no extra LLM call beyond the single review pass (AC-15).
    expect(llm.calls.filter((c) => c.method === 'completeStructured')).toHaveLength(1);
    expect(reviewRepo.completed[0]!.values.status).toBe('done');
  });

  it('AC-21: a missing/unreadable attached document is skipped, logged, and does not fail the run', async () => {
    const llm = new MockLLMProvider('openai', { structured: APPROVE_FIXTURE });
    // Only 'still-here.md' is in the fresh catalog; 'renamed-away.md' is attached
    // but no longer present — resolveForRun must degrade, not throw.
    const reader = new MockContextDocsReader({
      entries: [{ path: '.devdigest/specs/still-here.md', sizeBytes: 5 }],
      files: { '.devdigest/specs/still-here.md': 'Invariant text.' },
    });
    const contextRepo = fakeContextRepo({
      agentAttachments: async (): Promise<OrderedDoc[]> => [
        { path: '.devdigest/specs/still-here.md', order: 0 },
        { path: '.devdigest/specs/renamed-away.md', order: 1 },
      ],
    });
    const projectContext = new ContextService(contextRepo, reader, { count: (s: string) => s.length });
    const { executor, reviewRepo, container } = buildExecutor({ llm, projectContext });
    const runId = randomUUID();

    await executor.executeRuns('ws-1', buildPull(), buildRepoRow(), [{ agent: buildAgent(), runId }]);

    const trace = reviewRepo.savedTraces[0]!;
    expect(trace.specs_read).toEqual([
      '.devdigest/specs/still-here.md · ≈15 tokens',
      '.devdigest/specs/renamed-away.md · skipped (unreadable)',
    ]);
    // The run completed normally — a broken attachment degrades, it never fails the run.
    expect(reviewRepo.completed[0]!.values.status).toBe('done');
    // The skip is visible as an `info` event, not an `error` — a best-effort
    // enrichment failure must not paint the Live Log as failed
    // (insights/INSIGHTS.md, 2026-08-19; run-executor.ts buildProjectContext).
    const events = container.runBus.buffer(runId);
    expect(events.some((e) => e.kind === 'info' && e.msg.includes('Project context') && e.msg.includes('skipped'))).toBe(
      true,
    );
    expect(events.some((e) => e.kind === 'error')).toBe(false);
  });
});
