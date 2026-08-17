import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import {
  MockCodeIndex,
  MockGitClient,
  MockGitHubClient,
  MockLLMProvider,
} from '../src/adapters/mocks.js';
import type { RepoIntel } from '../src/modules/repo-intel/types.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[conventions] Docker not available — skipping integration tests.');
}

/**
 * Conventions Extractor, end to end.
 *
 * The point of these tests is the GATE, not the happy path: the model is a mock
 * that proposes a mix of real and invented rules, and the assertions are about
 * which ones survive. A candidate reaches the UI only if its evidence exists in
 * the clone and its confidence has been measured by grep.
 */

// ---- the clone the mock git client serves -------------------------------
const USERS_TS = [
  'import { db } from "../db";', // 1
  '', // 2
  'export async function load(id: string) {', // 3
  '  const user = await db.users.find(id);', // 4
  '  const posts = await db.posts.findMany({ userId: id });', // 5
  '  return { user, posts };', // 6
  '}', // 7
].join('\n');

const REDIS_TS = ['import Redis from "ioredis";', '', 'export const redis = new Redis(config.redisUrl);'].join(
  '\n',
);

const CLONE_FILES: Record<string, string> = {
  'src/api/users.ts': USERS_TS,
  'src/lib/redis.ts': REDIS_TS,
  'tsconfig.json': '{\n  "compilerOptions": {\n    "strict": true\n  }\n}',
};

// ---- what the mock model proposes ---------------------------------------
const REAL_RULE = {
  category: 'async' as const,
  rule: 'Always use async/await instead of .then() chains.',
  evidence_path: 'src/api/users.ts',
  // Deliberately WRONG: the snippet really lives on line 4. The gate must
  // repair this rather than throw the candidate away.
  evidence_line: 23,
  evidence_snippet: 'const user = await db.users.find(id);',
  confidence: 0.91,
  positive_pattern: 'await db\\.',
  counter_pattern: '\\.then\\(',
};

const PHANTOM_RULE = {
  category: 'api' as const,
  rule: 'All public route handlers return typed Result<T, ApiError>',
  // This file is not in the clone at all.
  evidence_path: 'src/api/public/index.ts',
  evidence_line: 14,
  evidence_snippet: 'function handler(): Result<Item[], ApiError> {',
  confidence: 0.78,
  positive_pattern: 'Result<',
  counter_pattern: null,
};

const UNSUPPORTED_RULE = {
  category: 'structure' as const,
  rule: 'Redis access goes through the src/lib/redis.ts singleton.',
  evidence_path: 'src/lib/redis.ts',
  evidence_line: 3,
  evidence_snippet: 'export const redis = new Redis(config.redisUrl);',
  confidence: 0.85,
  // Corroborated by exactly one occurrence — below MIN_SUPPORT.
  positive_pattern: 'new Redis\\(',
  counter_pattern: null,
};

const EXTRACTION_FIXTURE = {
  conventions: [REAL_RULE, PHANTOM_RULE, UNSUPPORTED_RULE],
};

