import { describe, it, expect } from 'vitest';
import { parseLinkedIssueRefs, confidenceFromSources } from './helpers.js';
import { rowToIntentRecord } from './repository.js';
import { MAX_LINKED_ISSUES } from './constants.js';

/**
 * `parseLinkedIssueRefs` (plans/intent-layer.md step 4 / specs/pr-intent-
 * layer.md "Sources and degradation"): all 9 GitHub closing keywords, a bare
 * `#123`, cross-repo refs, dedup, the `limit` parameter, and an empty body.
 */
describe('parseLinkedIssueRefs', () => {
  const CLOSING_KEYWORDS = [
    'close',
    'closes',
    'closed',
    'fix',
    'fixes',
    'fixed',
    'resolve',
    'resolves',
    'resolved',
  ];

  it.each(CLOSING_KEYWORDS)('recognizes the "%s" closing keyword', (kw) => {
    const refs = parseLinkedIssueRefs(`${kw} #42`, MAX_LINKED_ISSUES);
    expect(refs).toEqual([{ number: 42, crossRepo: false }]);
  });

  it('is case-insensitive on the closing keyword', () => {
    const refs = parseLinkedIssueRefs('Closes #7', MAX_LINKED_ISSUES);
    expect(refs).toEqual([{ number: 7, crossRepo: false }]);
  });

  it('recognizes a bare `#123` with no closing keyword', () => {
    const refs = parseLinkedIssueRefs('see #123 for context', MAX_LINKED_ISSUES);
    expect(refs).toEqual([{ number: 123, crossRepo: false }]);
  });

  it('recognizes a cross-repo `owner/repo#123` reference and flags it crossRepo', () => {
    const refs = parseLinkedIssueRefs('Fixes acme/other#55', MAX_LINKED_ISSUES);
    expect(refs).toEqual([{ owner: 'acme', repo: 'other', number: 55, crossRepo: true }]);
  });

  it('deduplicates repeated references to the same issue', () => {
    const refs = parseLinkedIssueRefs('Closes #9. Also fixes #9 again, see #9.', MAX_LINKED_ISSUES);
    expect(refs).toHaveLength(1);
    expect(refs[0]).toEqual({ number: 9, crossRepo: false });
  });

  it('dedupes same-repo and cross-repo refs to the same number independently', () => {
    const refs = parseLinkedIssueRefs('Closes #9, and acme/other#9', MAX_LINKED_ISSUES);
    expect(refs).toHaveLength(2);
  });

  it('returns an empty array for an empty, null, or undefined body', () => {
    expect(parseLinkedIssueRefs('', MAX_LINKED_ISSUES)).toEqual([]);
    expect(parseLinkedIssueRefs(null, MAX_LINKED_ISSUES)).toEqual([]);
    expect(parseLinkedIssueRefs(undefined, MAX_LINKED_ISSUES)).toEqual([]);
    expect(parseLinkedIssueRefs('no issue references here', MAX_LINKED_ISSUES)).toEqual([]);
  });

  it('respects the `limit` parameter, capping the number of returned refs', () => {
    const refs = parseLinkedIssueRefs('Closes #1, fixes #2, resolves #3, see #4', 2);
    expect(refs).toHaveLength(2);
    expect(refs.map((r) => r.number)).toEqual([1, 2]);
  });

  it('MAX_LINKED_ISSUES caps a body with more distinct refs than the constant allows', () => {
    const body = 'Closes #1, fixes #2, resolves #3, see #4, also #5';
    const refs = parseLinkedIssueRefs(body, MAX_LINKED_ISSUES);
    expect(refs).toHaveLength(MAX_LINKED_ISSUES);
  });
});

/**
 * `confidenceFromSources` — the rubric (plans/intent-layer.md §2 /
 * specs/pr-intent-layer.md "Confidence rubric") is computed by code from
 * `sources[]` alone, never by the model.
 */
describe('confidenceFromSources', () => {
  it('returns "low" for pr_title + pr_branch + pr_files only', () => {
    expect(confidenceFromSources(['pr_title', 'pr_branch', 'pr_files'])).toBe('low');
  });

  it('returns "low" even with fewer than the three base sources (no body, no issue)', () => {
    expect(confidenceFromSources(['pr_title', 'pr_branch'])).toBe('low');
  });

  it('returns "medium" when a non-empty pr_body is additionally present', () => {
    expect(confidenceFromSources(['pr_title', 'pr_branch', 'pr_files', 'pr_body'])).toBe('medium');
  });

  it('returns "high" when at least one linked issue was successfully fetched', () => {
    expect(
      confidenceFromSources(['pr_title', 'pr_branch', 'pr_files', 'pr_body', 'issue#42']),
    ).toBe('high');
  });

  it('returns "high" from an issue source even without a pr_body', () => {
    expect(confidenceFromSources(['pr_title', 'pr_branch', 'issue#42'])).toBe('high');
  });

  it('a skipped cross-repo reference alone does not raise confidence past low/medium', () => {
    expect(
      confidenceFromSources(['pr_title', 'pr_branch', 'pr_files', 'acme/other#5 (skipped)']),
    ).toBe('low');
    expect(
      confidenceFromSources(['pr_title', 'pr_branch', 'pr_body', 'acme/other#5 (skipped)']),
    ).toBe('medium');
  });
});

/**
 * The row → contract mapping moved to `repository.ts` (it is persistence's job,
 * not a pure helper's), and it now VALIDATES rather than casts. Covered here
 * because the confidence rubric it feeds lives in this file.
 */
describe('rowToIntentRecord — read-boundary validation', () => {
  type Row = Parameters<typeof rowToIntentRecord>[0];

  function row(overrides: Partial<Row> = {}): Row {
    return {
      prId: 'pr-1',
      intent: 'Adds rate limiting.',
      inScope: ['api'],
      outOfScope: [],
      sources: ['pr_title', 'pr_branch'],
      confidence: 'medium',
      headSha: 'a1b2c3d4',
      computedAt: new Date('2026-08-18T00:00:00Z'),
      ...overrides,
    } as Row;
  }

  it('passes through a valid enum value', () => {
    expect(rowToIntentRecord(row({ confidence: 'high' }))?.confidence).toBe('high');
  });

  it('degrades an out-of-enum stored value to "low"', () => {
    expect(rowToIntentRecord(row({ confidence: 'extremely-confident' }))?.confidence).toBe('low');
  });

  it('reports a structurally corrupt row as no intent rather than returning it', () => {
    expect(rowToIntentRecord(row({ inScope: 'not-an-array' as unknown as string[] }))).toBeUndefined();
  });
});
