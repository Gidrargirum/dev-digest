import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over name + description, mirrors agents/helpers.ts. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter(
    (s) => s.name.toLowerCase().includes(q) || s.description.toLowerCase().includes(q),
  );
}
