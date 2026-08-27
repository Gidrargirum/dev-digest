import { describe, expect, it } from 'vitest';
import {
  GetBlastRadiusInputSchema,
  GetBlastRadiusOutputSchema,
  GetConventionsInputSchema,
  GetConventionsOutputSchema,
  GetFindingsInputSchema,
  GetFindingsOutputSchema,
  ListAgentsInputSchema,
  ListAgentsOutputSchema,
  RunAgentInputSchema,
  RunAgentOutputSchema,
} from './schemas.js';

describe('list_agents schemas', () => {
  it('parses a valid input', () => {
    const result = ListAgentsInputSchema.parse({ cursor: 'abc', limit: 50 });
    expect(result).toEqual({ cursor: 'abc', limit: 50 });
  });

  it('applies the default limit when omitted', () => {
    const result = ListAgentsInputSchema.parse({});
    expect(result.limit).toBe(20);
  });

  it('rejects a limit above the max', () => {
    const result = ListAgentsInputSchema.safeParse({ limit: 101 });
    expect(result.success).toBe(false);
  });

  it('parses a valid output', () => {
    const result = ListAgentsOutputSchema.safeParse({
      agents: [
        {
          id: 'agent-1',
          name: 'Security Reviewer',
          description: null,
          provider: 'anthropic',
          model: 'claude-sonnet',
          enabled: true,
        },
      ],
      next_cursor: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('run_agent_on_pull_request schemas', () => {
  it('parses a valid input', () => {
    const result = RunAgentInputSchema.safeParse({
      repo: 'devdigest/courses',
      pr: 42,
      agent: 'security-reviewer',
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing repo', () => {
    const result = RunAgentInputSchema.safeParse({ pr: 42, agent: 'security-reviewer' });
    expect(result.success).toBe(false);
  });

  it('rejects a negative pr number', () => {
    const result = RunAgentInputSchema.safeParse({
      repo: 'devdigest/courses',
      pr: -1,
      agent: 'security-reviewer',
    });
    expect(result.success).toBe(false);
  });

  it('parses a valid output', () => {
    const result = RunAgentOutputSchema.safeParse({
      status: 'completed',
      run_id: 'run-1',
      agent: 'security-reviewer',
      verdict: 'APPROVE',
      score: 0.9,
      findings_count: 1,
      findings: [
        {
          severity: 'WARNING',
          category: 'security',
          title: 'Missing input validation',
          file: 'src/index.ts',
          start_line: 10,
          end_line: 12,
          rationale: 'User input reaches a query unsanitized.',
          suggestion: null,
        },
      ],
      next: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('get_findings schemas', () => {
  it('parses a valid input', () => {
    const result = GetFindingsInputSchema.safeParse({
      repo: 'devdigest/courses',
      pr: 7,
      review_id: 'review-1',
      cursor: 'xyz',
      limit: 100,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing repo', () => {
    const result = GetFindingsInputSchema.safeParse({ pr: 7 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative pr number', () => {
    const result = GetFindingsInputSchema.safeParse({ repo: 'devdigest/courses', pr: -1 });
    expect(result.success).toBe(false);
  });

  it('parses a valid output', () => {
    const result = GetFindingsOutputSchema.safeParse({
      verdict: 'REQUEST_CHANGES',
      score: 0.4,
      reviews: [{ review_id: 'review-1', agent_name: 'security-reviewer', verdict: 'REQUEST_CHANGES', score: 0.4 }],
      findings: [
        {
          severity: 'CRITICAL',
          category: 'security',
          title: 'SQL injection',
          file: 'src/db.ts',
          start_line: 1,
          end_line: 3,
          rationale: 'Unsanitized string concatenation into a query.',
          suggestion: 'Use a parameterized query.',
        },
      ],
      next_cursor: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('get_conventions schemas', () => {
  it('parses a valid input', () => {
    const result = GetConventionsInputSchema.safeParse({
      repo: 'devdigest/courses',
      category: 'naming',
      status: 'active',
      cursor: 'abc',
      limit: 25,
    });
    expect(result.success).toBe(true);
  });

  it('rejects a missing repo', () => {
    const result = GetConventionsInputSchema.safeParse({ category: 'naming' });
    expect(result.success).toBe(false);
  });

  it('rejects a limit above the max', () => {
    const result = GetConventionsInputSchema.safeParse({ repo: 'devdigest/courses', limit: 201 });
    expect(result.success).toBe(false);
  });

  it('parses a valid output', () => {
    const result = GetConventionsOutputSchema.safeParse({
      scan: { status: 'completed', finished_at: '2026-08-22T00:00:00.000Z' },
      conventions: [
        {
          id: 'conv-1',
          category: 'naming',
          rule: 'Use camelCase for variables.',
          confidence: 0.8,
          support: 12,
          violations: 1,
          origin: 'inferred',
          status: 'active',
          applied_as_skill: false,
        },
      ],
      next_cursor: null,
    });
    expect(result.success).toBe(true);
  });
});

describe('get_blast_radius schemas', () => {
  it('parses a valid input', () => {
    const result = GetBlastRadiusInputSchema.safeParse({ repo: 'devdigest/courses', pr: 3 });
    expect(result.success).toBe(true);
  });

  it('rejects a missing repo', () => {
    const result = GetBlastRadiusInputSchema.safeParse({ pr: 3 });
    expect(result.success).toBe(false);
  });

  it('rejects a negative pr number', () => {
    const result = GetBlastRadiusInputSchema.safeParse({ repo: 'devdigest/courses', pr: -1 });
    expect(result.success).toBe(false);
  });

  it('parses a valid ok output with no reason field', () => {
    const result = GetBlastRadiusOutputSchema.safeParse({
      status: 'ok',
      summary: '1 symbols · 1 callers · 1 endpoints',
      symbols: [
        {
          name: 'doThing',
          file: 'src/x.ts',
          kind: 'function',
          callers: [{ name: 'caller1', file: 'src/y.ts', line: 10 }],
          endpoints: ['GET /things'],
          crons: [],
          callers_truncated: false,
        },
      ],
      counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
    });
    expect(result.success).toBe(true);
  });

  it('parses a valid degraded output with a reason and empty symbols', () => {
    const result = GetBlastRadiusOutputSchema.safeParse({
      status: 'degraded',
      reason: 'repo not indexed yet',
      summary: '',
      symbols: [],
      counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
    });
    expect(result.success).toBe(true);
  });
});
