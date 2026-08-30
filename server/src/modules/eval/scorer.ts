import type { EvalExpectationType, EvalExpectedFinding, Finding } from '@devdigest/shared';

/**
 * The eval scorer — PURE, port-free (AC-18). Zero imports outside
 * `@devdigest/shared`: no `Container`, no `LLMProvider`, no `db`, no clock, no
 * randomness, no I/O. That import list is what makes AC-18 structurally true
 * ("scoring is constructed with no ports at all"); `verify-l06.mjs` asserts it
 * mechanically.
 *
 * Matching contract (AC-19/AC-20): a finding matches an expectation when
 * `file` is equal AND `[start_line, end_line]` intersects (inclusive) — no
 * other field participates (severity/category/title are surfaced for
 * diagnosis, never compared). Matching is greedy one-to-one: each expectation
 * is consumed by at most one finding, each finding satisfies at most one
 * expectation, and any surplus overlap on either side counts as unmatched.
 */

/** Map a produced `Finding` onto the `EvalExpectedFinding` shape so surplus
 *  findings (false positives) can be surfaced in the same `matched`/`unmatched`
 *  detail arrays as missed expectations — the two share every field that
 *  matters for diagnosis (file/lines/severity/category/title). */
function toExpectedShape(finding: Finding): EvalExpectedFinding {
  return {
    file: finding.file,
    start_line: finding.start_line,
    end_line: finding.end_line,
    severity: finding.severity,
    category: finding.category,
    title: finding.title,
  };
}

function rangesIntersect(aStart: number, aEnd: number, bStart: number, bEnd: number): boolean {
  const aLo = Math.min(aStart, aEnd);
  const aHi = Math.max(aStart, aEnd);
  const bLo = Math.min(bStart, bEnd);
  const bHi = Math.max(bStart, bEnd);
  return aLo <= bHi && bLo <= aHi;
}

export interface MatchResult {
  /** Expectations that a produced finding satisfied. */
  matched: EvalExpectedFinding[];
  /** Expectations no produced finding satisfied (recall misses). */
  unmatchedExpectations: EvalExpectedFinding[];
  /** Findings that did not satisfy any expectation (false positives). */
  unmatchedFindings: Finding[];
}

/** Greedy one-to-one match of findings against expectations. Deterministic:
 *  expectations are consumed in input order, each against the first
 *  unconsumed finding that satisfies it. */
export function matchFindings(findings: Finding[], expectations: EvalExpectedFinding[]): MatchResult {
  const consumed = new Set<number>();
  const matched: EvalExpectedFinding[] = [];
  const unmatchedExpectations: EvalExpectedFinding[] = [];

  for (const expectation of expectations) {
    let matchIndex = -1;
    for (let i = 0; i < findings.length; i++) {
      if (consumed.has(i)) continue;
      const finding = findings[i]!;
      if (
        finding.file === expectation.file &&
        rangesIntersect(finding.start_line, finding.end_line, expectation.start_line, expectation.end_line)
      ) {
        matchIndex = i;
        break;
      }
    }
    if (matchIndex >= 0) {
      consumed.add(matchIndex);
      matched.push(expectation);
    } else {
      unmatchedExpectations.push(expectation);
    }
  }

  const unmatchedFindings = findings.filter((_, i) => !consumed.has(i));
  return { matched, unmatchedExpectations, unmatchedFindings };
}

export interface ScoreCaseInput {
  expectationType: EvalExpectationType;
  findings: Finding[];
  expectations: EvalExpectedFinding[];
  /** Grounding's per-run citation-accuracy figure — this scorer never
   *  re-implements grounding, only carries the number through (AC-23). */
  citationAccuracy: number | null;
}

export interface ScoreCaseResult {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  pass: boolean;
  matched: EvalExpectedFinding[];
  unmatched: EvalExpectedFinding[];
}

