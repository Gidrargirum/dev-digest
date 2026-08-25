import { getAgents } from '../api/client.js';
import { paginate } from './pagination.js';
import type { ListAgentsInput, ListAgentsOutput } from './schemas.js';

/**
 * Lists configured review agents, paginated. An empty workspace is a
 * successful, empty page — not an error (mcp-server-best-practices.md §2:
 * only "tool failed to run" is `isError`, not "there was nothing to return").
 */
export async function listAgents(input: ListAgentsInput): Promise<ListAgentsOutput> {
  const agents = await getAgents();

  const projected = agents.map((agent) => ({
    id: agent.id,
    name: agent.name,
    description: agent.description ?? null,
    provider: agent.provider ?? '',
    model: agent.model ?? '',
    enabled: agent.enabled ?? false,
  }));

  const { page, next_cursor } = paginate(projected, input.cursor, input.limit);

  return { agents: page, next_cursor };
}
