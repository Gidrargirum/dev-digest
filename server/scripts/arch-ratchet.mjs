#!/usr/bin/env node
/**
 * The ratchet guard for .dependency-cruiser-known-violations.json.
 *
 * `pnpm arch:check` passes over the known violations via --ignore-known, which
 * keeps the gate green on an existing codebase. The hole that leaves: someone
 * regenerates the baseline to silence a red build, and the diff is invisible in
 * review unless a human opens the JSON.
 *
 * This closes it. The live violation set must be a SUBSET of the committed
 * baseline — never a superset, never a swap. Subset rather than a count
 * comparison on purpose: equal counts would let one violation be traded for
 * another.
 *
 * Exit 0 = nothing new. Exit 1 = the ratchet is being unwound.
 *
 * See .claude/skills/onion-architecture/enforcement.md
 */
import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const BASELINE = resolve(serverDir, '.dependency-cruiser-known-violations.json');

/** A violation's identity: which rule fired, and on which edge. */
const keyOf = (v) => `${v.rule?.name ?? '?'}\t${v.from ?? '?'} → ${v.to ?? '?'}`;

function currentViolations() {
  const raw = execFileSync(
    'node_modules/.bin/depcruise',
    [
      'src',
      '../reviewer-core/src',
      '--config',
      '.dependency-cruiser.cjs',
      '--output-type',
      'baseline',
    ],
    { cwd: serverDir, encoding: 'utf8', maxBuffer: 32 * 1024 * 1024 },
  );
  return JSON.parse(raw);
}

const committed = JSON.parse(readFileSync(BASELINE, 'utf8'));
const current = currentViolations();

const committedKeys = new Set(committed.map(keyOf));
const currentKeys = new Set(current.map(keyOf));

const added = [...currentKeys].filter((k) => !committedKeys.has(k));
const fixed = [...committedKeys].filter((k) => !currentKeys.has(k));

if (added.length > 0) {
  console.error(
    `\n✗ arch ratchet: ${added.length} violation(s) are NOT in the baseline.\n`,
  );
  for (const k of added) console.error(`    ${k.replace('\t', '  ')}`);
  console.error(
    '\n  The baseline may shrink, never grow. Fix the import rather than\n' +
      '  blessing it — see .claude/skills/onion-architecture/enforcement.md.\n',
  );
  process.exit(1);
}

if (fixed.length > 0) {
  console.log(
    `✓ arch ratchet: ${fixed.length} violation(s) fixed since the baseline was written.`,
  );
  for (const k of fixed) console.log(`    ${k.replace('\t', '  ')}`);
  console.log('\n  Run `pnpm arch:baseline` to shrink the file (removals only).');
} else {
  console.log(`✓ arch ratchet: no new violations (${currentKeys.size} known).`);
}
