import { describe, it, expect } from 'vitest';
import type { StructuredRequest, StructuredResult } from '@devdigest/shared';
import { BriefService } from './service.js';
import type { BriefRepository } from './repository.js';
import type { BriefDeps, BriefJobs, BriefComputeParams } from './types.js';
import type { InputFile, StateKeyFile } from './helpers.js';

/**
 * Unit coverage for the input-assembly seam of `BriefService.compute` (AC-9,
 * AC-10, AC-18a). The service is exercised through the registered job handler
 * with hand-rolled port fakes — no container, no DB, no real LLM.
 */

const SECRET_HUNK = '   port: 3000,\n+  stripeKey = "sk_live_LEAK"\n   redisUrl: x,';

interface Harness {
  service: BriefService;
  runJob: (params: BriefComputeParams) => Promise<void>;
  llmCalls: StructuredRequest<unknown>[];
  upserts: unknown[];
  llmData: Record<string, unknown>;
}

function makeHarness(opts: {
  files: InputFile[];
  headSha?: string;
  body?: string | null;
  llmData?: Record<string, unknown>;
}): Harness {
  const llmCalls: StructuredRequest<unknown>[] = [];
  const upserts: unknown[] = [];
  const llmData: Record<string, unknown> = opts.llmData ?? {
    what: 'does a thing',
    why: 'because reasons',
    risk_level: 'low',
    risks: [],
    review_focus: [],
  };

  const stateKeyFiles: StateKeyFile[] = opts.files.map((f) => ({
    path: f.path,
    additions: f.additions,
    deletions: f.deletions,
  }));

  const repo = {
    resolvePr: async () => ({
      id: 'pr-1',
      repoId: 'repo-1',
      number: 7,
      title: 'A title',
      body: opts.body ?? null,
      branch: 'feat/x',
      headSha: opts.headSha ?? 'sha-1',
    }),
    resolveRepoRef: async () => ({ owner: 'acme', name: 'widget' }),
    getChangedFiles: async () => opts.files,
    getStateKeyFiles: async () => stateKeyFiles,
    findBrief: async () => undefined,
    findBriefForWorkspace: async () => undefined,
    upsertBrief: async (input: unknown) => {
      upserts.push(input);
      return input;
    },
  } as unknown as BriefRepository;

  const deps: BriefDeps = {
    github: async () => ({
      getIssue: async (_r: unknown, n: number) => ({
        number: n,
        title: `Issue ${n}`,
        body: 'issue body',
        state: 'open' as const,
      }),
    }) as unknown as Awaited<ReturnType<BriefDeps['github']>>,
    llm: async () =>
      ({
        completeStructured: async <T>(req: StructuredRequest<T>): Promise<StructuredResult<T>> => {
          llmCalls.push(req as StructuredRequest<unknown>);
          return {
            data: llmData as T,
            model: 'gpt-4.1',
            tokensIn: 10,
            tokensOut: 5,
            costUsd: null,
            raw: '{}',
            attempts: 1,
          };
        },
      }) as unknown as Awaited<ReturnType<BriefDeps['llm']>>,
    featureModel: async () => ({ provider: 'openai', model: 'gpt-4.1' }),
    intent: async () => undefined,
    logger: { error: () => undefined },
  };

  let handler: ((payload: unknown) => Promise<void>) | undefined;
  const jobs: BriefJobs = {
    register: (_kind, h) => {
      handler = h;
    },
    enqueue: async () => ({ id: 'job-1', done: Promise.resolve() }),
  };

  const service = new BriefService(deps, repo, jobs);
  service.registerJobHandlers();
  if (!handler) throw new Error('job handler was not registered');

  return {
    service,
    runJob: (params) => handler!(params),
    llmCalls,
    upserts,
    llmData,
  };
}

const FILES: InputFile[] = [
  {
    path: 'src/config.ts',
    additions: 1,
    deletions: 0,
    patch: `@@ -10,3 +10,4 @@\n${SECRET_HUNK}`,
  },
];

