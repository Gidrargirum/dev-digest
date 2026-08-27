import { getAgents, getPulls, getRepos } from './client.js';
import { ToolError } from '../errors.js';

/** How many known-repo names to list in a "not found" error before truncating. */
const REPO_LIST_PREVIEW_LIMIT = 10;

export interface ResolvedRepo {
  id: string;
  full_name: string;
}

export interface ResolvedPull {
  id: string;
  number: number;
}

export interface ResolvedAgent {
  id: string;
  name: string;
}

/**
 * Accepts `owner/name` or a GitHub URL (`https://github.com/owner/name`,
 * with or without a trailing `.git`/slash) and normalizes to `owner/name`.
 * Anything else is passed through unchanged for the caller to fail on.
 */
function normalizeRepoFullName(input: string): string {
  const trimmed = input.trim();
  const urlMatch = trimmed.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\.git)?\/?$/i);
  if (urlMatch) {
    return `${urlMatch[1]}/${urlMatch[2]}`;
  }
  return trimmed.replace(/\.git$/i, '').replace(/^\/+|\/+$/g, '');
}

/** `GET /repos` → match by `full_name`, case-insensitive, accepting a URL or `owner/name`. */
export async function resolveRepo(fullName: string): Promise<ResolvedRepo> {
  const normalized = normalizeRepoFullName(fullName);
  const repos = await getRepos();
  const match = repos.find((r) => r.full_name.toLowerCase() === normalized.toLowerCase());

  if (!match) {
    const known = repos.map((r) => r.full_name);
    const preview =
      known.length === 0
        ? '(жодного репозиторію ще не додано)'
        : known.slice(0, REPO_LIST_PREVIEW_LIMIT).join(', ') +
          (known.length > REPO_LIST_PREVIEW_LIMIT ? ', ...' : '');
    throw new ToolError(
      `Репозиторій '${normalized}' не додано в DevDigest. Наявні: ${preview}. Додай його в UI (Repos → Add) і повтори.`,
    );
  }

  return { id: match.id, full_name: match.full_name };
}

/** `GET /repos/:id/pulls` → match by PR `number`. */
export async function resolvePull(repoId: string, number: number): Promise<ResolvedPull> {
  const pulls = await getPulls(repoId);
  const match = pulls.find((p) => p.number === number);

  if (!match || match.id == null) {
    throw new ToolError(
      `PR #${number} у '${repoId}' не імпортовано; відкрий репо в UI, щоб імпортувати PR-и, або перевір номер.`,
    );
  }

  return { id: match.id, number: match.number };
}

/** `GET /agents` → match by `name`, exact first, then case-insensitive fallback. */
export async function resolveAgent(name: string): Promise<ResolvedAgent> {
  const agents = await getAgents();
  const match = agents.find((a) => a.name === name) ?? agents.find((a) => a.name.toLowerCase() === name.toLowerCase());

  if (!match) {
    throw new ToolError(`Агента '${name}' не знайдено — виклич list_agents, щоб побачити доступних.`);
  }

  return { id: match.id, name: match.name };
}
