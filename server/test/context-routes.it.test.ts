import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq } from 'drizzle-orm';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient, MockContextDocsReader } from '../src/adapters/mocks.js';
import type { ContextDocEntry } from '../src/ports/index.js';
import * as t from '../src/db/schema.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[context] Docker not available — skipping integration tests.');
}

/**
 * Project Context Folder — document catalog + agent/skill attachment routes,
 * against a real Postgres (server-integration lane). AC-16 (path verified
 * against a fresh, disk-backed catalog) is covered at the unit lane
 * (service.test.ts); here `contextDocs` is substituted with
 * `MockContextDocsReader` via `ContainerOverrides` (no module mocks) so these
 * tests focus on persistence + wiring: catalog shape, storage minimality,
 * reorder persistence, broken-attachment survival, and usage counting.
 */
d('Project Context Folder — routes (agent/skill attachment + catalog)', () => {
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
    // The catalog reader only runs once the repo has a clone path (AC-5);
    // seed() leaves it null, so give this repo a (mock) one.
    await pg.handle.db.update(t.repos).set({ clonePath: '/mock/acme/payments-api' }).where(eq(t.repos.id, repoId));
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp(entries: ContextDocEntry[], files: Record<string, string> = {}) {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: {
        git: new MockGitClient(),
        github: new MockGitHubClient(),
        contextDocs: new MockContextDocsReader({ entries, files }),
      },
    });
  }

  const CATALOG_ENTRIES: ContextDocEntry[] = [
    { path: '.devdigest/specs/architecture.md', sizeBytes: 34 },
    { path: '.devdigest/docs/onboarding.md', sizeBytes: 9 },
  ];
  const CATALOG_FILES = {
    '.devdigest/specs/architecture.md': 'api/ must not import db/ directly.',
    '.devdigest/docs/onboarding.md': 'Welcome!',
  };

  async function createAgent(app: Awaited<ReturnType<typeof buildApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/agents',
      payload: { name, provider: 'openai', model: 'gpt-4o-mini', system_prompt: 'Review.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  async function createSkill(app: Awaited<ReturnType<typeof buildApp>>, name: string) {
    const res = await app.inject({
      method: 'POST',
      url: '/skills',
      payload: { name, description: 'd', type: 'convention', body: 'Body text.' },
    });
    expect(res.statusCode).toBe(201);
    return res.json().id as string;
  }

  it('AC-1: GET catalog returns path/name/source/size_bytes/tokens for every .md under the search roots', async () => {
    const app = await makeApp(CATALOG_ENTRIES, CATALOG_FILES);

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` });
    expect(res.statusCode).toBe(200);
    const docs = res.json() as Array<Record<string, unknown>>;
    expect(docs).toHaveLength(2);

    const arch = docs.find((doc) => doc.path === '.devdigest/specs/architecture.md');
    expect(arch).toMatchObject({
      path: '.devdigest/specs/architecture.md',
      name: 'architecture.md',
      source: 'specs',
      size_bytes: 34,
    });
    expect(typeof arch!.tokens).toBe('number');

    const onboarding = docs.find((doc) => doc.path === '.devdigest/docs/onboarding.md');
    expect(onboarding).toMatchObject({ name: 'onboarding.md', source: 'docs' });

    await app.close();
  });

  it('AC-8/AC-9: attaching stores only (path, order) — never content — and reorder persists as the new order', async () => {
    const app = await makeApp(CATALOG_ENTRIES, CATALOG_FILES);
    const agentId = await createAgent(app, 'AC-8/9 agent');

    const first = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: {
        repo_id: repoId,
        paths: ['.devdigest/specs/architecture.md', '.devdigest/docs/onboarding.md'],
      },
    });
    expect(first.statusCode).toBe(200);
    expect(first.json()).toEqual([
      { path: '.devdigest/specs/architecture.md', order: 0, broken: false },
      { path: '.devdigest/docs/onboarding.md', order: 1, broken: false },
    ]);

    // Storage minimality (AC-8): the row shape is exactly agent/repo/path/order
    // (+timestamp) — no content column exists to leak a copy of the text into.
    const rows = await pg.handle.db
      .select()
      .from(t.agentContextDocs)
      .where(eq(t.agentContextDocs.agentId, agentId));
    expect(rows).toHaveLength(2);
    for (const row of rows) {
      expect(Object.keys(row).sort()).toEqual(['agentId', 'createdAt', 'order', 'path', 'repoId'].sort());
    }

    // AC-9: reorder (swap) persists, and GET reflects the new order.
    const reordered = await app.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: {
        repo_id: repoId,
        paths: ['.devdigest/docs/onboarding.md', '.devdigest/specs/architecture.md'],
      },
    });
    expect(reordered.statusCode).toBe(200);

    const refetched = await app.inject({
      method: 'GET',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
    });
    expect(refetched.json()).toEqual([
      { path: '.devdigest/docs/onboarding.md', order: 0, broken: false },
      { path: '.devdigest/specs/architecture.md', order: 1, broken: false },
    ]);

    await app.close();
  });

  it('AC-21: a document removed from the catalog stays attached with `broken: true`, not silently dropped', async () => {
    // First app instance: the doc exists, gets attached.
    const appBefore = await makeApp(CATALOG_ENTRIES, CATALOG_FILES);
    const agentId = await createAgent(appBefore, 'AC-21 agent');
    await appBefore.inject({
      method: 'PUT',
      url: `/agents/${agentId}/context`,
      payload: { repo_id: repoId, paths: ['.devdigest/specs/architecture.md'] },
    });
    await appBefore.close();

    // A fresh scan (new app instance, same DB) no longer finds the file —
    // simulates it being deleted/renamed between the attachment and now.
    const appAfter = await makeApp([], {});
    const res = await appAfter.inject({
      method: 'GET',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
    });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual([
      { path: '.devdigest/specs/architecture.md', order: 0, broken: true },
    ]);

    // Still there after ANOTHER scan — never silently removed by re-scanning (AC-21).
    const again = await appAfter.inject({
      method: 'GET',
      url: `/agents/${agentId}/context?repo_id=${repoId}`,
    });
    expect(again.json()).toEqual([
      { path: '.devdigest/specs/architecture.md', order: 0, broken: true },
    ]);

    await appAfter.close();
  });

  it('AC-23: "Used by N agents" counts direct attachments and inheritance via an ENABLED skill only', async () => {
    // A document path used ONLY by this test — the DB is shared across tests
    // in this file (one Postgres for the whole suite), so reusing a path
    // already attached by an earlier test would inflate this count.
    const AC23_DOC = '.devdigest/specs/ac23-only.md';
    const app = await makeApp(
      [...CATALOG_ENTRIES, { path: AC23_DOC, sizeBytes: 3 }],
      { ...CATALOG_FILES, [AC23_DOC]: 'Own invariant.' },
    );
    const directAgentId = await createAgent(app, 'Direct attacher');
    const inheritingAgentId = await createAgent(app, 'Inherits via skill');
    const disabledLinkAgentId = await createAgent(app, 'Disabled link — not counted');
    const skillId = await createSkill(app, 'Has the doc attached');

    // Direct attachment on one agent.
    await app.inject({
      method: 'PUT',
      url: `/agents/${directAgentId}/context`,
      payload: { repo_id: repoId, paths: [AC23_DOC] },
    });

    // The same document attached at the SKILL level.
    await app.inject({
      method: 'PUT',
      url: `/skills/${skillId}/context`,
      payload: { repo_id: repoId, paths: [AC23_DOC] },
    });

    // Link the skill to the inheriting agent — enabled (default).
    await app.inject({
      method: 'POST',
      url: `/agents/${inheritingAgentId}/skills`,
      payload: { skill_id: skillId },
    });

    // Link the skill to a THIRD agent too, but disable the link — must NOT count.
    await app.inject({
      method: 'POST',
      url: `/agents/${disabledLinkAgentId}/skills`,
      payload: { skill_id: skillId },
    });
    await app.inject({
      method: 'PATCH',
      url: `/agents/${disabledLinkAgentId}/skills/${skillId}`,
      payload: { enabled: false },
    });

    const res = await app.inject({ method: 'GET', url: `/repos/${repoId}/context/docs` });
    const docs = res.json() as Array<{ path: string; used_by_agents: number }>;
    const arch = docs.find((doc) => doc.path === AC23_DOC);

    // directAgentId (direct) + inheritingAgentId (enabled skill link) = 2.
    // disabledLinkAgentId does NOT count — its link is disabled.
    expect(arch!.used_by_agents).toBe(2);

    await app.close();
  });
});
