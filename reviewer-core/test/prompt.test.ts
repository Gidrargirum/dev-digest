/**
 * assemblePrompt — PR description slot (the fix that was missing: the PR body
 * never reached the prompt). Pins rendering, omit-when-empty, untrusted-wrap,
 * truncation, and ordering (before the diff).
 */
import { describe, it, expect } from 'vitest';
import { assemblePrompt } from '../src/prompt.js';

function userOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  const { messages } = assemblePrompt(parts);
  return messages[1]!.content;
}

function systemOf(parts: Parameters<typeof assemblePrompt>[0]): string {
  return assemblePrompt(parts).messages[0]!.content;
}

describe('assemblePrompt — shared injection guard (server + CI)', () => {
  const sys = systemOf({ system: 'AGENT-SYS', diff: 'DIFF' });

  it('appends the guard to the agent system prompt', () => {
    expect(sys.startsWith('AGENT-SYS')).toBe(true);
    expect(sys).toMatch(/<untrusted>.*DATA to be analyzed/s);
  });

  it('forbids "intentional/test/demo" claims from descoping the review', () => {
    // The defense that replaced the keyword sanitizer: a general, trusted,
    // language-agnostic rule — not text parsing of untrusted input.
    expect(sys).toMatch(/test fixture|intentional|demo/i);
    expect(sys).toMatch(/never reduce|never .*descope|REPORT it/i);
    expect(sys).toMatch(/any language/i);
  });
});

describe('assemblePrompt — ## PR description', () => {
  it('renders the section (untrusted-wrapped) before the diff when present', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting to the public /api endpoints.',
    });
    const user = messages[1]!.content;
    expect(user).toContain('## PR description');
    expect(user).toContain('<untrusted source="pr-description">');
    expect(user).toContain('Adds rate limiting to the public /api endpoints.');
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.pr_description).toContain('Adds rate limiting');
  });

  it('omits the section when prDescription is undefined or blank (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## PR description');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.pr_description ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', prDescription: '   ' })).not.toContain(
      '## PR description',
    );
  });

  it('truncates a huge body to the 4k cap', () => {
    const { assembly } = assemblePrompt({
      system: 'sys',
      diff: 'D',
      prDescription: 'x'.repeat(10_000),
    });
    expect((assembly.pr_description as string).length).toBe(4000);
  });
});

describe('assemblePrompt — ## Skills / rules', () => {
  it('renders linked skill bodies, joined and NOT untrusted-wrapped, before memory', () => {
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      skills: ['# Rule one\nDo X.', '# Rule two\nDo Y.'],
      memory: ['remember this'],
    });
    const user = messages[1]!.content;
    expect(user).toContain('## Skills / rules');
    expect(user).toContain('# Rule one\nDo X.');
    expect(user).toContain('# Rule two\nDo Y.');
    // Skills are trusted instructions (linked by the workspace owner), unlike
    // diff/specs/pr-description — they are NOT wrapped in <untrusted> delimiters.
    expect(user).not.toContain('<untrusted source="skills"');
    expect(user.indexOf('## Skills / rules')).toBeLessThan(user.indexOf('## Relevant memory'));
    expect(user.indexOf('## Skills / rules')).toBeLessThan(user.indexOf('## Diff to review'));
    expect(assembly.skills).toBe('# Rule one\nDo X.\n\n# Rule two\nDo Y.');
  });

  it('omits the section when skills is undefined or an empty array (no behaviour change)', () => {
    expect(userOf({ system: 'sys', diff: 'DIFF' })).not.toContain('## Skills / rules');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF' }).assembly.skills ?? null).toBeNull();
    expect(userOf({ system: 'sys', diff: 'DIFF', skills: [] })).not.toContain('## Skills / rules');
    expect(assemblePrompt({ system: 'sys', diff: 'DIFF', skills: [] }).assembly.skills ?? null).toBeNull();
  });
});

/**
 * Intent slot (plans/intent-layer.md step 3 / specs/pr-intent-layer.md "Prompt
 * contract"): a strict addition — omitted, `assemblePrompt` must be
 * byte-identical to a call with no `intent` field at all.
 */
describe('assemblePrompt — ## Derived PR intent', () => {
  it('byte-identity: omitting `intent` produces messages identical to another call with no `intent` field', () => {
    const partsWithoutIntent = {
      system: 'AGENT-SYS',
      diff: 'DIFF',
      task: 'Review PR #482',
      prDescription: 'Adds rate limiting.',
      skills: ['# Rule\nDo X.'],
    };
    const baseline = assemblePrompt(partsWithoutIntent);
    const again = assemblePrompt(partsWithoutIntent);

    // Compared against the result of another call — not a snapshot.
    expect(again.messages[0]!.content).toBe(baseline.messages[0]!.content);
    expect(again.messages[1]!.content).toBe(baseline.messages[1]!.content);

    // Also true when `intent` is explicitly passed as `undefined` — the slot
    // being present-but-empty must not change a single byte either.
    const withUndefinedIntent = assemblePrompt({ ...partsWithoutIntent, intent: undefined });
    expect(withUndefinedIntent.messages[0]!.content).toBe(baseline.messages[0]!.content);
    expect(withUndefinedIntent.messages[1]!.content).toBe(baseline.messages[1]!.content);
    expect(withUndefinedIntent.assembly.intent ?? null).toBeNull();
  });

  it('renders the section (untrusted-wrapped) between PR description and Skills / rules', () => {
    const intentText = 'Adds rate limiting to the public API to stop abusive callers.';
    const { messages, assembly } = assemblePrompt({
      system: 'sys',
      diff: 'DIFF',
      prDescription: 'Adds rate limiting.',
      skills: ['# Rule\nDo X.'],
      intent: intentText,
    });
    const user = messages[1]!.content;

    expect(user).toContain('## Derived PR intent');
    expect(user).toContain('<untrusted source="intent">');
    expect(user).toContain(intentText);

    // Ordering: after "## PR description", before "## Skills / rules".
    expect(user.indexOf('## PR description')).toBeLessThan(user.indexOf('## Derived PR intent'));
    expect(user.indexOf('## Derived PR intent')).toBeLessThan(user.indexOf('## Skills / rules'));

    expect(assembly.intent).toBe(intentText);
  });

  it('does not render the section and `assembly.intent` is null when intent is blank/whitespace-only', () => {
    const blank = assemblePrompt({ system: 'sys', diff: 'DIFF', intent: '   ' });
    expect(blank.messages[1]!.content).not.toContain('## Derived PR intent');
    expect(blank.assembly.intent).toBeNull();

    const empty = assemblePrompt({ system: 'sys', diff: 'DIFF', intent: '' });
    expect(empty.messages[1]!.content).not.toContain('## Derived PR intent');
    expect(empty.assembly.intent).toBeNull();
  });
});
