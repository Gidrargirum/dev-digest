import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import * as t from '../src/db/schema.js';
import { EvalRepository } from '../src/modules/eval/repository.js';
import { AgentsRepository } from '../src/modules/agents/repository.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[eval-cases] Docker not available — skipping integration tests.');
}

/**
 * A5 — eval-case authoring: frozen inputs (AC-5), reject-malformed-body (AC-7),
 * seed coverage (AC-17), and workspace isolation (AC-34).
 *
 * `git`/`github` are overridden with a stub that THROWS on any method call —
 * a passing test proves structurally that case creation/reads/single-case run
 * never touch GitHub or git (AC-5, AC-14's sibling for the CRUD surface).
 */
function throwingClient(name: string) {
  return new Proxy(
    {},
    {
      get(_target, prop) {
        return (..._args: unknown[]) => {
          throw new Error(`unexpected ${name}.${String(prop)} call`);
        };
      },
    },
  );
}

d('eval-cases (A5) — authoring, malformed input, seed, isolation', () => {
  let pg: PgFixture;
  let defaultWorkspaceId: string;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
    const [ws] = await pg.handle.db.select().from(t.workspaces).where(eq(t.workspaces.name, 'default'));
    defaultWorkspaceId = ws!.id;
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        git: throwingClient('git') as any,
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        github: throwingClient('github') as any,
      },
    });
  }

  async function createAgent(app: Awaited<ReturnType<typeof makeApp>>, name: string) {
    const created = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4.1', system_prompt: 'Review the diff.' },
    });
    expect(created.statusCode).toBe(201);
    return created.json() as { id: string; version: number };
  }

  const DIFF = [
    'diff --git a/src/config.ts b/src/config.ts',
    '--- a/src/config.ts',
    '+++ b/src/config.ts',
    '@@ -1,2 +1,3 @@',
    ' export const config = {',
    "+  apiKey: 'sk_live_xxx',",
    ' };',
  ].join('\n');

  it('AC-5: created case inputs survive the originating PR being mutated/deleted, with no GitHub/git call', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'A5 Case Owner');

    // A "live" PR whose diff/files/meta we freeze into the case at creation time.
    const [repo] = await pg.handle.db
      .insert(t.repos)
      .values({ workspaceId: defaultWorkspaceId, owner: 'acme', name: 'ac5-repo', fullName: 'acme/ac5-repo' })
      .returning();
    const [pr] = await pg.handle.db
      .insert(t.pullRequests)
      .values({
        workspaceId: defaultWorkspaceId,
        repoId: repo!.id,
        number: 501,
        title: 'Add config key',
        author: 'dev',
        branch: 'feat/x',
        base: 'main',
        headSha: 'deadbeef',
        additions: 1,
        deletions: 0,
        filesCount: 1,
        status: 'needs_review',
      })
      .returning();

    const inputFiles = ['src/config.ts'];
    const inputMeta = { pr_number: pr!.number, title: pr!.title };

    const created = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'Frozen from PR #501',
        input_diff: DIFF,
        input_files: inputFiles,
        input_meta: inputMeta,
        expectation_type: 'must_find',
        expected_output: [
          { file: 'src/config.ts', start_line: 2, end_line: 2, severity: 'CRITICAL', category: 'security', title: 'Hardcoded key' },
        ],
      },
    });
    expect(created.statusCode).toBe(201);
    const caseId = created.json().id as string;

    // Mutate then delete the originating PR — the case must not reflect either.
    await pg.handle.db.update(t.pullRequests).set({ title: 'Renamed after the fact' }).where(eq(t.pullRequests.id, pr!.id));
    await pg.handle.db.delete(t.pullRequests).where(eq(t.pullRequests.id, pr!.id));

    const reread = await app.inject({ method: 'GET', url: `/eval-cases/${caseId}` });
    expect(reread.statusCode).toBe(200);
    const body = reread.json();
    expect(body.input_diff).toBe(DIFF);
    expect(body.input_files).toEqual(inputFiles);
    expect(body.input_meta).toEqual(inputMeta);

    // The throwing git/github stubs would have thrown (failing this test) had
    // create OR read reached out live — reaching here proves they never did.
    await app.close();
  });

  // AC-7 reads "the system shall reject the create/update with `400`". The
  // actual, consistent seam behavior of THIS codebase is `422` for every
  // route-schema (Zod) validation failure — see `app.ts`'s global error
  // handler ("Validation → 422") and `agents-versions.it.test.ts`'s own
  // "422, not 404" case. That convention predates this feature and applies
  // uniformly; nothing in the eval module special-cases it away from 422 to
  // literal `400`. Asserted here as the real seam behavior — see the test
  // report's "Blocked — needs production change" section for the AC-7
  // wording/behavior mismatch this surfaces.
  it('AC-7: malformed expected_output is rejected at the edge (422) and nothing is persisted', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'A5 Malformed Owner');

    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'Bad case',
        input_diff: DIFF,
        expectation_type: 'must_find',
        // Not an array of EvalExpectedFinding — a bare string.
        expected_output: 'not-json-shaped',
      },
    });
    expect(bad.statusCode).toBe(422);

    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(list).toHaveLength(0);
    await app.close();
  });

  it('AC-7: expected_output entries missing required fields are rejected at the edge (422)', async () => {
    const app = await makeApp();
    const agent = await createAgent(app, 'A5 Partial Owner');

    const bad = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/eval-cases`,
      payload: {
        owner_kind: 'agent',
        owner_id: agent.id,
        name: 'Partial case',
        input_diff: DIFF,
        expectation_type: 'must_find',
        // Missing severity/category/title — not a valid EvalExpectedFinding.
        expected_output: [{ file: 'src/config.ts', start_line: 2, end_line: 2 }],
      },
    });
    expect(bad.statusCode).toBe(422);

    const list = (await app.inject({ method: 'GET', url: `/agents/${agent.id}/eval-cases` })).json();
    expect(list).toHaveLength(0);
    await app.close();
  });

  it('AC-17: the seeded demonstration agent carries >= 8 eval cases across both expectation types', async () => {
    const app = await makeApp();
    const [generalReviewer] = await pg.handle.db
      .select()
      .from(t.agents)
      .where(and(eq(t.agents.workspaceId, defaultWorkspaceId), eq(t.agents.name, 'General Reviewer')));
    expect(generalReviewer).toBeDefined();

    const res = await app.inject({ method: 'GET', url: `/agents/${generalReviewer!.id}/eval-cases` });
    expect(res.statusCode).toBe(200);
    const cases = res.json() as { expectation_type: string }[];
    expect(cases.length).toBeGreaterThanOrEqual(8);
    expect(cases.some((c) => c.expectation_type === 'must_find')).toBe(true);
    expect(cases.some((c) => c.expectation_type === 'must_not_flag')).toBe(true);
    await app.close();
  });

  it('AC-34: a case/agent id from another workspace 404s on read, run and mutation', async () => {
    const app = await makeApp();

    const [otherWs] = await pg.handle.db.insert(t.workspaces).values({ name: 'eval-cases-other' }).returning();
    const agentsRepo = new AgentsRepository(pg.handle.db);
    const foreignAgent = await agentsRepo.insert({
      workspaceId: otherWs!.id,
      name: 'Foreign Agent',
      provider: 'openai',
      model: 'gpt-4o-mini',
      systemPrompt: 'x',
    });
    const evalRepo = new EvalRepository(pg.handle.db);
    const foreignCase = await evalRepo.insertCase({
      workspaceId: otherWs!.id,
      ownerId: foreignAgent.id,
      name: 'Foreign case',
      inputDiff: DIFF,
      expectationType: 'must_find',
      expectedOutput: [],
    });

    // Every read/mutation below runs in the DEFAULT workspace context
    // (LocalNoAuthProvider always resolves the same workspace) — a resource
    // that lives in `otherWs` must be invisible, not merely unauthorized.
    expect((await app.inject({ method: 'GET', url: `/agents/${foreignAgent.id}/eval-cases` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'GET', url: `/eval-cases/${foreignCase.id}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'PUT', url: `/eval-cases/${foreignCase.id}`, payload: { name: 'renamed' } }))
        .statusCode,
    ).toBe(404);
    expect((await app.inject({ method: 'DELETE', url: `/eval-cases/${foreignCase.id}` })).statusCode).toBe(404);
    expect((await app.inject({ method: 'POST', url: `/eval-cases/${foreignCase.id}/run` })).statusCode).toBe(404);

    // The foreign case must survive every one of the denied attempts above.
    const stillThere = await evalRepo.getCase(otherWs!.id, foreignCase.id);
    expect(stillThere).toBeDefined();
    await app.close();
  });
});
