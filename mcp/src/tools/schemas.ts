// Zod input/output schemas for the 5 DevDigest MCP tools, plus the shared
// `Finding` projection they return. Flat arguments only (no nested objects
// in any inputSchema) and terse, description-driven fields — see
// docs/agent-prompts/mcp-server-best-practices.md §3 (pagination), §6.5
// (short descriptions, no enum lists / examples in the schema) and §7 (flat
// args, terse structured responses).
//
// This file defines contracts only — no HTTP calls, no wiring. `server.ts`
// registers these against the SDK later; `api/*` resolves them against the
// DevDigest API.

import { z } from 'zod';
import { BlastStatus } from '@devdigest/shared';

// ---------------------------------------------------------------------------
// Pagination cursor
// ---------------------------------------------------------------------------
// Opaque string, not a structured object — callers must treat it as a black
// box and only ever pass back a value they previously received as
// `next_cursor`. Encoding (base64 of an offset) is an implementation detail
// of the resolver, not part of this contract.
const CURSOR_DESCRIPTION =
  'Opaque pagination cursor; pass the value from a previous next_cursor, omit for the first page.';

// ---------------------------------------------------------------------------
// Shared Finding projection (used by run_agent_on_pull_request and get_findings)
// ---------------------------------------------------------------------------
// Deliberately a projection of the underlying findings table: no
// `review_id`, `accepted_at`, `dismissed_at`, `evidence`, or
// `trifecta_components` — those would turn the response into a raw DB dump,
// which contradicts the "terse structured response" principle (§7).
export const FindingSeveritySchema = z.enum(['CRITICAL', 'WARNING', 'SUGGESTION']);

export const FindingSchema = z.object({
  severity: FindingSeveritySchema,
  category: z.string().describe('Finding category, e.g. "security" or "correctness".'),
  title: z.string().describe('Short human-readable summary of the finding.'),
  file: z.string().describe('Repo-relative path of the affected file.'),
  start_line: z.number().int().nonnegative().describe('First affected line, 1-based.'),
  end_line: z.number().int().nonnegative().describe('Last affected line, 1-based.'),
  rationale: z.string().describe('Why this was flagged.'),
  suggestion: z.string().nullable().describe('Suggested fix, or null if none was produced.'),
});
export type Finding = z.infer<typeof FindingSchema>;

// ---------------------------------------------------------------------------
// 1. list_agents
// ---------------------------------------------------------------------------
export const ListAgentsInputSchema = z.object({
  cursor: z.string().optional().describe(CURSOR_DESCRIPTION),
  limit: z
    .number()
    .int()
    .min(1)
    .max(100)
    .default(20)
    .describe('Max agents to return per page (max 100, default 20).'),
});
export type ListAgentsInput = z.infer<typeof ListAgentsInputSchema>;

export const ListAgentsOutputSchema = z.object({
  agents: z.array(
    z.object({
      id: z.string(),
      name: z.string(),
      description: z.string().nullable(),
      provider: z.string(),
      model: z.string(),
      enabled: z.boolean(),
    }),
  ),
  next_cursor: z.string().nullable().describe('Pass to the next call to continue; null when done.'),
});
export type ListAgentsOutput = z.infer<typeof ListAgentsOutputSchema>;

// ---------------------------------------------------------------------------
// 2. run_agent_on_pull_request
// ---------------------------------------------------------------------------
export const RunAgentInputSchema = z.object({
  repo: z.string().min(1).describe('Repository as "owner/name" or a full GitHub URL.'),
  pr: z.number().int().positive().describe('Pull request number.'),
  agent: z.string().min(1).describe('Name of the agent to run.'),
});
export type RunAgentInput = z.infer<typeof RunAgentInputSchema>;

export const RunAgentOutputSchema = z.object({
  status: z.enum(['completed', 'failed', 'timeout']),
  run_id: z.string(),
  agent: z.string(),
  verdict: z.string().nullable(),
  score: z.number().nullable(),
  findings_count: z.number().int().nonnegative(),
  findings: z.array(FindingSchema),
  next: z
    .string()
    .nullable()
    .describe('Suggested next step; set only when status is failed or timeout.'),
});
export type RunAgentOutput = z.infer<typeof RunAgentOutputSchema>;

// ---------------------------------------------------------------------------
// 3. get_findings
// ---------------------------------------------------------------------------
export const GetFindingsInputSchema = z.object({
  repo: z.string().min(1).describe('Repository as "owner/name" or a full GitHub URL.'),
  pr: z.number().int().positive().describe('Pull request number.'),
  review_id: z.string().optional().describe('Limit to one review run; omit for all reviews on this PR.'),
  cursor: z.string().optional().describe(CURSOR_DESCRIPTION),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Max findings to return per page (max 200, default 50).'),
});
export type GetFindingsInput = z.infer<typeof GetFindingsInputSchema>;

export const GetFindingsOutputSchema = z.object({
  verdict: z.string().nullable(),
  score: z.number().nullable(),
  reviews: z.array(
    z.object({
      review_id: z.string(),
      agent_name: z.string().nullable(),
      verdict: z.string().nullable(),
      score: z.number().nullable(),
    }),
  ),
  findings: z.array(FindingSchema),
  next_cursor: z.string().nullable().describe('Pass to the next call to continue; null when done.'),
});
export type GetFindingsOutput = z.infer<typeof GetFindingsOutputSchema>;

