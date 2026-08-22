import { describe, it, expect } from 'vitest';
import {
  buildSkillDraft,
  buildSkillDrafts,
  buildSkillMarkdown,
  capPerCategory,
  findSnippetLine,
  isSafePattern,
  isSafeRepoPath,
  measuredConfidence,
  normalizeRule,
  normalizeSnippet,
  ruleHash,
  rulesFromConfigs,
  skillNameFor,
  slugify,
  snippetEndLine,
} from '../src/modules/conventions/helpers.js';

/**
 * The conventions extractor's decision logic. Everything asserted here runs
 * BEFORE a candidate reaches the UI, so these tests are the real specification
 * of what the model is and is not allowed to get away with.
 */

describe('normalizeRule / ruleHash', () => {
  it('collapses punctuation and case so re-phrasings dedupe together', () => {
    const a = 'Always use async/await instead of .then() chains.';
    const b = 'always use async await   INSTEAD of .then chains';
    expect(normalizeRule(a)).toBe(normalizeRule(b));
    expect(ruleHash(a)).toBe(ruleHash(b));
  });

  it('keeps genuinely different rules apart', () => {
    expect(ruleHash('Use async/await')).not.toBe(ruleHash('Use Result<T, ApiError>'));
  });
});

describe('isSafeRepoPath', () => {
  it('accepts an ordinary repo-relative path', () => {
    expect(isSafeRepoPath('src/api/users.ts')).toBe(true);
    expect(isSafeRepoPath('tsconfig.json')).toBe(true);
  });

  it('rejects traversal out of the clone', () => {
    expect(isSafeRepoPath('../../../../etc/passwd')).toBe(false);
    expect(isSafeRepoPath('src/../../secrets.json')).toBe(false);
  });

  it('rejects absolute paths', () => {
    expect(isSafeRepoPath('/etc/passwd')).toBe(false);
    expect(isSafeRepoPath('C:/Windows/System32/config')).toBe(false);
  });

  it('rejects null bytes, backslashes and the empty path', () => {
    expect(isSafeRepoPath('src/a\0.ts')).toBe(false);
    expect(isSafeRepoPath('src\\..\\..\\secret')).toBe(false);
    expect(isSafeRepoPath('')).toBe(false);
  });

  it('does not reject a filename that merely contains dots', () => {
    expect(isSafeRepoPath('src/a..b.ts')).toBe(true);
    expect(isSafeRepoPath('.eslintrc.json')).toBe(true);
  });
});

describe('isSafePattern', () => {
  it('accepts the patterns a model realistically produces', () => {
    expect(isSafePattern('await db\\.')).toBe(true);
    expect(isSafePattern('\\.then\\(')).toBe(true);
    expect(isSafePattern('Result<[A-Za-z]+, ApiError>')).toBe(true);
  });

  it('rejects a pattern that does not compile', () => {
    expect(isSafePattern('([unclosed')).toBe(false);
  });

  it('rejects the nested-quantifier ReDoS shape', () => {
    expect(isSafePattern('(a+)+$')).toBe(false);
    expect(isSafePattern('(x*)*y')).toBe(false);
  });

  it('rejects an empty or absurdly long pattern', () => {
    expect(isSafePattern('')).toBe(false);
    expect(isSafePattern('a'.repeat(500))).toBe(false);
  });
});

describe('normalizeSnippet', () => {
  it('is whitespace-insensitive', () => {
    expect(normalizeSnippet('  const   x =\t1;  ')).toBe('const x = 1;');
  });
});

