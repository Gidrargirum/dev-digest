import { describe, it, expect } from 'vitest';
import { SEED_SKILLS } from '../src/db/seed-skills.js';
import { AGENT_SKILL_LINKS } from '../src/db/seed.js';

/**
 * Plan "Крок 7" — API Contract Reviewer gets the full five-skill set. Pure
 * constant checks, no Docker: the copy-paste from `.claude/skills/api-contract-*`
 * must have stripped the YAML frontmatter and the "pastes directly" marker
 * line, and every pre-wired agent<->skill link must point at a name that
 * actually exists in `SEED_SKILLS`.
 */

describe('SEED_SKILLS — api-contract-* skills', () => {
  const apiContractSkills = SEED_SKILLS.filter((s) => s.name.startsWith('api-contract-'));

  it('contains four api-contract-* entries', () => {
    expect(apiContractSkills.map((s) => s.name).sort()).toEqual([
      'api-contract-breaking-change',
      'api-contract-deprecation-policy',
      'api-contract-response-schema',
      'api-contract-semver-discipline',
    ]);
  });

  it('every body is non-empty and free of YAML frontmatter / the SKILL.md marker line', () => {
    for (const skill of apiContractSkills) {
      expect(skill.body.trim().length).toBeGreaterThan(0);
      // Frontmatter fence is a standalone "---" line, not any "---" substring
      // (a markdown table separator like "|---|---|" is legitimate body text).
      expect(skill.body.split('\n')).not.toContain('---');
      expect(skill.body).not.toContain('name: api-contract');
      expect(skill.body).not.toContain('pastes directly');
    }
  });
});

describe('AGENT_SKILL_LINKS', () => {
  const skillNames = new Set(SEED_SKILLS.map((s) => s.name));

  it('every link references a skill that exists in SEED_SKILLS', () => {
    for (const link of AGENT_SKILL_LINKS) {
      expect(skillNames.has(link.skillName)).toBe(true);
    }
  });

  it('API Contract Reviewer is linked to all three new skills at order 2, 3, 4', () => {
    const apiContractLinks = AGENT_SKILL_LINKS.filter(
      (l) => l.agentName === 'API Contract Reviewer',
    );
    const byOrder = new Map(apiContractLinks.map((l) => [l.order, l.skillName]));
    expect(byOrder.get(2)).toBe('api-contract-response-schema');
    expect(byOrder.get(3)).toBe('api-contract-semver-discipline');
    expect(byOrder.get(4)).toBe('api-contract-deprecation-policy');
  });
});