// ---------------------------------------------------------------------------
// 4. get_conventions
// ---------------------------------------------------------------------------
export const GetConventionsInputSchema = z.object({
  repo: z.string().min(1).describe('Repository as "owner/name" or a full GitHub URL.'),
  category: z.string().optional().describe('Filter by convention category.'),
  status: z.string().optional().describe('Filter by convention status.'),
  cursor: z.string().optional().describe(CURSOR_DESCRIPTION),
  limit: z
    .number()
    .int()
    .min(1)
    .max(200)
    .default(50)
    .describe('Max conventions to return per page (max 200, default 50).'),
});
export type GetConventionsInput = z.infer<typeof GetConventionsInputSchema>;

export const GetConventionsOutputSchema = z.object({
  scan: z
    .object({
      status: z.string(),
      finished_at: z.string().nullable(),
    })
    .nullable()
    .describe('Latest convention scan for this repo, or null if none has run.'),
  conventions: z.array(
    z.object({
      id: z.string(),
      category: z.string(),
      rule: z.string(),
      confidence: z.number(),
      support: z.number(),
      violations: z.number(),
      origin: z.string(),
      status: z.string(),
      applied_as_skill: z.boolean(),
    }),
  ),
  next_cursor: z.string().nullable().describe('Pass to the next call to continue; null when done.'),
});
export type GetConventionsOutput = z.infer<typeof GetConventionsOutputSchema>;

// ---------------------------------------------------------------------------
// 5. get_blast_radius
// ---------------------------------------------------------------------------
export const GetBlastRadiusInputSchema = z.object({
  repo: z.string().min(1).describe('Repository as "owner/name" or a full GitHub URL.'),
  pr: z.number().int().positive().describe('Pull request number.'),
});
export type GetBlastRadiusInput = z.infer<typeof GetBlastRadiusInputSchema>;

// Flatter than the server's `PrBlastResponse`/`BlastRadius`: `downstream[]`
// is merged with the matching `changed_symbols[]` entry into one `symbols[]`
// row (name/file/kind + its own callers/endpoints/crons), so the model reads
// one array instead of cross-referencing two.
export const GetBlastRadiusOutputSchema = z.object({
  status: BlastStatus,
  reason: z
    .string()
    .optional()
    .describe('Present only when status is not "ok" — what happened and, for degraded, the next step.'),
  summary: z.string().describe('One-line summary, e.g. "2 symbols · 14 callers · 3 endpoints".'),
  symbols: z.array(
    z.object({
      name: z.string(),
      file: z.string(),
      kind: z.string(),
      callers: z.array(
        z.object({
          name: z.string(),
          file: z.string(),
          line: z.number().int(),
        }),
      ),
      endpoints: z.array(z.string()).describe('HTTP endpoints reachable from this symbol.'),
      crons: z.array(z.string()).describe('Cron jobs reachable from this symbol.'),
      callers_truncated: z.boolean().describe('True if this symbol had more callers than were returned.'),
    }),
  ),
  counts: z.object({
    symbols: z.number().int(),
    callers: z.number().int(),
    endpoints: z.number().int(),
    crons: z.number().int(),
  }),
});
export type GetBlastRadiusOutput = z.infer<typeof GetBlastRadiusOutputSchema>;

// ---------------------------------------------------------------------------
// Tool registry — what server.ts registers against the SDK
// ---------------------------------------------------------------------------
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  outputSchema: z.ZodTypeAny;
}

export const TOOL_DEFINITIONS: readonly ToolDefinition[] = [
  {
    name: 'list_agents',
    description:
      'Lists the review agents configured for this workspace, paginated. Returns identity and provider/model info, not the system prompt.',
    inputSchema: ListAgentsInputSchema,
    outputSchema: ListAgentsOutputSchema,
  },
  {
    name: 'run_agent_on_pull_request',
    description:
      'Runs a named review agent on a pull request end-to-end and returns its verdict, score, and findings once the run finishes or times out. Triggers a real LLM call and consumes API/LLM budget — confirm with the user before invoking on their behalf.',
    inputSchema: RunAgentInputSchema,
    outputSchema: RunAgentOutputSchema,
  },
  {
    name: 'get_findings',
    description:
      'Fetches findings and verdicts for a pull request, optionally scoped to a single review run, paginated.',
    inputSchema: GetFindingsInputSchema,
    outputSchema: GetFindingsOutputSchema,
  },
  {
    name: 'get_conventions',
    description:
      'Fetches learned coding conventions for a repository, optionally filtered by category or status, paginated.',
    inputSchema: GetConventionsInputSchema,
    outputSchema: GetConventionsOutputSchema,
  },
  {
    name: 'get_blast_radius',
    description:
      "Maps a pull request's impact: which changed symbols are called from elsewhere, and which HTTP endpoints/cron jobs are reachable from them, up to two hops of the reverse import graph. Index-based, no LLM call.",
    inputSchema: GetBlastRadiusInputSchema,
    outputSchema: GetBlastRadiusOutputSchema,
  },
] as const;