/** Score one case's run against its expectations (AC-21/AC-22/AC-25). */
export function scoreCase(input: ScoreCaseInput): ScoreCaseResult {
  const { expectationType, findings, expectations, citationAccuracy } = input;
  const { matched, unmatchedExpectations, unmatchedFindings } = matchFindings(findings, expectations);
  const unmatchedFindingsAsExpected = unmatchedFindings.map(toExpectedShape);

  if (expectationType === 'must_not_flag') {
    // must_not_flag contributes NO recall denominator (AC-21) — the case has
    // no "correct findings to find". Every produced finding is a false
    // positive; a zero-denominator precision is `null`, never 0/1 (AC-22).
    const pass = findings.length === 0;
    return {
      recall: null,
      precision: findings.length === 0 ? null : 0,
      citation_accuracy: citationAccuracy,
      pass,
      matched: [],
      unmatched: unmatchedFindingsAsExpected,
    };
  }

  const recall = expectations.length === 0 ? null : matched.length / expectations.length;
  const precisionDenominator = matched.length + unmatchedFindings.length;
  const precision = precisionDenominator === 0 ? null : matched.length / precisionDenominator;
  const pass = unmatchedExpectations.length === 0;

  return {
    recall,
    precision,
    citation_accuracy: citationAccuracy,
    pass,
    matched,
    unmatched: [...unmatchedExpectations, ...unmatchedFindingsAsExpected],
  };
}

export interface CaseAggregateInput {
  expectationType: EvalExpectationType;
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  pass: boolean;
}

export interface AggregateResult {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
  /** False-positive rate over must_not_flag cases only (AC-24). `null` when
   *  the batch has no must_not_flag case. */
  no_flag_rate: number | null;
  cases_passed: number;
  cases_total: number;
}

/** Macro-average over cases that have a value for the metric — excludes
 *  `null`s from both the numerator and the denominator (AC-26). */
function macroAverage(values: (number | null)[]): number | null {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) return null;
  return present.reduce((sum, v) => sum + v, 0) / present.length;
}

/**
 * Amendment A (AC-50) — the signed `with` − `without` difference of one
 * metric. `null` whenever either side is `null` under AC-22 (a missing value
 * is never treated as zero); an identical pair of present values yields
 * exact `0`, not an absent value (AC-51), because subtraction of equal
 * numbers is `0` by construction — no special-casing needed.
 */
function marginal(withValue: number | null, withoutValue: number | null): number | null {
  if (withValue === null || withoutValue === null) return null;
  return withValue - withoutValue;
}

export interface MarginalEffectInput {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

export interface MarginalEffectResult {
  recall: number | null;
  precision: number | null;
  citation_accuracy: number | null;
}

/** Per-case marginal effect (AC-50/AC-51) — a pure function of the two
 *  already-scored passes, reads no clock/network/database. */
export function marginalEffect(
  withResult: MarginalEffectInput,
  withoutResult: MarginalEffectInput,
): MarginalEffectResult {
  return {
    recall: marginal(withResult.recall, withoutResult.recall),
    precision: marginal(withResult.precision, withoutResult.precision),
    citation_accuracy: marginal(withResult.citation_accuracy, withoutResult.citation_accuracy),
  };
}

/** Batch-level marginal effect — macro-averaged over cases with a value for
 *  that metric (AC-26's rule, applied identically to the marginal figures). */
export function aggregateMarginal(perCase: MarginalEffectResult[]): MarginalEffectResult {
  return {
    recall: macroAverage(perCase.map((c) => c.recall)),
    precision: macroAverage(perCase.map((c) => c.precision)),
    citation_accuracy: macroAverage(perCase.map((c) => c.citation_accuracy)),
  };
}

/** Aggregate a batch's per-case results into the batch-level metrics. */
export function aggregate(caseResults: CaseAggregateInput[]): AggregateResult {
  const cases_total = caseResults.length;
  const cases_passed = caseResults.filter((c) => c.pass).length;

  const recall = macroAverage(caseResults.map((c) => c.recall));
  const precision = macroAverage(caseResults.map((c) => c.precision));
  const citation_accuracy = macroAverage(caseResults.map((c) => c.citation_accuracy));

  const mustNotFlagCases = caseResults.filter((c) => c.expectationType === 'must_not_flag');
  const no_flag_rate =
    mustNotFlagCases.length === 0
      ? null
      : mustNotFlagCases.filter((c) => !c.pass).length / mustNotFlagCases.length;

  return { recall, precision, citation_accuracy, no_flag_rate, cases_passed, cases_total };
}
