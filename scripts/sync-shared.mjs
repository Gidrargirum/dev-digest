#!/usr/bin/env node
/**
 * Keep the two vendored copies of @devdigest/shared identical.
 *
 * `server/src/vendor/shared` is CANONICAL — reviewer-core/tsconfig.json resolves
 * @devdigest/shared to it, so the server copy is what the domain ring compiles
 * against. `client/src/vendor/shared` is a mirror.
 *
 * There is no workspace here (three independent lockfiles, no root
 * package.json), so a real shared package is off the table by design. A copy
 * script plus a CI check is the shape that fits: the duplication stays, the
 * silent divergence does not.
 *
 *   node scripts/sync-shared.mjs           # copy server → client
 *   node scripts/sync-shared.mjs --check   # exit 1 if they differ (for CI)
 *
 * See .claude/skills/onion-architecture/stack-rules.md
 */
import { readdirSync, readFileSync, writeFileSync, mkdirSync, statSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join, relative } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const SRC = join(root, 'server/src/vendor/shared');
const DST = join(root, 'client/src/vendor/shared');

const checkOnly = process.argv.includes('--check');

/** Every .ts file under dir, as paths relative to dir. */
function listFiles(dir, base = dir) {
  const out = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...listFiles(full, base));
    else if (entry.endsWith('.ts')) out.push(relative(base, full));
  }
  return out.sort();
}

const srcFiles = listFiles(SRC);
const dstFiles = listFiles(DST);

const differing = [];
const missing = [];
const extra = dstFiles.filter((f) => !srcFiles.includes(f));

for (const file of srcFiles) {
  const from = join(SRC, file);
  const to = join(DST, file);
  const content = readFileSync(from, 'utf8');

  if (!dstFiles.includes(file)) {
    missing.push(file);
  } else if (readFileSync(to, 'utf8') !== content) {
    differing.push(file);
  } else {
    continue;
  }

  if (!checkOnly) {
    mkdirSync(dirname(to), { recursive: true });
    writeFileSync(to, content);
  }
}

const drifted = [...missing, ...differing, ...extra];

if (checkOnly) {
  if (drifted.length === 0) {
    console.log(`✓ vendored contracts in sync (${srcFiles.length} files).`);
    process.exit(0);
  }
  console.error('\n✗ vendored copies of @devdigest/shared have diverged:\n');
  for (const f of missing) console.error(`    missing in client:  ${f}`);
  for (const f of differing) console.error(`    differs:            ${f}`);
  for (const f of extra) console.error(`    client-only:        ${f}`);
  console.error(
    '\n  server/src/vendor/shared is canonical. Run:\n' +
      '      node scripts/sync-shared.mjs\n' +
      '  then re-run `cd client && pnpm typecheck`.\n',
  );
  process.exit(1);
}

if (extra.length > 0) {
  console.warn(`⚠ ${extra.length} client-only file(s) left untouched:`);
  for (const f of extra) console.warn(`    ${f}`);
}

if (missing.length + differing.length === 0) {
  console.log(`✓ already in sync (${srcFiles.length} files).`);
} else {
  console.log(`✓ synced ${missing.length + differing.length} file(s) server → client:`);
  for (const f of [...missing, ...differing]) console.log(`    ${f}`);
}
