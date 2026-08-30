import { describe, it, expect } from 'vitest';
import type { EvalExpectedFinding, Finding } from '@devdigest/shared';
import { matchFindings, scoreCase, aggregate } from './scorer.js';

function expectation(over: Partial<EvalExpectedFinding> = {}): EvalExpectedFinding {
  return {
    file: 'src/a.ts',
    start_line: 10,
    end_line: 12,
    severity: 'WARNING',
    category: 'bug',
    title: 'expected issue',
    ...over,
  };
}

function finding(over: Partial<Finding> = {}): Finding {
  return {
    id: 'f1',
    severity: 'WARNING',
    category: 'bug',
    title: 'found issue',
    file: 'src/a.ts',
    start_line: 10,
    end_line: 12,
    rationale: 'because',
    confidence: 0.9,
    ...over,
  };
}

describe('matchFindings', () => {
  it('matches a finding whose range shares a single-line edge with the expectation', () => {
    const exp = expectation({ start_line: 10, end_line: 10 });
    const f = finding({ start_line: 10, end_line: 15 });
    const result = matchFindings([f], [exp]);
    expect(result.matched).toEqual([exp]);
    expect(result.unmatchedExpectations).toEqual([]);
    expect(result.unmatchedFindings).toEqual([]);
  });

  it('is greedy one-to-one: two overlapping findings on one expectation → 1 match + 1 surplus', () => {
    const exp = expectation();
    const f1 = finding({ id: 'f1' });
    const f2 = finding({ id: 'f2' });
    const result = matchFindings([f1, f2], [exp]);
    expect(result.matched).toEqual([exp]);
    expect(result.unmatchedFindings).toEqual([f2]);
  });
});

describe('scoreCase', () => {
  it('scores a must_find case: 1 match + 1 surplus finding → precision 0.5, recall 1, fails only if expectation missed', () => {
    const exp = expectation();
    const f1 = finding({ id: 'f1' });
    const f2 = finding({ id: 'f2', file: 'src/b.ts' });
    const result = scoreCase({
      expectationType: 'must_find',
      findings: [f1, f2],
      expectations: [exp],
      citationAccuracy: 1,
    });
    expect(result.recall).toBe(1);
    expect(result.precision).toBe(0.5);
    expect(result.pass).toBe(true);
    expect(result.matched).toEqual([exp]);
    expect(result.unmatched).toHaveLength(1);
  });

  it('must_not_flag with zero findings → precision null, recall null, pass true', () => {
    const result = scoreCase({
      expectationType: 'must_not_flag',
      findings: [],
      expectations: [],
      citationAccuracy: null,
    });
    expect(result.recall).toBeNull();
    expect(result.precision).toBeNull();
    expect(result.pass).toBe(true);
  });

  it('must_not_flag with a produced finding → false positive, precision 0, pass false', () => {
    const result = scoreCase({
      expectationType: 'must_not_flag',
      findings: [finding()],
      expectations: [],
      citationAccuracy: 1,
    });
    expect(result.recall).toBeNull();
    expect(result.precision).toBe(0);
    expect(result.pass).toBe(false);
    expect(result.unmatched).toHaveLength(1);
  });

  it('a zero-expectation must_find case has null recall', () => {
    const result = scoreCase({
      expectationType: 'must_find',
      findings: [],
      expectations: [],
      citationAccuracy: null,
    });
    expect(result.recall).toBeNull();
  });

  it('produces byte-identical output across two invocations (determinism)', () => {
    const input = {
      expectationType: 'must_find' as const,
      findings: [finding()],
      expectations: [expectation()],
      citationAccuracy: 0.8,
    };
    const a = scoreCase(input);
    const b = scoreCase(input);
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });
});

describe('aggregate', () => {
  it('macro-averages over cases with a value, excluding a zero-expectation case with null recall', () => {
    const results = [
      { expectationType: 'must_find' as const, recall: 1, precision: 1, citation_accuracy: 1, pass: true },
      { expectationType: 'must_find' as const, recall: 0.5, precision: 0.5, citation_accuracy: 0.5, pass: false },
      // Zero-expectation case: null recall, excluded from the recall average.
      { expectationType: 'must_find' as const, recall: null, precision: null, citation_accuracy: null, pass: true },
    ];
    const agg = aggregate(results);
    expect(agg.recall).toBe(0.75);
    expect(agg.precision).toBe(0.75);
    expect(agg.cases_total).toBe(3);
    expect(agg.cases_passed).toBe(2);
  });

  it('computes no_flag_rate over must_not_flag cases only, null when there are none', () => {
    const noneAgg = aggregate([
      { expectationType: 'must_find', recall: 1, precision: 1, citation_accuracy: 1, pass: true },
    ]);
    expect(noneAgg.no_flag_rate).toBeNull();

    const someAgg = aggregate([
      { expectationType: 'must_not_flag', recall: null, precision: null, citation_accuracy: null, pass: true },
      { expectationType: 'must_not_flag', recall: null, precision: 0, citation_accuracy: null, pass: false },
    ]);
    expect(someAgg.no_flag_rate).toBe(0.5);
  });
});
