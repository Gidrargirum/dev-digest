import type { EvalExpectationType, EvalExpectedFinding, Severity, FindingCategory } from '@devdigest/shared';

/**
 * Seed fixtures for the eval pipeline (L06). Module-level so the shape is
 * unit-testable without Docker (mirrors `seed-skills.ts`/`seed-prompts.ts`).
 *
 * Each case's `inputDiff` is a small, self-contained unified diff whose hunk
 * actually contains the expectation's `[start_line, end_line]` range — a diff
 * whose lines don't cover the expectation would make the grounding gate drop
 * the correct finding and cap recall at 0 by construction.
 */

/** Build a minimal single-hunk unified diff. `lines` are pre-prefixed with
 *  `+` (added), `-` (removed), or a leading space (context). */
function buildDiff(path: string, startLine: number, lines: string[]): string {
  const additions = lines.filter((l) => l.startsWith('+')).length;
  const deletions = lines.filter((l) => l.startsWith('-')).length;
  const newCount = lines.length - deletions;
  const oldCount = lines.length - additions;
  return [
    `diff --git a/${path} b/${path}`,
    `--- a/${path}`,
    `+++ b/${path}`,
    `@@ -${startLine},${oldCount} +${startLine},${newCount} @@`,
    ...lines,
  ].join('\n');
}

function expectation(
  file: string,
  startLine: number,
  endLine: number,
  severity: Severity,
  category: FindingCategory,
  title: string,
): EvalExpectedFinding {
  return { file, start_line: startLine, end_line: endLine, severity, category, title };
}

export interface SeedEvalCaseDef {
  name: string;
  expectationType: EvalExpectationType;
  inputDiff: string;
  expectedOutput: EvalExpectedFinding[];
  notes: string;
}

export const SEED_EVAL_CASES: SeedEvalCaseDef[] = [
  {
    name: 'Hardcoded API key in config',
    expectationType: 'must_find',
    inputDiff: buildDiff('src/config.ts', 1, [
      ' export const config = {',
      "+  apiKey: 'sk_live_1234567890abcdef',",
      '+  timeout: 5000,',
      ' };',
    ]),
    expectedOutput: [
      expectation('src/config.ts', 2, 2, 'CRITICAL', 'security', 'Hardcoded API key committed in plaintext'),
    ],
    notes: 'A literal secret in an added line must be flagged CRITICAL/security.',
  },
  {
    name: 'N+1 query in list endpoint',
    expectationType: 'must_find',
    inputDiff: buildDiff('src/api/users.ts', 40, [
      ' async function listUsers(ids: string[]) {',
      '+  const users = [];',
      '+  for (const id of ids) {',
      '+    users.push(await db.user.findUnique({ where: { id } }));',
      '+  }',
      '+  return users;',
      ' }',
    ]),
    expectedOutput: [
      expectation('src/api/users.ts', 41, 45, 'WARNING', 'perf', 'N+1 query in loop'),
    ],
    notes: 'One query per iteration inside a loop over ids.',
  },
  {
    name: 'Missing input validation on order total',
    expectationType: 'must_find',
    inputDiff: buildDiff('src/api/orders.ts', 10, [
      ' export async function createOrder(body: unknown) {',
      '+  const { total } = body as { total: number };',
      '+  await db.order.create({ data: { total } });',
      ' }',
    ]),
    expectedOutput: [
      expectation('src/api/orders.ts', 11, 12, 'WARNING', 'bug', 'Unvalidated request body cast without schema check'),
    ],
    notes: 'A raw `as` cast on untrusted input with no runtime validation.',
  },
  {
    name: 'SQL injection via string concatenation',
    expectationType: 'must_find',
    inputDiff: buildDiff('src/db/queries.ts', 5, [
      ' export function findByName(name: string) {',
      "+  return db.raw(`SELECT * FROM users WHERE name = '${name}'`);",
      ' }',
    ]),
    expectedOutput: [
      expectation('src/db/queries.ts', 6, 6, 'CRITICAL', 'security', 'SQL injection via string interpolation'),
    ],
    notes: 'User-controlled `name` interpolated directly into a raw SQL string.',
  },
  {
    name: 'Missing error handling on async job',
    expectationType: 'must_find',
    inputDiff: buildDiff('src/jobs/sync.ts', 20, [
      ' export async function runSync() {',
      '+  const result = await externalApi.fetchAll();',
      '+  await db.records.bulkInsert(result);',
      ' }',
    ]),
    expectedOutput: [
      expectation('src/jobs/sync.ts', 21, 22, 'WARNING', 'bug', 'No error handling around external call'),
    ],
    notes: 'An awaited external call with no try/catch — a transient failure crashes the job.',
  },
  {
    name: 'Off-by-one loop bound in paginate helper',
    expectationType: 'must_find',
    inputDiff: buildDiff('src/utils/paginate.ts', 3, [
      ' export function pageSlice<T>(items: T[], page: number, size: number): T[] {',
      '+  const start = page * size;',
      '+  const end = start + size - 1;',
      '+  return items.slice(start, end);',
      ' }',
    ]),
    expectedOutput: [
      expectation('src/utils/paginate.ts', 5, 5, 'WARNING', 'bug', 'Off-by-one: end index excludes the last item of the page'),
    ],
    notes: '`slice(start, end)` is exclusive of `end`, so `size - 1` drops the last row.',
  },
  {
    name: 'Rename-only refactor of a format helper',
    expectationType: 'must_not_flag',
    inputDiff: buildDiff('src/utils/format.ts', 1, [
      ' export function formatCurrency(amountCents: number): string {',
      '-  const dollars = amountCents / 100;',
      '+  const value = amountCents / 100;',
      '-  return `$${dollars.toFixed(2)}`;',
      '+  return `$${value.toFixed(2)}`;',
      ' }',
    ]),
    expectedOutput: [],
    notes: 'Pure variable rename, behavior-identical — must not produce any finding.',
  },
  {
    name: 'Adding a well-tested pure sum helper',
    expectationType: 'must_not_flag',
    inputDiff: buildDiff('src/utils/sum.ts', 1, [
      "+export function sum(values: number[]): number {",
      '+  return values.reduce((total, v) => total + v, 0);',
      '+}',
    ]),
    expectedOutput: [],
    notes: 'A small, correct, side-effect-free addition — must not produce any finding.',
  },
];
