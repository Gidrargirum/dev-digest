#!/usr/bin/env node
/**
 * skills-lock.json pins the upstream source + hash of every skill vendored into
 * .claude/skills/. It drifted once already: two entries survived the removal of
 * the folders they pinned, which is invisible until someone tries to re-vendor.
 *
 * Checks one direction only — every LOCKED skill must exist on disk. The reverse
 * is legitimate: skills authored in this repo (onion-architecture,
 * frontend-architecture, engineering-insights) have no upstream to pin.
 *
 *   node scripts/check-skills-lock.mjs
 */
import { readdirSync, readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SKILLS = join(root, '.claude/skills');
const LOCK = join(root, 'skills-lock.json');

const locked = Object.keys(JSON.parse(readFileSync(LOCK, 'utf8')).skills ?? {});
const orphans = locked.filter((name) => !existsSync(join(SKILLS, name, 'SKILL.md')));

if (orphans.length > 0) {
  console.error('\n✗ skills-lock.json pins skills that are not on disk:\n');
  for (const name of orphans) console.error(`    ${name}  (no .claude/skills/${name}/SKILL.md)`);
  console.error(
    '\n  Either re-vendor the skill, or drop its entry from skills-lock.json.\n',
  );
  process.exit(1);
}

const onDisk = readdirSync(SKILLS, { withFileTypes: true })
  .filter((e) => e.isDirectory())
  .map((e) => e.name);
const local = onDisk.filter((n) => !locked.includes(n));

console.log(`✓ skills-lock: ${locked.length} pinned skill(s) present.`);
if (local.length > 0) {
  console.log(`  ${local.length} repo-authored skill(s), unpinned by design: ${local.join(', ')}`);
}
