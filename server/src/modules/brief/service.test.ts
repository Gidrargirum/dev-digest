import { describe, expect, it, vi } from 'vitest';
import type {
  Brief,
  LLMProvider,
  PrBlastResponse,
  PrBriefRecord,
  StructuredRequest,
} from '@devdigest/shared';
import { BriefService } from './service.js';
import type {
  BriefDeps,
  BriefLockedRepository,
  BriefModelChoice,
  BriefRepositoryPort,
} from './types.js';

const MODEL_BRIEF: Brief = {
  what: 'Adds a guarded endpoint.',
  why: 'The API needs a safer write path.',
  risk_level: 'high',
  risks: [
    {
      kind: 'security',
      title: 'Authorization boundary',
      explanation: 'The handler changes who may write data.',
      severity: 'high',
      file_refs: ['src/routes/write.ts:12', 'invented.ts:3'],
    },
  ],
  review_focus: [
    { label: 'Read the route first', file_refs: ['src/routes/write.ts:12'] },
    { label: 'Ignore this hallucination', file_refs: ['invented.ts:3'] },
  ],
};

function record(headSha = 'head-1'): PrBriefRecord {
  return {
    ...MODEL_BRIEF,
    pr_id: 'pr-1',
    head_sha: headSha,
    run_id: 'run-1',
    generated_at: '2026-08-28T00:00:00.000Z',
  };
}

function fixture(cached?: PrBriefRecord) {
  const modelChoice: BriefModelChoice = { provider: 'openai', model: 'gpt-4.1' };
  const blastResponse: PrBlastResponse = {
    status: 'ok',
    reason: null,
    blast: {
      changed_symbols: [],
      downstream: [],
      summary: 'The public route changes.',
    },
    counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    prior_prs: [],
  };
  const upsertBrief = vi.fn(async () => undefined);
  const tx = {
    findBrief: vi.fn(async () => cached),
    findIntentFacts: vi.fn(async () => ({
      intent: 'Add a guarded write endpoint.',
      inScope: ['route'],
      outOfScope: ['database redesign'],
    })),
    getChangedFiles: vi.fn(async () => [
      { path: 'src/routes/write.ts', additions: 10, deletions: 2 },
    ]),
    findPullContext: vi.fn(async () => undefined),
    upsertBrief,
  } as unknown as BriefLockedRepository;
  const repo = {
    resolvePr: vi.fn(async () => ({ id: 'pr-1', repoId: 'repo-1', headSha: 'head-1' })),
    findBrief: vi.fn(async () => cached),
    withPrLock: vi.fn(async (_prId: string, fn: (locked: BriefLockedRepository) => Promise<unknown>) => fn(tx)),
  } as unknown as BriefRepositoryPort;
  const calls: StructuredRequest<unknown>[] = [];
  const llm = {
    id: 'openai',
    completeStructured: vi.fn(async (req: StructuredRequest<unknown>) => {
      calls.push(req);
      return {
        data: MODEL_BRIEF,
        model: req.model,
        tokensIn: 100,
        tokensOut: 50,
        costUsd: 0.01,
        raw: '{}',
        attempts: 1,
      };
    }),
  } as unknown as LLMProvider;
  const deps: BriefDeps = {
    llm: vi.fn(async () => llm),
    github: vi.fn(async () => {
      throw new Error('not needed');
    }),
    featureModel: vi.fn(async () => modelChoice),
    blast: {
      getBlast: vi.fn(async () => blastResponse),
    },
  };
  return { service: new BriefService(deps, repo), repo, tx, upsertBrief, llm, calls };
}

describe('BriefService', () => {
  it('returns null for a stale cache and never invokes the model on reads', async () => {
    const f = fixture(record('old-head'));

    await expect(f.service.get('ws-1', 'pr-1')).resolves.toEqual({ kind: 'ok', brief: null });
    expect(f.llm.completeStructured).not.toHaveBeenCalled();
  });

  it('rechecks the cache inside the lock and skips generation on a matching head', async () => {
    const f = fixture(record());

    await expect(
      f.service.generateForRun({ workspaceId: 'ws-1', prId: 'pr-1', headSha: 'head-1', runId: 'run-1' }),
    ).resolves.toEqual({});
    expect(f.llm.completeStructured).not.toHaveBeenCalled();
    expect(f.upsertBrief).not.toHaveBeenCalled();
  });

  it('makes one structured call, grounds refs, and attributes a run only on run generation', async () => {
    const f = fixture();

    await expect(
      f.service.generateForRun({ workspaceId: 'ws-1', prId: 'pr-1', headSha: 'head-1', runId: 'run-7' }),
    ).resolves.toEqual({ usage: { tokensIn: 100, tokensOut: 50, costUsd: 0.01 } });

    expect(f.llm.completeStructured).toHaveBeenCalledTimes(1);
    expect(f.calls[0]!.schemaName).toBe('PrBrief');
    expect(f.calls[0]!.messages[1]!.content).not.toContain('diff --git');
    expect(f.upsertBrief).toHaveBeenCalledWith({
      prId: 'pr-1',
      headSha: 'head-1',
      runId: 'run-7',
      brief: {
        ...MODEL_BRIEF,
        risks: [{ ...MODEL_BRIEF.risks[0]!, file_refs: ['src/routes/write.ts:12'] }],
        review_focus: [{ label: 'Read the route first', file_refs: ['src/routes/write.ts:12'] }],
      },
    });
  });

  it('force regeneration bypasses the cache and writes run_id null', async () => {
    const f = fixture(record());

    await expect(f.service.regenerate('ws-1', 'pr-1')).resolves.toMatchObject({ kind: 'ok' });
    expect(f.llm.completeStructured).toHaveBeenCalledTimes(1);
    expect(f.upsertBrief).toHaveBeenCalledWith(expect.objectContaining({ runId: null }));
  });
});