describe('findSnippetLine', () => {
  const file = [
    'import { db } from "./db";', // 1
    '', // 2
    'export async function load(id: string) {', // 3
    '  const user = await db.users.find(id);', // 4
    '  const posts = await db.posts.findMany({ userId });', // 5
    '  return { user, posts };', // 6
    '}', // 7
  ].join('\n');

  it('finds a single-line snippet regardless of indentation', () => {
    expect(findSnippetLine(file, 'const user = await db.users.find(id);')).toBe(4);
  });

  it('finds a multi-line snippet on consecutive lines', () => {
    const snippet = 'const user = await db.users.find(id);\nconst posts = await db.posts.findMany({ userId });';
    expect(findSnippetLine(file, snippet)).toBe(4);
  });

  it('REPAIRS rather than drops: the returned line is the real one, not the claimed one', () => {
    // The model would have cited line 23; the snippet actually lives on line 4.
    const found = findSnippetLine(file, '  const user = await db.users.find(id);  ');
    expect(found).toBe(4);
    expect(found).not.toBe(23);
  });

  it('returns null when the snippet is not in the file at all', () => {
    expect(findSnippetLine(file, 'redis.set("k", "v")')).toBeNull();
  });

  it('returns null for an empty snippet', () => {
    expect(findSnippetLine(file, '   ')).toBeNull();
  });

  it('does not match a multi-line snippet whose lines are not consecutive', () => {
    const snippet = 'import { db } from "./db";\nreturn { user, posts };';
    expect(findSnippetLine(file, snippet)).toBeNull();
  });
});

describe('snippetEndLine', () => {
  it('spans the non-blank lines of the snippet', () => {
    expect(snippetEndLine(10, 'a\nb\nc')).toBe(12);
    expect(snippetEndLine(10, 'only one line')).toBe(10);
  });
});

describe('measuredConfidence', () => {
  it('is the support ratio, not the model self-report', () => {
    expect(measuredConfidence(9, 1)).toBeCloseTo(0.9);
    expect(measuredConfidence(12, 0)).toBe(1);
  });

  it('is 0 when nothing was measured either way', () => {
    expect(measuredConfidence(0, 0)).toBe(0);
  });

  it('is 0 when every occurrence violates the rule', () => {
    expect(measuredConfidence(0, 7)).toBe(0);
  });
});

describe('capPerCategory', () => {
  const c = (category: string, confidence: number, rule: string) =>
    ({ category, confidence, rule }) as never;

  it('keeps the highest-confidence N of each category', () => {
    const kept = capPerCategory(
      [
        c('async', 0.5, 'a1'),
        c('async', 0.9, 'a2'),
        c('async', 0.7, 'a3'),
        c('async', 0.6, 'a4'),
        c('naming', 0.4, 'n1'),
      ],
      2,
    ) as { rule: string }[];

    expect(kept.map((k) => k.rule)).toEqual(['a2', 'a3', 'n1']);
  });

  it('does not drop anything when every category is under quota', () => {
    const input = [c('async', 0.9, 'a'), c('naming', 0.8, 'n')];
    expect(capPerCategory(input, 3)).toHaveLength(2);
  });
});

describe('rulesFromConfigs', () => {
  it('derives strict-mode and indexed-access rules from tsconfig', () => {
    const rules = rulesFromConfigs([
      {
        path: 'tsconfig.json',
        content: '{\n  "compilerOptions": {\n    "strict": true,\n    "noUncheckedIndexedAccess": true\n  }\n}',
      },
    ]);
    expect(rules).toHaveLength(2);
    expect(rules[0]!.evidencePath).toBe('tsconfig.json');
    // Evidence points at the real line the key sits on.
    expect(rules[0]!.evidenceLine).toBe(3);
    expect(rules[1]!.evidenceLine).toBe(4);
  });

  it('derives an async rule from a no-floating-promises eslint config', () => {
    const rules = rulesFromConfigs([
      { path: 'eslint.config.mjs', content: "rules: {\n  '@typescript-eslint/no-floating-promises': 'error',\n}" },
    ]);
    expect(rules.map((r) => r.category)).toContain('async');
  });

  it('quotes the evidence line verbatim, never a hand-written snippet', () => {
    // Config rules skip the snippet gate, so their evidence must be copied out
    // of the file rather than composed — otherwise they can cite text that is
    // not there, which is precisely what this feature exists to prevent.
    const content = 'export default [\n  { rules: { "no-console": ["error"] } },\n];';
    const rules = rulesFromConfigs([{ path: 'eslint.config.mjs', content }]);
    const lint = rules.find((r) => r.category === 'other');
    expect(lint).toBeDefined();
    expect(content.split('\n')[lint!.evidenceLine - 1]).toContain(lint!.evidenceSnippet);
  });

  it('emits no lint rule when neither signal is present, rather than citing line 1', () => {
    const rules = rulesFromConfigs([
      { path: 'eslint.config.mjs', content: 'export default [\n  { rules: {} },\n];' },
    ]);
    expect(rules).toEqual([]);
  });

  it('derives a line-width rule from prettier', () => {
    const rules = rulesFromConfigs([{ path: '.prettierrc', content: '{ "printWidth": 100 }' }]);
    expect(rules[0]!.rule).toContain('100');
  });

  it('emits nothing for a config with no actionable settings', () => {
    expect(rulesFromConfigs([{ path: 'tsconfig.json', content: '{ "compilerOptions": {} }' }])).toEqual([]);
  });
});

