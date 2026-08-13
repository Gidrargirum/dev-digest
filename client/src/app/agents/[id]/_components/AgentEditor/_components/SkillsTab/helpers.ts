import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description. Mirrors
    AgentsListView's filterAgents helper. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((sk) => `${sk.name} ${sk.description}`.toLowerCase().includes(q));
}

/** Swap `ids[index]` with its neighbour in `direction` (-1 = up, +1 = down).
    No-op if the move would go out of bounds. Pure — returns a new array. */
export function reorder(ids: string[], index: number, direction: -1 | 1): string[] {
  const target = index + direction;
  if (target < 0 || target >= ids.length) return ids;
  const next = [...ids];
  const tmp = next[index]!;
  next[index] = next[target]!;
  next[target] = tmp;
  return next;
}