describe('BriefService.compute — input assembly', () => {
  it('makes exactly one structured LLM call (AC-11)', async () => {
    const h = makeHarness({ files: FILES });
    await h.runJob({ workspaceId: 'ws-1', prId: 'pr-1' });
    expect(h.llmCalls).toHaveLength(1);
    expect(h.llmCalls[0]!.schemaName).toBe('PrWhyRiskBrief');
  });

  it('never puts hunk-body / raw patch text into the prompt (AC-10)', async () => {
    const h = makeHarness({ files: FILES });
    await h.runJob({ workspaceId: 'ws-1', prId: 'pr-1' });
    const content = h.llmCalls[0]!.messages.map((m) => m.content).join('\n');
    expect(content).not.toContain('sk_live_LEAK');
    expect(content).not.toContain('redisUrl: x');
    expect(content).not.toContain('@@ -10,3 +10,4 @@');
    // the derived changed-file line IS carried, as a path + counts summary
    expect(content).toContain('src/config.ts');
  });

  it('records the contributing sources, with pr_title always present (AC-17)', async () => {
    const h = makeHarness({ files: FILES, body: 'Fixes #12' });
    await h.runJob({ workspaceId: 'ws-1', prId: 'pr-1' });
    const sources = (h.upserts[0] as { sources: string[] }).sources;
    expect(sources).toContain('pr_title');
    expect(sources).toContain('pr_body');
    expect(sources).toContain('pr_files');
    expect(sources).toContain('issue#12');
  });

  it('recognizes a cross-repo issue reference but never fetches it (AC-19)', async () => {
    const h = makeHarness({ files: FILES, body: 'Closes other-org/other-repo#99' });
    await h.runJob({ workspaceId: 'ws-1', prId: 'pr-1' });
    const sources = (h.upserts[0] as { sources: string[] }).sources;
    expect(sources.some((s) => s.includes('#99') && s.includes('skipped'))).toBe(true);
  });

  it('blast is consume-only: with no blastSummary param, no risk keeps an endpoint (AC-18/AC-18a)', async () => {
    const h = makeHarness({
      files: FILES,
      llmData: {
        what: 'w',
        why: 'y',
        risk_level: 'medium',
        risks: [{ title: 'endpoint risk', path: 'src/config.ts', line: 11, endpoint: 'POST /pay' }],
        review_focus: [],
      },
    });
    await h.runJob({ workspaceId: 'ws-1', prId: 'pr-1' }); // params.blastSummary absent
    const risks = (h.upserts[0] as { risks: { endpoint: string | null }[] }).risks;
    expect(risks).toHaveLength(1);
    expect(risks[0]!.endpoint).toBeNull();
  });

  it('blast is consume-only: a supplied blastSummary param is READ, never resolved', async () => {
    const h = makeHarness({
      files: FILES,
      llmData: {
        what: 'w',
        why: 'y',
        risk_level: 'high',
        risks: [{ title: 'endpoint risk', path: 'src/config.ts', line: 11, endpoint: 'POST /pay' }],
        review_focus: [],
      },
    });
    await h.runJob({
      workspaceId: 'ws-1',
      prId: 'pr-1',
      blastSummary: { impactedEndpoints: ['POST /pay'] },
    });
    const risks = (h.upserts[0] as { risks: { endpoint: string | null }[] }).risks;
    expect(risks[0]!.endpoint).toBe('POST /pay');
  });

  it('stores a valid brief with empty arrays when grounding drops everything (AC-14)', async () => {
    const h = makeHarness({
      files: FILES,
      llmData: {
        what: 'still valid',
        why: 'reasons',
        risk_level: 'low',
        risks: [{ title: 'ghost', path: 'not/in/pr.ts', line: 1 }],
        review_focus: [{ path: 'not/in/pr.ts', line: 1, reason: 'x' }],
      },
    });
    await h.runJob({ workspaceId: 'ws-1', prId: 'pr-1' });
    const stored = h.upserts[0] as { what: string; risks: unknown[]; reviewFocus: unknown[] };
    expect(stored.what).toBe('still valid');
    expect(stored.risks).toEqual([]);
    expect(stored.reviewFocus).toEqual([]);
  });
});
