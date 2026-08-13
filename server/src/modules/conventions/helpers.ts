import { createHash } from 'node:crypto';
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionScan,
  ConventionSkillDraft,
} from '@devdigest/shared';
import type { ConventionRow, ConventionScanRow } from '../../db/rows.js';
import { MAX_CANDIDATES_PER_CATEGORY } from './constants.js';

/**
 * Pure helpers for the conventions extractor. NO I/O lives here — the file
 * reads, greps and model calls happen in `service.ts`, so everything below is
 * directly unit-testable without Docker or a provider key.
 */

// ---------------------------------------------------------------- dedup keys

/**
 * Collapse a rule to its comparable essence: lowercase, punctuation-insensitive,
 * whitespace-normalized. "Always use async/await instead of .then() chains." and
 * "always use async / await instead of .then chains" must hash the same, or a
 * re-scan re-proposes what the user already rejected.
 */
export function normalizeRule(rule: string): string {
  return rule
    .toLowerCase()
    .replace(/[`'"]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

export function ruleHash(rule: string): string {
  return createHash('sha1').update(normalizeRule(rule)).digest('hex').slice(0, 16);
}

// ------------------------------------------------------- untrusted-input gates

/**
 * Whether a model-supplied path may be read out of the clone.
 *
 * `GitClient.readFile` is a bare `join(clonePath, path)`, so `../../../.ssh/id_rsa`
 * escapes the repository. The path here originates from a model whose prompt is
 * built from repository file contents — untrusted text that can steer it — so an
 * injected instruction could otherwise turn "cite your evidence" into an
 * arbitrary file read whose contents are then rendered in the UI as a snippet.
 */
export function isSafeRepoPath(path: string): boolean {
  if (path.length === 0 || path.length > 400) return false;
  if (path.startsWith('/') || /^[a-zA-Z]:/.test(path)) return false; // absolute
  if (path.includes('\0') || path.includes('\\')) return false;
  return !path.split('/').some((seg) => seg === '..');
}

/** Longest model-supplied regex we are willing to compile. */
const MAX_PATTERN_LENGTH = 200;

/**
 * Whether a model-supplied regex may be run over the whole clone.
 *
 * The grep fallback compiles the pattern with `new RegExp` and tests it against
 * every line of every file, so a catastrophically backtracking pattern
 * (`(a+)+$`) would wedge the extraction job. We reject what does not compile,
 * what is absurdly long, and the nested-quantifier shape that causes
 * exponential backtracking. Rejection costs the candidate its corroboration,
 * which the MIN_SUPPORT gate then turns into a drop — it never fails the scan.
 */
export function isSafePattern(pattern: string): boolean {
  if (pattern.length === 0 || pattern.length > MAX_PATTERN_LENGTH) return false;
  // A pattern starting with `-` can be smuggled in as a ripgrep FLAG rather
  // than a pattern (`--pre=<cmd>` makes rg execute that command per file). The
  // adapter now passes `--` before the positionals; this is the second lock,
  // because a real regex never needs to start with a dash anyway.
  if (pattern.startsWith('-')) return false;
  // A quantified group whose body is itself quantified — the classic ReDoS shape.
  if (/\([^)]*[+*][^)]*\)\s*[+*]/.test(pattern)) return false;
  try {
    new RegExp(pattern);
    return true;
  } catch {
    return false;
  }
}

// ------------------------------------------------------------ evidence gate

/** Whitespace-insensitive form used to match a snippet against file content. */
export function normalizeSnippet(snippet: string): string {
  return snippet.replace(/\s+/g, ' ').trim();
}

/**
 * Locate `snippet` inside `fileText` and return its 1-based start line, or
 * `null` when it is not present at all.
 *
 * Matching is whitespace-insensitive and multi-line: the snippet's lines are
 * matched consecutively against the file's lines. This is what makes REPAIR
 * possible — a model that quotes real code but guesses the line number wrong
 * (which it does constantly) keeps its candidate, with the line corrected,
 * instead of being dropped over an off-by-three.
 */
export function findSnippetLine(fileText: string, snippet: string): number | null {
  const needle = normalizeSnippet(snippet);
  if (needle.length === 0) return null;

  const fileLines = fileText.split('\n');
  const snippetLines = snippet
    .split('\n')
    .map(normalizeSnippet)
    .filter((l) => l.length > 0);
  if (snippetLines.length === 0) return null;

  // Single-line snippet: a substring match anywhere is enough.
  if (snippetLines.length === 1) {
    const idx = fileLines.findIndex((l) => normalizeSnippet(l).includes(snippetLines[0]!));
    return idx === -1 ? null : idx + 1;
  }

  // Multi-line: every snippet line must appear on consecutive file lines.
  for (let i = 0; i + snippetLines.length <= fileLines.length; i++) {
    let matched = true;
    for (let j = 0; j < snippetLines.length; j++) {
      if (!normalizeSnippet(fileLines[i + j]!).includes(snippetLines[j]!)) {
        matched = false;
        break;
      }
    }
    if (matched) return i + 1;
  }
  return null;
}

/** Line span a snippet occupies once anchored at `startLine`. */
export function snippetEndLine(startLine: number, snippet: string): number {
  const lines = snippet.split('\n').filter((l) => l.trim().length > 0).length;
  return startLine + Math.max(lines - 1, 0);
}

// ----------------------------------------------------------- confidence math

/**
 * Confidence as a MEASURED ratio rather than the model's self-report.
 * `support` = files following the rule, `violations` = files breaking it.
 * No evidence either way → 0, which the MIN_SUPPORT gate then rejects.
 */
export function measuredConfidence(support: number, violations: number): number {
  const total = support + violations;
  if (total <= 0) return 0;
  return Math.min(1, Math.max(0, support / total));
}

// ---------------------------------------------------------- diversity quota

/**
 * Keep at most `perCategory` candidates of each category, highest confidence
 * first. Without this the list degenerates into eight phrasings of one rule.
 */
export function capPerCategory<T extends { category: ConventionCategory; confidence: number }>(
  candidates: T[],
  perCategory: number = MAX_CANDIDATES_PER_CATEGORY,
): T[] {
  const seen = new Map<string, number>();
  return [...candidates]
    .sort((a, b) => b.confidence - a.confidence)
    .filter((c) => {
      const n = seen.get(c.category) ?? 0;
      if (n >= perCategory) return false;
      seen.set(c.category, n + 1);
      return true;
    });
}

// ------------------------------------------------------- config-derived rules

export interface ConfigRule {
  category: ConventionCategory;
  rule: string;
  evidencePath: string;
  evidenceLine: number;
  evidenceSnippet: string;
}

/**
 * The first line containing any of `needles`, as `{ line, snippet }` copied
 * VERBATIM from the file — or `null` when none of them is there.
 *
 * Config rules skip the snippet gate that model candidates go through, so if
 * the snippet were hand-written here it could cite text that is not in the file
 * — exactly the fabricated evidence this whole feature exists to prevent.
 * Quoting the matched line makes that impossible by construction.
 */
function cite(text: string, ...needles: string[]): { line: number; snippet: string } | null {
  const lines = text.split('\n');
  const idx = lines.findIndex((l) => needles.some((n) => l.includes(n)));
  if (idx === -1) return null;
  return { line: idx + 1, snippet: lines[idx]!.trim() };
}

/** Push a config rule only when its evidence was actually found in the file. */
function pushCited(
  out: ConfigRule[],
  file: { path: string; content: string },
  category: ConventionCategory,
  rule: string,
  ...needles: string[]
): void {
  const found = cite(file.content, ...needles);
  if (!found) return;
  out.push({
    category,
    rule,
    evidencePath: file.path,
    evidenceLine: found.line,
    evidenceSnippet: found.snippet,
  });
}

/**
 * Derive conventions from the project's own config files, deterministically.
 *
 * These cost nothing, cannot hallucinate, and guarantee a non-empty result even
 * for a repo repo-intel has not indexed yet. Only settings that a reviewer can
 * actually act on are emitted — not every key in the file.
 */
export function rulesFromConfigs(files: { path: string; content: string }[]): ConfigRule[] {
  const out: ConfigRule[] = [];

  for (const file of files) {
    const base = file.path.split('/').pop() ?? file.path;

    if (base === 'tsconfig.json') {
      if (/"strict"\s*:\s*true/.test(file.content)) {
        pushCited(
          out,
          file,
          'structure',
          'TypeScript runs in strict mode — no implicit `any`, no unchecked null access.',
          '"strict"',
        );
      }
      if (/"noUncheckedIndexedAccess"\s*:\s*true/.test(file.content)) {
        pushCited(
          out,
          file,
          'structure',
          'Indexed access is checked — an element read from an array or record may be undefined.',
          '"noUncheckedIndexedAccess"',
        );
      }
      if (/"verbatimModuleSyntax"\s*:\s*true/.test(file.content)) {
        pushCited(
          out,
          file,
          'imports',
          'Type-only imports must use `import type` — verbatim module syntax is on.',
          '"verbatimModuleSyntax"',
        );
      }
    }

    if (base.startsWith('eslint') || base.startsWith('.eslintrc')) {
      pushCited(
        out,
        file,
        'async',
        'Every promise must be awaited or explicitly handled — `no-floating-promises` is enforced.',
        'no-floating-promises',
      );
      // Either signal means the same house rule; the citation follows whichever
      // one is actually in the file.
      pushCited(
        out,
        file,
        'other',
        'Lint runs with zero tolerance — warnings fail the build, so no suppressions.',
        'max-warnings',
        'no-console',
      );
      pushCited(
        out,
        file,
        'imports',
        'Imports follow the enforced `import/order` grouping.',
        'import/order',
      );
    }

    if (base.startsWith('.prettierrc') || base.startsWith('prettier.config')) {
      const width = /"?printWidth"?\s*:\s*(\d+)/.exec(file.content);
      if (width) {
        pushCited(
          out,
          file,
          'other',
          `Lines wrap at ${width[1]} characters — Prettier owns formatting.`,
          'printWidth',
        );
      }
      if (/"?singleQuote"?\s*:\s*true/.test(file.content)) {
        pushCited(out, file, 'naming', 'String literals use single quotes.', 'singleQuote');
      }
    }
  }

  return out;
}

// --------------------------------------------------------------- skill body

/** Slug used for the skill name and its per-rule section headings. */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

export function skillNameFor(repoName: string): string {
  return `${slugify(repoName)}-conventions`;
}

/** Language hint for the fenced snippet, from the evidence file's extension. */
function fenceLang(path: string): string {
  const ext = path.split('.').pop()?.toLowerCase() ?? '';
  const map: Record<string, string> = {
    ts: 'ts',
    tsx: 'tsx',
    js: 'js',
    jsx: 'jsx',
    json: 'json',
    py: 'python',
    go: 'go',
    rs: 'rust',
    rb: 'ruby',
    java: 'java',
    sql: 'sql',
  };
  return map[ext] ?? '';
}

export interface SkillBodyInput {
  category: string;
  rule: string;
  evidence_path: string;
  evidence_line: number;
  evidence_end_line: number;
  evidence_snippet: string;
}

/**
 * Assemble the merged skill body from accepted conventions — deterministically,
 * in code. Deliberately NOT a model call: the user already approved this exact
 * text, and a model rewrite would silently reintroduce claims they rejected.
 */
export function buildSkillMarkdown(repoName: string, accepted: SkillBodyInput[]): string {
  const parts: string[] = [
    `# ${skillNameFor(repoName)}`,
    '',
    `House conventions for \`${repoName}\`. Flag changes that violate any rule below and cite the offending \`file:line\`.`,
  ];

  for (const c of accepted) {
    const span =
      c.evidence_end_line > c.evidence_line
        ? `${c.evidence_line}-${c.evidence_end_line}`
        : `${c.evidence_line}`;
    parts.push(
      '',
      `## ${slugify(c.rule)}`,
      c.rule,
      '',
      `Detected in \`${c.evidence_path}:${span}\`:`,
      '',
      '```' + fenceLang(c.evidence_path),
      c.evidence_snippet.trimEnd(),
      '```',
    );
  }

  return parts.join('\n') + '\n';
}

export function buildSkillDraft(
  repoName: string,
  accepted: (SkillBodyInput & { id: string })[],
): ConventionSkillDraft {
  return {
    name: skillNameFor(repoName),
    description: `${accepted.length} house convention${accepted.length === 1 ? '' : 's'} extracted from ${repoName}`,
    body: buildSkillMarkdown(repoName, accepted),
    evidence_files: [...new Set(accepted.map((c) => c.evidence_path))],
    convention_ids: accepted.map((c) => c.id),
  };
}

// -------------------------------------------------------------------- DTOs

export function toConventionDto(row: ConventionRow): ConventionCandidate {
  return {
    id: row.id,
    category: row.category,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine ?? 1,
    evidence_end_line: row.evidenceEndLine ?? row.evidenceLine ?? 1,
    evidence_snippet: row.evidenceSnippet ?? '',
    confidence: row.confidence ?? 0,
    model_confidence: row.modelConfidence,
    support: row.support,
    violations: row.violations,
    origin: row.origin,
    status: row.status,
    skill_id: row.skillId,
  };
}

export function toScanDto(row: ConventionScanRow): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status,
    sample_files: row.sampleFiles,
    candidates_raw: row.candidatesRaw,
    candidates_kept: row.candidatesKept,
    model: row.model,
    cost_usd: row.costUsd,
    error: row.error,
    created_at: row.createdAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
  };
}
