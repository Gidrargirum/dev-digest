import { describe, it, expect, vi, afterEach } from 'vitest';
import { resolveAgent, resolvePull, resolveRepo } from './resolve.js';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

describe('resolveRepo', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('finds a repo by owner/name (happy path)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'r1', full_name: 'acme/widgets' }]));

    const repo = await resolveRepo('acme/widgets');

    expect(repo).toEqual({ id: 'r1', full_name: 'acme/widgets' });
  });

  it('normalizes a GitHub URL to owner/name before matching', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'r1', full_name: 'acme/widgets' }]));

    const repo = await resolveRepo('https://github.com/acme/widgets.git');

    expect(repo).toEqual({ id: 'r1', full_name: 'acme/widgets' });
  });

  it('throws a next-step error naming the available repos when not found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'r1', full_name: 'acme/widgets' }]));

    await expect(resolveRepo('acme/missing')).rejects.toThrow(
      "Репозиторій 'acme/missing' не додано в DevDigest. Наявні: acme/widgets. Додай його в UI (Repos → Add) і повтори.",
    );
  });
});

describe('resolvePull', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('finds a PR by number (happy path)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'pr1', number: 42, title: 'Fix bug' }]));

    const pull = await resolvePull('repo-1', 42);

    expect(pull).toEqual({ id: 'pr1', number: 42 });
  });

  it('throws a next-step error when the PR number is not imported', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'pr1', number: 42 }]));

    await expect(resolvePull('repo-1', 7)).rejects.toThrow(
      "PR #7 у 'repo-1' не імпортовано; відкрий репо в UI, щоб імпортувати PR-и, або перевір номер.",
    );
  });
});

describe('resolveAgent', () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it('finds an agent by exact name (happy path)', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'a1', name: 'Security Reviewer' }]));

    const agent = await resolveAgent('Security Reviewer');

    expect(agent).toEqual({ id: 'a1', name: 'Security Reviewer' });
  });

  it('falls back to a case-insensitive match', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'a1', name: 'Security Reviewer' }]));

    const agent = await resolveAgent('security reviewer');

    expect(agent).toEqual({ id: 'a1', name: 'Security Reviewer' });
  });

  it('throws a next-step error when the agent is not found', async () => {
    globalThis.fetch = vi.fn().mockResolvedValue(jsonResponse([{ id: 'a1', name: 'Security Reviewer' }]));

    await expect(resolveAgent('Ghost')).rejects.toThrow(
      "Агента 'Ghost' не знайдено — виклич list_agents, щоб побачити доступних.",
    );
  });
});
