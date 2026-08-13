import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { startPg, dockerAvailable, type PgFixture } from './helpers/pg.js';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/platform/config.js';
import { seed } from '../src/db/seed.js';
import { MockGitClient, MockGitHubClient } from '../src/adapters/mocks.js';

const hasDocker = await dockerAvailable();
const d = hasDocker ? describe : describe.skip;

if (!hasDocker) {
  // eslint-disable-next-line no-console
  console.warn('[skills] Docker not available — skipping integration tests.');
}

/**
 * Skills CRUD + versioning + agent-link toggle. Covers: create snapshots v1,
 * a body edit bumps the version, a non-body edit does NOT, restore creates a
 * NEW version (history is immutable), delete, and the per-link `enabled` flag
 * on `POST/PATCH /agents/:id/skills`.
 */
d('skills module', () => {
  let pg: PgFixture;

  beforeAll(async () => {
    pg = await startPg();
    await seed(pg.handle.db);
  });
  afterAll(async () => {
    await pg?.stop();
  });

  function makeApp() {
    const config = loadConfig({ ...process.env, NODE_ENV: 'test' } as NodeJS.ProcessEnv);
    return buildApp({
      config,
      db: pg.handle.db,
      overrides: { git: new MockGitClient(), github: new MockGitHubClient() },
    });
  }

  const createBody = {
    name: 'my-rubric',
    description: 'A test rubric.',
    type: 'rubric' as const,
    body: '# My Rubric\nCheck things.',
  };

  it('creating a skill snapshots version 1', async () => {
    const app = await makeApp();
    const created = await app.inject({ method: 'POST', url: '/skills', payload: createBody });
    expect(created.statusCode).toBe(201);
    const skill = created.json();
    expect(skill.version).toBe(1);
    expect(skill.source).toBe('manual'); // route-level default
    expect(skill.enabled).toBe(true);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions).toHaveLength(1);
    expect(versions[0]).toMatchObject({ version: 1, body: createBody.body });
    await app.close();
  });

  it('editing body bumps the version and snapshots it; other edits do not', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    // Non-body edit: enabled toggle does NOT bump version.
    const toggled = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(200);
    expect(toggled.json().version).toBe(1);

    // Body edit: bumps version and snapshots.
    const edited = await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: '# My Rubric\nCheck MORE things.' },
    });
    expect(edited.statusCode).toBe(200);
    expect(edited.json().version).toBe(2);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([2, 1]);
    await app.close();
  });

  it('restoring an old version creates a NEW version rather than rewriting history', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    await app.inject({
      method: 'PUT',
      url: `/skills/${skill.id}`,
      payload: { body: 'v2 body' },
    });

    const restored = await app.inject({
      method: 'POST',
      url: `/skills/${skill.id}/versions/1/restore`,
    });
    expect(restored.statusCode).toBe(200);
    const restoredSkill = restored.json();
    expect(restoredSkill.version).toBe(3);
    expect(restoredSkill.body).toBe(createBody.body);

    const versions = (
      await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions` })
    ).json();
    expect(versions.map((v: { version: number }) => v.version)).toEqual([3, 2, 1]);
    // v1 and v2 are untouched, byte-identical to what they were.
    expect(versions.find((v: { version: number }) => v.version === 1).body).toBe(
      createBody.body,
    );
    expect(versions.find((v: { version: number }) => v.version === 2).body).toBe('v2 body');
    await app.close();
  });

  it('deletes a skill; subsequent GET 404s', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();

    expect(
      (await app.inject({ method: 'DELETE', url: `/skills/${skill.id}` })).statusCode,
    ).toBe(200);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${skill.id}` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('404s for an unknown skill and an unknown version', async () => {
    const app = await makeApp();
    const skill = (
      await app.inject({ method: 'POST', url: '/skills', payload: createBody })
    ).json();
    const ghost = '00000000-0000-0000-0000-000000000000';

    expect((await app.inject({ method: 'GET', url: `/skills/${ghost}` })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: 'GET', url: `/skills/${skill.id}/versions/99` })).statusCode,
    ).toBe(404);
    await app.close();
  });

  it('GET /skills/community returns the seeded catalog, unimported into workspace skills', async () => {
    const app = await makeApp();
    const community = (
      await app.inject({ method: 'GET', url: '/skills/community' })
    ).json();
    expect(community.length).toBeGreaterThan(0);
    const names = community.map((c: { name: string }) => c.name);
    expect(names).toContain('owasp-top-10-review');

    const workspaceSkills = (await app.inject({ method: 'GET', url: '/skills' })).json();
    const workspaceNames = workspaceSkills.map((s: { name: string }) => s.name);
    expect(workspaceNames).not.toContain('owasp-top-10-review');
    await app.close();
  });

  it('POST /skills/import/preview extracts a skill from a plain markdown file', async () => {
    const app = await makeApp();
    const md = '# Imported Rule\nDescribe the rule here.\n';
    const res = await app.inject({
      method: 'POST',
      url: '/skills/import/preview',
      payload: { filename: 'rule.md', content_base64: Buffer.from(md, 'utf8').toString('base64') },
    });
    expect(res.statusCode).toBe(200);
    const draft = res.json();
    expect(draft.name).toBe('Imported Rule');
    expect(draft.body).toContain('Describe the rule here.');
    expect(draft.ignored_files).toEqual([]);
    await app.close();
  });

  it('per-link `enabled` on the agent↔skill link: set, toggle, and reorder preserves state', async () => {
    const app = await makeApp();
    const skillA = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'skill-a' } })
    ).json();
    const skillB = (
      await app.inject({ method: 'POST', url: '/skills', payload: { ...createBody, name: 'skill-b' } })
    ).json();
    const agent = (
      await app.inject({
        method: 'POST',
        url: '/agents',
        payload: {
          name: 'Skill Link Test Agent',
          provider: 'openai',
          model: 'gpt-4o-mini',
          system_prompt: 'Review the diff.',
        },
      })
    ).json();

    // Attach both, in order [A, B].
    const set = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skillA.id, skillB.id] },
    });
    expect(set.statusCode).toBe(200);
    const links = set.json();
    expect(links).toHaveLength(2);
    expect(links.every((l: { enabled: boolean }) => l.enabled === true)).toBe(true);

    // Disable skillA's link.
    const toggled = await app.inject({
      method: 'PATCH',
      url: `/agents/${agent.id}/skills/${skillA.id}`,
      payload: { enabled: false },
    });
    expect(toggled.statusCode).toBe(200);
    const afterToggle = toggled.json();
    const aLink = afterToggle.find((l: { skill_id: string }) => l.skill_id === skillA.id);
    const bLink = afterToggle.find((l: { skill_id: string }) => l.skill_id === skillB.id);
    expect(aLink.enabled).toBe(false);
    expect(bLink.enabled).toBe(true);

    // Reorder (swap order) via POST /skills — must NOT reset A's enabled=false.
    const reordered = await app.inject({
      method: 'POST',
      url: `/agents/${agent.id}/skills`,
      payload: { skill_ids: [skillB.id, skillA.id] },
    });
    expect(reordered.statusCode).toBe(200);
    const afterReorder = reordered.json();
    const aAfter = afterReorder.find((l: { skill_id: string }) => l.skill_id === skillA.id);
    const bAfter = afterReorder.find((l: { skill_id: string }) => l.skill_id === skillB.id);
    expect(aAfter.enabled).toBe(false); // survived the reorder
    expect(bAfter.enabled).toBe(true);
    expect(aAfter.order).toBe(1);
    expect(bAfter.order).toBe(0);
    await app.close();
  });
});