describe('slugify / skillNameFor', () => {
  it('builds the merged skill name from the repo', () => {
    expect(skillNameFor('payments-api')).toBe('payments-api-conventions');
    expect(slugify('Always use async/await instead of .then() chains.')).toBe(
      'always-use-async-await-instead-of-then-chains',
    );
  });
});

describe('buildSkillMarkdown', () => {
  const accepted = [
    {
      category: 'async',
      rule: 'Always use async/await instead of .then() chains.',
      evidence_path: 'src/api/users.ts',
      evidence_line: 23,
      evidence_end_line: 31,
      evidence_snippet: 'const user = await db.users.find(id);',
    },
    {
      category: 'api',
      rule: 'All public route handlers return typed Result<T, ApiError>',
      evidence_path: 'src/api/public/index.ts',
      evidence_line: 14,
      evidence_end_line: 14,
      evidence_snippet: 'function handler(): Result<Item[], ApiError> {',
    },
  ];

  it('renders a heading, an intro and one section per rule', () => {
    const md = buildSkillMarkdown('payments-api', accepted);
    expect(md).toContain('# payments-api-conventions');
    expect(md).toContain('House conventions for `payments-api`');
    expect(md).toContain('## always-use-async-await-instead-of-then-chains');
    expect(md).toContain('Detected in `src/api/users.ts:23-31`:');
    // A single-line span is not rendered as "14-14".
    expect(md).toContain('Detected in `src/api/public/index.ts:14`:');
    expect(md).toContain('```ts');
  });

  it('produces a body with no rules when nothing was accepted', () => {
    const md = buildSkillMarkdown('payments-api', []);
    expect(md).toContain('# payments-api-conventions');
    expect(md).not.toContain('Detected in');
  });
});

describe('buildSkillDraft', () => {
  it('dedupes evidence files and carries the source convention ids', () => {
    const draft = buildSkillDraft('payments-api', [
      {
        id: 'c1',
        category: 'async',
        rule: 'Rule one here',
        evidence_path: 'src/a.ts',
        evidence_line: 1,
        evidence_end_line: 2,
        evidence_snippet: 'const a = 1;',
      },
      {
        id: 'c2',
        category: 'async',
        rule: 'Rule two here',
        evidence_path: 'src/a.ts',
        evidence_line: 5,
        evidence_end_line: 5,
        evidence_snippet: 'const b = 2;',
      },
    ]);

    expect(draft.name).toBe('payments-api-conventions');
    expect(draft.description).toBe('2 house conventions extracted from payments-api');
    expect(draft.evidence_files).toEqual(['src/a.ts']);
    expect(draft.convention_ids).toEqual(['c1', 'c2']);
  });

  it('singularizes the description for exactly one convention', () => {
    const draft = buildSkillDraft('payments-api', [
      {
        id: 'c1',
        category: 'naming',
        rule: 'Rule one here',
        evidence_path: 'src/a.ts',
        evidence_line: 1,
        evidence_end_line: 1,
        evidence_snippet: 'const a = 1;',
      },
    ]);
    expect(draft.description).toBe('1 house convention extracted from payments-api');
  });
});

