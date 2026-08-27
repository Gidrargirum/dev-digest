import { describe, it, expect } from 'vitest';
import {
  derivePrStateKey,
  changedLinesFromPatch,
  selectInputFiles,
  buildGroundingSets,
  groundEntries,
  type InputFile,
  type StateKeyFile,
} from './helpers.js';
import { MAX_RISKS, MAX_REVIEW_FOCUS, MAX_INPUT_FILES } from './constants.js';

// ---------------------------------------------------------------- derivePrStateKey

describe('derivePrStateKey (AC-4)', () => {
  const files: StateKeyFile[] = [
    { path: 'src/a.ts', additions: 3, deletions: 1 },
    { path: 'src/b.ts', additions: 0, deletions: 2 },
  ];

  it('is deterministic — identical inputs produce an identical key', () => {
    expect(derivePrStateKey('sha1', files)).toBe(derivePrStateKey('sha1', files));
  });

  it('is insensitive to input file ordering (stable sort of the digest)', () => {
    const reordered = [...files].reverse();
    expect(derivePrStateKey('sha1', reordered)).toBe(derivePrStateKey('sha1', files));
  });

  it('changes when head_sha changes', () => {
    expect(derivePrStateKey('sha1', files)).not.toBe(derivePrStateKey('sha2', files));
  });

  it('changes when the diff-statistics digest changes even though head_sha is unchanged (the trap)', () => {
    const bumped: StateKeyFile[] = [
      { path: 'src/a.ts', additions: 4, deletions: 1 }, // +3 -> +4
      { path: 'src/b.ts', additions: 0, deletions: 2 },
    ];
    expect(derivePrStateKey('sha1', bumped)).not.toBe(derivePrStateKey('sha1', files));
  });

  it('changes when a file path is added/removed', () => {
    const extra: StateKeyFile[] = [...files, { path: 'src/c.ts', additions: 1, deletions: 0 }];
    expect(derivePrStateKey('sha1', extra)).not.toBe(derivePrStateKey('sha1', files));
  });
});

// ---------------------------------------------------------------- changedLinesFromPatch

describe('changedLinesFromPatch', () => {
  it('returns [] for a null or empty patch', () => {
    expect(changedLinesFromPatch(null)).toEqual([]);
    expect(changedLinesFromPatch('')).toEqual([]);
  });

  it('collects new-side numbers for added (+) AND context ( ) lines', () => {
    const patch = ['@@ -10,3 +10,4 @@', ' ctxA', '+added', ' ctxB', ' ctxC'].join('\n');
    // new side: 10 ctxA, 11 added, 12 ctxB, 13 ctxC
    expect(changedLinesFromPatch(patch)).toEqual([10, 11, 12, 13]);
  });

  it('does not advance the new-side counter for deletion (-) lines and never emits a number for them', () => {
    const patch = ['@@ -10,3 +10,2 @@', ' ctx', '-gone', '+new'].join('\n');
    // 10 ctx, (- gone: no number, no advance), 11 new
    expect(changedLinesFromPatch(patch)).toEqual([10, 11]);
  });

  it('does not emit a number for the @@ hunk header itself', () => {
    const patch = ['@@ -1,1 +1,1 @@', '+only'].join('\n');
    expect(changedLinesFromPatch(patch)).toEqual([1]);
  });

  it('skips the "\\ No newline at end of file" marker', () => {
    const patch = ['@@ -1,1 +1,1 @@', '+only', '\\ No newline at end of file'].join('\n');
    expect(changedLinesFromPatch(patch)).toEqual([1]);
  });

  it('handles multiple hunks, resetting the new-side counter from each header', () => {
    const patch = [
      '@@ -1,1 +1,2 @@',
      ' a',
      '+b',
      '@@ -50,1 +51,2 @@',
      ' x',
      '+y',
    ].join('\n');
    expect(changedLinesFromPatch(patch)).toEqual([1, 2, 51, 52]);
  });

  it('ignores lines before the first hunk header', () => {
    const patch = [
      'diff --git a/f b/f',
      '--- a/f',
      '+++ b/f',
      '@@ -1,1 +1,1 @@',
      '+x',
    ].join('\n');
    expect(changedLinesFromPatch(patch)).toEqual([1]);
  });
});