d('conventions extractor', () => {
  let pg: PgFixture;
  let repoId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [repo] = await pg.handle.db
      .select({ id: t.repos.id })
      .from(t.repos)
      .where(eq(t.repos.fullName, 'acme/payments-api'));
    repoId = repo!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  /**
   * repo-intel is stubbed down to what this feature touches. `registerIndexJobHandlers`
   * is a no-op rather than absent: the repo-intel route plugin calls it at boot.
   */
  function repoIntelStub(samples: string[]): RepoIntel {
    return {
      registerIndexJobHandlers: () => undefined,
      getConventionSamples: async () => samples,
    } as unknown as RepoIntel;
  }

  async function makeApp(opts: {
    samples?: string[];
    files?: Record<string, string>;
    grep?: Record<string, { path: string; line: number; text: string }[]>;
    extraction?: unknown;
  }) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    const llm = new MockLLMProvider('openai', {
      structuredBySchema: {
        ConventionFileSelection: { files: opts.samples ?? [] },
        ConventionExtraction: opts.extraction ?? EXTRACTION_FIXTURE,
      },
    });
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient({ files: opts.files ?? CLONE_FILES }),
        github: new MockGitHubClient(),
        codeIndex: new MockCodeIndex({
          matchesByPattern: opts.grep ?? {
            // 9 supporting hits, 1 violation → measured confidence 0.9
            'await db\\.': hits(9),
            '\\.then\\(': hits(1),
            // A single hit — must be dropped by MIN_SUPPORT.
            'new Redis\\(': hits(1),
            'Result<': hits(4),
          },
          matches: [],
        }),
        llm: { openai: llm, anthropic: llm, openrouter: llm },
        repoIntel: repoIntelStub(opts.samples ?? ['src/api/users.ts', 'src/lib/redis.ts']),
      },
    });
  }

  function hits(n: number) {
    return Array.from({ length: n }, (_, i) => ({
      path: `src/f${i}.ts`,
      line: i + 1,
      text: 'match',
    }));
  }

  /** The extract route returns before the job runs; wait for the scan to settle. */
  async function waitForScan(app: Awaited<ReturnType<typeof buildApp>>, timeoutMs = 15_000) {
    const started = Date.now();
    for (;;) {
      const page = (await app.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })).json();
      if (page.scan && (page.scan.status === 'done' || page.scan.status === 'failed')) return page;
      if (Date.now() - started > timeoutMs) throw new Error('scan did not finish in time');
      await new Promise((r) => setTimeout(r, 100));
    }
  }

  async function resetConventions() {
    await pg.handle.db.delete(t.conventions).where(eq(t.conventions.repoId, repoId));
    await pg.handle.db.delete(t.conventionScans).where(eq(t.conventionScans.repoId, repoId));
  }

  it('drops a candidate whose evidence file is not in the clone', async () => {
    await resetConventions();
    const app = await makeApp({});

    const started = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/extract`,
    });
    expect(started.statusCode).toBe(202);
    expect(started.json().scan_id).toBeTruthy();

    const page = await waitForScan(app);
    expect(page.scan.status).toBe('done');

    const rules = page.candidates.map((c: { rule: string }) => c.rule);
    expect(rules).not.toContain(PHANTOM_RULE.rule);
    // The scan still counts it as raw, so the drop is visible, not silent.
    expect(page.scan.candidates_raw).toBeGreaterThan(page.scan.candidates_kept);
  });

  it('repairs a wrong line number instead of dropping a real snippet', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    const real = page.candidates.find((c: { rule: string }) => c.rule === REAL_RULE.rule);
    expect(real).toBeDefined();
    // The model claimed 23; the snippet is on line 4.
    expect(real.evidence_line).toBe(4);
    expect(real.evidence_end_line).toBe(4);
  });

  it('measures confidence by grep rather than trusting the model', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    const real = page.candidates.find((c: { rule: string }) => c.rule === REAL_RULE.rule);
    expect(real.support).toBe(9);
    expect(real.violations).toBe(1);
    expect(real.confidence).toBeCloseTo(0.9);
    // The model's own number is retained but is NOT the confidence.
    expect(real.model_confidence).toBeCloseTo(0.91);
    expect(real.confidence).not.toBeCloseTo(REAL_RULE.confidence);
  });

  it('drops a rule corroborated by a single occurrence', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    expect(page.candidates.map((c: { rule: string }) => c.rule)).not.toContain(UNSUPPORTED_RULE.rule);
  });

  it('derives a config rule with full confidence and no model involvement', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    const config = page.candidates.find((c: { origin: string }) => c.origin === 'config');
    expect(config).toBeDefined();
    expect(config.confidence).toBe(1);
    expect(config.evidence_path).toBe('tsconfig.json');
    expect(config.model_confidence).toBeNull();
  });

  it('accepts, edits and rejects a candidate', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);
    const target = page.candidates[0];

    const accepted = await app.inject({
      method: 'PATCH',
      url: `/conventions/${target.id}`,
      payload: { status: 'accepted' },
    });
    expect(accepted.statusCode).toBe(200);
    expect(accepted.json().status).toBe('accepted');

    const edited = await app.inject({
      method: 'PATCH',
      url: `/conventions/${target.id}`,
      payload: { rule: 'Edited rule text' },
    });
    expect(edited.json().rule).toBe('Edited rule text');
    // Editing must not silently reset the decision.
    expect(edited.json().status).toBe('accepted');

    const rejected = await app.inject({
      method: 'PATCH',
      url: `/conventions/${target.id}`,
      payload: { status: 'rejected' },
    });
    expect(rejected.json().status).toBe('rejected');
  });

  it('404s on patching an unknown convention', async () => {
    const app = await makeApp({});
    const res = await app.inject({
      method: 'PATCH',
      url: '/conventions/00000000-0000-0000-0000-000000000000',
      payload: { status: 'accepted' },
    });
    expect(res.statusCode).toBe(404);
  });

  it('does not re-propose a rule the user already decided on', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const first = await waitForScan(app);

    const real = first.candidates.find((c: { rule: string }) => c.rule === REAL_RULE.rule);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${real.id}`,
      payload: { status: 'rejected' },
    });

    // Re-scan: the same fixture is proposed again, and must be filtered out.
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const second = await waitForScan(app);

    const pendingRules = second.candidates
      .filter((c: { status: string }) => c.status === 'pending')
      .map((c: { rule: string }) => c.rule);
    expect(pendingRules).not.toContain(REAL_RULE.rule);
    // The rejected one is still listed — as rejected, exactly once.
    const occurrences = second.candidates.filter((c: { rule: string }) => c.rule === REAL_RULE.rule);
    expect(occurrences).toHaveLength(1);
    expect(occurrences[0].status).toBe('rejected');
  });

  it('re-proposes a candidate the user has NOT decided on yet', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const first = await waitForScan(app);
    const firstPending = first.candidates.filter((c: { status: string }) => c.status === 'pending');
    expect(firstPending.length).toBeGreaterThan(0);

    // Decide nothing, then re-scan. The dedup set is DECIDED rules only, so a
    // still-pending candidate must come back rather than vanish.
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const second = await waitForScan(app);

    expect(second.scan.candidates_kept).toBe(first.scan.candidates_kept);
    expect(second.candidates.map((c: { rule: string }) => c.rule).sort()).toEqual(
      first.candidates.map((c: { rule: string }) => c.rule).sort(),
    );
  });

  it('drops a candidate whose counter-pattern cannot be counted', async () => {
    await resetConventions();
    const uncountable = {
      ...REAL_RULE,
      rule: 'Promises are always awaited at the call site.',
      // A valid positive pattern, but a counter pattern that cannot compile.
      // Counting it as zero violations would hand the rule a perfect 1.0
      // precisely BECAUSE the check failed.
      counter_pattern: '([unclosed',
    };
    const app = await makeApp({ extraction: { conventions: [uncountable] } });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    expect(page.candidates.map((c: { rule: string }) => c.rule)).not.toContain(uncountable.rule);
  });

  it('rejects a pattern that would be smuggled into ripgrep as a flag', async () => {
    await resetConventions();
    const flagSmuggle = {
      ...REAL_RULE,
      rule: 'Configuration is loaded through a single module.',
      positive_pattern: '--pre=/bin/sh',
    };
    const app = await makeApp({ extraction: { conventions: [flagSmuggle] } });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    expect(page.candidates.map((c: { rule: string }) => c.rule)).not.toContain(flagSmuggle.rule);
  });

  it('reaps a scan orphaned by a dead process instead of leaving it running', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    await waitForScan(app);

    // Simulate the process dying mid-scan: the row is left `running` and no
    // runner exists to finish it. The UI would poll it forever.
    await pg.handle.db
      .update(t.conventionScans)
      .set({ status: 'running', finishedAt: null })
      .where(eq(t.conventionScans.repoId, repoId));

    // Booting a fresh app runs the reaper.
    const rebooted = await makeApp({});
    const page = (
      await rebooted.inject({ method: 'GET', url: `/repos/${repoId}/conventions` })
    ).json();

    expect(page.scan.status).toBe('failed');
    expect(page.scan.error).toContain('restarted');
  });

  it('404s when extracting for a repo outside the workspace', async () => {
    const app = await makeApp({});
    const res = await app.inject({
      method: 'POST',
      url: '/repos/00000000-0000-0000-0000-000000000000/conventions/extract',
    });
    expect(res.statusCode).toBe(404);
  });

  it('404s on the event stream of a scan that is not this repo’s', async () => {
    const app = await makeApp({});
    const res = await app.inject({
      method: 'GET',
      url: `/repos/${repoId}/conventions/scans/00000000-0000-0000-0000-000000000000/events`,
    });
    expect(res.statusCode).toBe(404);
  });

  it('refuses to build a skill from an id set that does not fully resolve', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);
    const real = page.candidates[0];

    const res = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: 'partial',
        description: 'One id is not ours',
        body: '# partial',
        convention_ids: [real.id, '00000000-0000-0000-0000-000000000000'],
      },
    });
    // Silently building from 1 of 2 rules would produce a skill the author
    // never reviewed.
    expect(res.statusCode).toBe(404);
  });

  it('keeps the dedup key in step when a rule is edited', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);
    const real = page.candidates.find((c: { rule: string }) => c.rule === REAL_RULE.rule);

    await app.inject({
      method: 'PATCH',
      url: `/conventions/${real.id}`,
      payload: { rule: 'A completely different rule about caching.' },
    });
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${real.id}`,
      payload: { status: 'rejected' },
    });

    // The ORIGINAL rule text was never decided on, so a re-scan must offer it
    // again — which only works if the edit moved the hash with the text.
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const second = await waitForScan(app);
    const pending = second.candidates
      .filter((c: { status: string }) => c.status === 'pending')
      .map((c: { rule: string }) => c.rule);
    expect(pending).toContain(REAL_RULE.rule);
  });

  it('builds a deterministic skill draft from the accepted conventions', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    const real = page.candidates.find((c: { rule: string }) => c.rule === REAL_RULE.rule);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${real.id}`,
      payload: { status: 'accepted' },
    });

    const preview = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill/preview`,
      payload: {},
    });
    expect(preview.statusCode).toBe(200);
    const draft = preview.json();
    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.body).toContain('# payments-api-conventions');
    expect(draft.body).toContain(REAL_RULE.rule);
    // The repaired line, not the model's claim, is what the skill cites.
    expect(draft.body).toContain('src/api/users.ts:4');
    expect(draft.evidence_files).toContain('src/api/users.ts');
  });

  it('creates the merged skill, links it to an agent and marks the sources', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    const real = page.candidates.find((c: { rule: string }) => c.rule === REAL_RULE.rule);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${real.id}`,
      payload: { status: 'accepted' },
    });

    const draft = (
      await app.inject({
        method: 'POST',
        url: `/repos/${repoId}/conventions/skill/preview`,
        payload: {},
      })
    ).json();

    const agents = (await app.inject({ method: 'GET', url: '/agents' })).json();
    const agentId = agents[0].id;

    const created = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: {
        name: draft.name,
        description: draft.description,
        body: draft.body,
        enabled: true,
        convention_ids: draft.convention_ids,
        agent_ids: [agentId],
      },
    });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.type).toBe('convention');
    expect(skill.source).toBe('extracted');
    expect(skill.evidence_files).toContain('src/api/users.ts');

    // The skill is in the Skills Lab…
    const skills = (await app.inject({ method: 'GET', url: '/skills' })).json();
    expect(skills.map((s: { id: string }) => s.id)).toContain(skill.id);

    // …linked to the agent…
    const links = (await app.inject({ method: 'GET', url: `/agents/${agentId}/skills` })).json();
    expect(links.map((l: { skill_id: string }) => l.skill_id)).toContain(skill.id);

    // …and its source convention now points at it.
    const [row] = await pg.handle.db
      .select({ skillId: t.conventions.skillId })
      .from(t.conventions)
      .where(and(eq(t.conventions.id, real.id)));
    expect(row!.skillId).toBe(skill.id);
  });

  it('refuses to read an evidence path that escapes the clone', async () => {
    await resetConventions();
    const traversal = {
      ...REAL_RULE,
      rule: 'Environment secrets live in the home directory dotfile.',
      evidence_path: '../../../../etc/passwd',
      evidence_snippet: 'root:x:0:0:root:/root:/bin/bash',
    };
    const app = await makeApp({ extraction: { conventions: [traversal] } });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    expect(page.scan.status).toBe('done');
    expect(page.candidates.map((c: { rule: string }) => c.rule)).not.toContain(traversal.rule);
  });

  it('honours the skill type chosen in the modal, defaulting to convention', async () => {
    await resetConventions();
    const app = await makeApp({});
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    const real = page.candidates.find((c: { rule: string }) => c.rule === REAL_RULE.rule);
    await app.inject({
      method: 'PATCH',
      url: `/conventions/${real.id}`,
      payload: { status: 'accepted' },
    });

    const base = {
      name: 'payments-api-rules',
      description: 'Typed on purpose',
      body: '# rules\nSomething.',
      convention_ids: [real.id],
    };

    const typed = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: { ...base, type: 'rubric' },
    });
    expect(typed.json().type).toBe('rubric');

    const untyped = await app.inject({
      method: 'POST',
      url: `/repos/${repoId}/conventions/skill`,
      payload: base,
    });
    expect(untyped.json().type).toBe('convention');
  });

  it('finishes cleanly with only config rules when the repo is not indexed', async () => {
    await resetConventions();
    const app = await makeApp({ samples: [] });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    expect(page.scan.status).toBe('done');
    // Degradation, not failure: config rules still come through.
    expect(page.candidates.every((c: { origin: string }) => c.origin === 'config')).toBe(true);
    expect(page.scan.error).toBeNull();
  });

  it('survives a repo whose clone has no readable files', async () => {
    await resetConventions();
    const app = await makeApp({ files: {} });
    await app.inject({ method: 'POST', url: `/repos/${repoId}/conventions/extract` });
    const page = await waitForScan(app);

    expect(page.scan.status).toBe('done');
    expect(page.candidates).toEqual([]);
  });
});
