#!/usr/bin/env node
/**
 * PreToolUse gate: `gh pr create` may not run without a fresh PASS receipt.
 *
 * Two modes, deliberately in one file:
 *
 *   node .claude/hooks/pr-self-review-gate.mjs                # hook (reads the
 *                                                             # tool call on stdin)
 *   node .claude/hooks/pr-self-review-gate.mjs --fingerprint  # "<head> <worktreeHash>"
 *
 * The skill writes the receipt from --fingerprint and the hook validates it with
 * the same function, so the two can never disagree about what "unchanged since
 * the review" means. Splitting them across two implementations is how a gate
 * starts passing stale branches.
 *
 * Exit codes (PreToolUse contract): 0 = allow · 2 = block, stderr goes back to
 * the agent. Anything unexpected fails OPEN — a broken gate must not wedge the
 * user out of their own repo. The one thing it never does is fail QUIET: every
 * open-failure prints why.
 *
 * See .claude/skills/pr-self-review/SKILL.md
 */
import { readFileSync, existsSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { dirname, resolve, join } from 'node:path';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const RECEIPT = join(root, '.claude/pr-self-review/receipt.json');

const git = (...args) =>
  execFileSync('git', args, { cwd: root, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 });

/**
 * What "the working tree right now" hashes to.
 *
 * `git diff HEAD` alone is not enough: an untracked file is invisible to it, and
 * "whole new module, never `git add`ed" is the most common way a change escapes
 * a diff-based check. So the untracked set is hashed by name AND content.
 */
function worktreeHash() {
  const h = createHash('sha256');
  h.update(git('diff', 'HEAD'));
  h.update('\0untracked\0');
  const untracked = git('ls-files', '--others', '--exclude-standard')
    .split('\n')
    .filter(Boolean)
    .sort();
  for (const path of untracked) {
    h.update(path);
    h.update('\0');
    try {
      h.update(readFileSync(join(root, path)));
    } catch {
      /* vanished mid-run, or unreadable — the name alone still marks the change */
    }
    h.update('\0');
  }
  return h.digest('hex');
}

function fingerprint() {
  return { head: git('rev-parse', 'HEAD').trim(), worktreeHash: worktreeHash() };
}

// ── --fingerprint ────────────────────────────────────────────────────────────
if (process.argv.includes('--fingerprint')) {
  const { head, worktreeHash: wt } = fingerprint();
  process.stdout.write(`${head} ${wt}\n`);
  process.exit(0);
}

// ── hook ─────────────────────────────────────────────────────────────────────
const allow = () => process.exit(0);
const failOpen = (why) => {
  process.stderr.write(`pr-self-review gate skipped: ${why}\n`);
  process.exit(0);
};
const block = (msg) => {
  process.stderr.write(msg);
  process.exit(2);
};

let payload = {};
try {
  payload = JSON.parse(readFileSync(0, 'utf8') || '{}');
} catch {
  failOpen('unreadable hook payload');
}

const command = payload?.tool_input?.command ?? '';

/**
 * Only PR creation is gated. `gh pr view`, `gh pr list`, and every other Bash
 * call pass straight through — a gate that fires on unrelated commands gets
 * disabled within a day. The segment split keeps `echo x && gh pr create` from
 * sneaking past a whole-string match.
 */
const CREATES_PR = /(^|[\s;&|(])gh\s+(?:[^\s;&|]+\s+)*?pr\s+create\b/;
if (!CREATES_PR.test(command)) allow();

let current;
try {
  current = fingerprint();
} catch {
  failOpen('not a git repository (or git unavailable)');
}

if (!existsSync(RECEIPT)) {
  block(
    'BLOCKED: no PR self-review receipt.\n' +
      'Run the `pr-self-review` skill (/pr-self-review) before opening a PR.\n',
  );
}

let receipt;
try {
  receipt = JSON.parse(readFileSync(RECEIPT, 'utf8'));
} catch {
  block('BLOCKED: the PR self-review receipt is unreadable. Re-run /pr-self-review.\n');
}

if (receipt.head !== current.head || receipt.worktreeHash !== current.worktreeHash) {
  block(
    'BLOCKED: the PR self-review is stale — the branch changed since it ran.\n' +
      'Re-run /pr-self-review.\n',
  );
}

if (receipt.verdict === 'BLOCKED') {
  block(
    `BLOCKED: the PR self-review found ${receipt.critical ?? '?'} critical finding(s).\n` +
      'Fix them and re-run /pr-self-review. Do not work around this hook.\n',
  );
}

if (receipt.verdict !== 'PASS' && receipt.verdict !== 'OVERRIDE') {
  block(`BLOCKED: unrecognised receipt verdict "${receipt.verdict}". Re-run /pr-self-review.\n`);
}

if (receipt.verdict === 'OVERRIDE' && !receipt.override) {
  block('BLOCKED: the receipt claims OVERRIDE but records no reason. Re-run /pr-self-review.\n');
}

allow();
