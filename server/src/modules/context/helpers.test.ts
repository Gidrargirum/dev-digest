import { describe, it, expect } from 'vitest';
import { mergeAttachments, sourceTagFor, formatSpecsReadEntry, formatSpecsSkippedEntry } from './helpers.js';

/**
 * `mergeAttachments` (AC-11): agent's own documents first (in their configured
 * order), then enabled skills' documents (already pre-sorted by skill-link
 * order then each skill's own order), deduplicated by path with the agent's
 * position winning on collision.
 */
describe('mergeAttachments', () => {
  it('orders the agent documents first, by their own order field', () => {
    const merged = mergeAttachments(
      [
        { path: 'b.md', order: 1 },
        { path: 'a.md', order: 0 },
      ],
      [],
    );
    expect(merged).toEqual(['a.md', 'b.md']);
  });

  it('appends skill documents after the agent documents, preserving skill-provided order', () => {
    const merged = mergeAttachments(
      [{ path: 'agent-doc.md', order: 0 }],
      [
        { path: 'skill-a.md', order: 0 },
        { path: 'skill-b.md', order: 1 },
      ],
    );
    expect(merged).toEqual(['agent-doc.md', 'skill-a.md', 'skill-b.md']);
  });

  it('dedupes a path attached to both the agent and a skill, keeping the agent position', () => {
    const merged = mergeAttachments(
      [
        { path: 'shared.md', order: 1 },
        { path: 'only-agent.md', order: 0 },
      ],
      [{ path: 'shared.md', order: 0 }],
    );
    // Agent's own order (0 then 1) decides position among agent docs; the
    // skill's duplicate of shared.md is dropped entirely, not re-ordered in.
    expect(merged).toEqual(['only-agent.md', 'shared.md']);
  });

  it('returns an empty array when nothing is attached', () => {
    expect(mergeAttachments([], [])).toEqual([]);
  });
});

describe('sourceTagFor', () => {
  it('tags a path under .devdigest/specs/ as specs', () => {
    expect(sourceTagFor('.devdigest/specs/architecture.md')).toBe('specs');
  });

  it('tags a path under .devdigest/docs/ as docs', () => {
    expect(sourceTagFor('.devdigest/docs/onboarding.md')).toBe('docs');
  });

  it('tags anything else (e.g. .devdigest/insights/) as insights', () => {
    expect(sourceTagFor('.devdigest/insights/2026-08-26.md')).toBe('insights');
  });
});

describe('specs_read line formatting', () => {
  it('formats a successfully-read document as `path · ≈N tokens`', () => {
    expect(formatSpecsReadEntry('.devdigest/specs/a.md', 317)).toBe(
      '.devdigest/specs/a.md · ≈317 tokens',
    );
  });

  it('formats a skipped document distinctly, without a token count', () => {
    expect(formatSpecsSkippedEntry('.devdigest/specs/missing.md')).toBe(
      '.devdigest/specs/missing.md · skipped (unreadable)',
    );
  });
});