// ---------------------------------------------------------------- selectInputFiles

describe('selectInputFiles (AC-36)', () => {
  const mk = (path: string, additions: number, deletions: number): InputFile => ({
    path,
    additions,
    deletions,
    patch: null,
  });

  it('sorts described files by (additions + deletions) descending', () => {
    const files = [mk('small', 1, 0), mk('big', 40, 10), mk('mid', 5, 5)];
    const { described } = selectInputFiles(files, 10);
    expect(described.map((f) => f.path)).toEqual(['big', 'mid', 'small']);
  });

  it('describes at most `max` files individually and collapses the rest into an aggregate', () => {
    const files = Array.from({ length: 5 }, (_, i) => mk(`f${i}`, i + 1, 0));
    const { described, omittedCount, omittedChangedLines } = selectInputFiles(files, 2);
    expect(described.map((f) => f.path)).toEqual(['f4', 'f3']); // 5 and 4 changed lines
    expect(omittedCount).toBe(3);
    expect(omittedChangedLines).toBe(1 + 2 + 3); // f0..f2
  });

  it('defaults `max` to MAX_INPUT_FILES = 40', () => {
    const files = Array.from({ length: 45 }, (_, i) => mk(`f${i}`, 1, 0));
    const { described, omittedCount } = selectInputFiles(files);
    expect(described).toHaveLength(MAX_INPUT_FILES);
    expect(omittedCount).toBe(5);
  });

  it('produces a zero aggregate when nothing is omitted', () => {
    const { omittedCount, omittedChangedLines } = selectInputFiles([mk('a', 1, 1)], 40);
    expect(omittedCount).toBe(0);
    expect(omittedChangedLines).toBe(0);
  });
});

// ---------------------------------------------------------------- grounding