describe('buildSkillDrafts', () => {
  const c = (
    id: string,
    category: string,
    confidence: number,
    rule = `${category} rule ${id}`,
  ) =>
    ({
      id,
      category,
      confidence,
      rule,
      evidence_path: `src/${category}.ts`,
      evidence_line: 1,
      evidence_end_line: 1,
      evidence_snippet: `// ${rule}`,
    }) as never;

  it('returns [] for an empty input', () => {
    expect(buildSkillDrafts('payments-api', [])).toEqual([]);
  });

  it("opens each draft's body with an H1 matching that draft's own name", () => {
    const drafts = buildSkillDrafts('payments-api', [
      c('a1', 'async', 0.9),
      c('a2', 'async', 0.7),
      c('n1', 'naming', 0.6),
      c('n2', 'naming', 0.5),
      c('lonely', 'security', 0.8),
    ]);

    // A `<repo>-naming-conventions` skill whose body opened with
    // `# <repo>-conventions` would read as the wrong file, and every
    // per-category skill would carry the very same heading.
    for (const draft of drafts) {
      expect(draft.body.split('\n')[0]).toBe(`# ${draft.name}`);
    }
    expect(new Set(drafts.map((d) => d.body.split('\n')[0])).size).toBe(drafts.length);
  });

  it('gives each category with >=2 accepted candidates its own named draft', () => {
    const drafts = buildSkillDrafts('payments-api', [
      c('a1', 'async', 0.9),
      c('a2', 'async', 0.7),
      c('n1', 'naming', 0.6),
      c('n2', 'naming', 0.5),
      c('s1', 'structure', 0.95),
      c('s2', 'structure', 0.4),
    ]);

    expect(drafts).toHaveLength(3);
    const names = drafts.map((d) => d.name);
    expect(names).toContain('payments-api-async-conventions');
    expect(names).toContain('payments-api-naming-conventions');
    expect(names).toContain('payments-api-structure-conventions');

    // Sorted by descending max confidence within the group: structure (0.95)
    // leads, then async (0.9), then naming (0.6).
    expect(names).toEqual([
      'payments-api-structure-conventions',
      'payments-api-async-conventions',
      'payments-api-naming-conventions',
    ]);

    for (const d of drafts) {
      expect(d.category).not.toBeNull();
    }
  });

  it('merges singleton categories into one general skill', () => {
    const drafts = buildSkillDrafts('payments-api', [
      c('a1', 'async', 0.9),
      c('n1', 'naming', 0.6),
      c('s1', 'structure', 0.5),
    ]);

    expect(drafts).toHaveLength(1);
    expect(drafts[0]!.name).toBe('payments-api-conventions');
    expect(drafts[0]!.category).toBeNull();
    expect(drafts[0]!.convention_ids.sort()).toEqual(['a1', 'n1', 's1']);
  });

  it('mixes grouped and merged drafts, each holding only its own convention ids', () => {
    const drafts = buildSkillDrafts('payments-api', [
      c('a1', 'async', 0.9),
      c('a2', 'async', 0.8),
      c('n1', 'naming', 0.3),
      c('api1', 'api', 0.2),
    ]);

    expect(drafts).toHaveLength(2);
    const asyncDraft = drafts.find((d) => d.name === 'payments-api-async-conventions')!;
    expect(asyncDraft.convention_ids.sort()).toEqual(['a1', 'a2']);

    const generalDraft = drafts.find((d) => d.category === null)!;
    expect(generalDraft.name).toBe('payments-api-conventions');
    expect(generalDraft.convention_ids.sort()).toEqual(['api1', 'n1']);

    // No overlap: every id appears in exactly one draft.
    const allIds = drafts.flatMap((d) => d.convention_ids);
    expect(new Set(allIds).size).toBe(allIds.length);
  });
});