describe('buildGroundingSets / groundEntries', () => {
  const files: InputFile[] = [
    {
      path: 'src/a.ts',
      additions: 2,
      deletions: 0,
      patch: ['@@ -10,2 +10,3 @@', ' ctx', '+one', '+two'].join('\n'), // new lines 10,11,12
    },
    { path: 'src/b.ts', additions: 1, deletions: 0, patch: null }, // no changed lines
  ];
  const sets = buildGroundingSets(files);
  const noEndpoints = new Set<string>();

  it('builds the path set and per-path changed lines from ALL files', () => {
    expect([...sets.pathSet].sort()).toEqual(['src/a.ts', 'src/b.ts']);
    expect(sets.changedLinesByPath.get('src/a.ts')).toEqual([10, 11, 12]);
    expect(sets.changedLinesByPath.get('src/b.ts')).toEqual([]);
    expect(sets.pathsByAlias.size).toBe(0); // inert rename stub — no data source this pass
  });

  it('drops a risk whose path is outside the changed-file set', () => {
    const { risks } = groundEntries(
      { risks: [{ title: 'r', path: 'src/nope.ts', line: 10 }] },
      sets,
      noEndpoints,
    );
    expect(risks).toEqual([]);
  });

  it('keeps a path-less risk, nulling path/line/endpoint', () => {
    const { risks } = groundEntries({ risks: [{ title: 'general risk' }] }, sets, noEndpoints);
    expect(risks).toEqual([{ title: 'general risk', detail: null, path: null, line: null, endpoint: null }]);
  });

  it('snaps a review-focus line that is not a changed line to the nearest changed line', () => {
    const { reviewFocus } = groundEntries(
      { review_focus: [{ path: 'src/a.ts', line: 99, reason: 'look here' }] },
      sets,
      noEndpoints,
    );
    expect(reviewFocus).toEqual([{ path: 'src/a.ts', line: 12, reason: 'look here' }]);
  });

  it('for line <= 0 either snaps to a real changed line or drops — never stores the raw value', () => {
    const { reviewFocus } = groundEntries(
      { review_focus: [{ path: 'src/a.ts', line: 0, reason: 'zero' }, { path: 'src/a.ts', line: -5, reason: 'neg' }] },
      sets,
      noEndpoints,
    );
    for (const f of reviewFocus) {
      expect(sets.changedLinesByPath.get('src/a.ts')).toContain(f.line);
    }
  });

  it('drops a review-focus entry for a file that has no changed lines at all', () => {
    const { reviewFocus } = groundEntries(
      { review_focus: [{ path: 'src/b.ts', line: 1, reason: 'no anchor' }] },
      sets,
      noEndpoints,
    );
    expect(reviewFocus).toEqual([]);
  });

  it('nulls an endpoint that is outside the endpoint set but keeps the risk', () => {
    const { risks } = groundEntries(
      { risks: [{ title: 'r', path: 'src/a.ts', line: 10, endpoint: 'GET /ghost' }] },
      sets,
      noEndpoints,
    );
    expect(risks).toEqual([
      { title: 'r', detail: null, path: 'src/a.ts', line: 10, endpoint: null },
    ]);
  });

  it('with an empty endpoint set (AC-18) no risk can carry an endpoint', () => {
    const { risks } = groundEntries(
      { risks: [{ title: 'r', path: 'src/a.ts', line: 10, endpoint: 'POST /a' }] },
      sets,
      noEndpoints,
    );
    expect(risks[0]!.endpoint).toBeNull();
  });

  it('preserves an endpoint that IS a member of the endpoint set', () => {
    const { risks } = groundEntries(
      { risks: [{ title: 'r', path: 'src/a.ts', line: 10, endpoint: 'POST /a' }] },
      sets,
      new Set(['POST /a']),
    );
    expect(risks[0]!.endpoint).toBe('POST /a');
  });

  it('drops a risk citing an old (renamed) path — the alias set is inert this pass', () => {
    const withAlias = buildGroundingSets(files);
    withAlias.pathsByAlias.clear(); // documented: always empty
    const { risks } = groundEntries(
      { risks: [{ title: 'r', path: 'src/old-a.ts', line: 10 }] },
      withAlias,
      noEndpoints,
    );
    expect(risks).toEqual([]);
  });

  it('truncates to MAX_RISKS / MAX_REVIEW_FOCUS and returns the PRE-truncation counts (AC-16)', () => {
    const manyRisks = Array.from({ length: MAX_RISKS + 4 }, (_, i) => ({
      title: `risk ${i}`,
      path: 'src/a.ts',
      line: 10,
    }));
    const manyFocus = Array.from({ length: MAX_REVIEW_FOCUS + 3 }, (_, i) => ({
      path: 'src/a.ts',
      line: 11,
      reason: `focus ${i}`,
    }));
    const out = groundEntries({ risks: manyRisks, review_focus: manyFocus }, sets, noEndpoints);
    expect(out.risks).toHaveLength(MAX_RISKS);
    expect(out.reviewFocus).toHaveLength(MAX_REVIEW_FOCUS);
    expect(out.risksTotal).toBe(MAX_RISKS + 4);
    expect(out.reviewFocusTotal).toBe(MAX_REVIEW_FOCUS + 3);
  });

  it('does NOT decide "everything dropped -> discard the brief" — it just returns empty arrays', () => {
    const out = groundEntries(
      {
        risks: [{ title: 'r', path: 'ghost.ts', line: 1 }],
        review_focus: [{ path: 'ghost.ts', line: 1, reason: 'x' }],
      },
      sets,
      noEndpoints,
    );
    expect(out).toEqual({ risks: [], reviewFocus: [], risksTotal: 0, reviewFocusTotal: 0 });
  });
});
