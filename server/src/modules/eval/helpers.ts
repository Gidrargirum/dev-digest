import type { EvalBatch, EvalCase, EvalDashboardRun, EvalExpectedFinding, EvalRunRecord } from '@devdigest/shared';
import { EvalExpectedFinding as EvalExpectedFindingSchema } from '@devdigest/shared';
import type { EvalBatchRow, EvalCaseRow, EvalRunRow } from '../../db/rows.js';

/**
 * Pure helpers for the eval module — DB row ⇄ DTO mapping. No I/O, mirrors
 * `modules/agents/helpers.ts`.
 */

/** Parse a jsonb column into `EvalExpectedFinding[]`, defaulting to `[]` when
 *  the column is null (a case created before this shape existed, or one with
 *  no expectations yet). Exported so callers that need the parsed shape
 *  without a full `EvalCase` DTO (e.g. `batch-executor.ts`) don't duplicate
 *  this parse inline. */
export function parseExpectedFindings(value: unknown): EvalExpectedFinding[] {
  if (value == null) return [];
  return EvalExpectedFindingSchema.array().parse(value);
}

export function toEvalCaseDto(row: EvalCaseRow): EvalCase {
  return {
    id: row.id,
    owner_kind: row.ownerKind as EvalCase['owner_kind'],
    owner_id: row.ownerId,
    name: row.name,
    input_diff: row.inputDiff ?? '',
    input_files: row.inputFiles,
    input_meta: row.inputMeta,
    expectation_type: row.expectationType as EvalCase['expectation_type'],
    expected_output: parseExpectedFindings(row.expectedOutput),
    notes: row.notes,
  };
}

export function toEvalBatchDto(row: EvalBatchRow): EvalBatch {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_version: row.agentVersion,
    status: row.status as EvalBatch['status'],
    started_at: row.startedAt.toISOString(),
    finished_at: row.finishedAt ? row.finishedAt.toISOString() : null,
    cases_total: row.casesTotal ?? 0,
    cases_passed: row.casesPassed ?? 0,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    no_flag_rate: row.noFlagRate,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
  };
}

export function toEvalRunRecordDto(row: EvalRunRow & { caseName?: string }): EvalRunRecord {
  return {
    id: row.id,
    case_id: row.caseId,
    case_name: row.caseName ?? null,
    batch_id: row.batchId,
    ran_at: row.ranAt.toISOString(),
    actual_output: row.actualOutput,
    pass: row.pass,
    recall: row.recall,
    precision: row.precision,
    citation_accuracy: row.citationAccuracy,
    duration_ms: row.durationMs,
    cost_usd: row.costUsd,
    matched: parseExpectedFindings(row.matched),
    unmatched: parseExpectedFindings(row.unmatched),
  };
}

/** Dashboard `Recent runs` row (AC-32): the run record plus the owning
 *  agent's id/name and the batch's agent version. */
export function toEvalDashboardRunDto(
  row: EvalRunRow & { caseName?: string; agentId: string; agentName: string; agentVersion: number },
): EvalDashboardRun {
  return {
    ...toEvalRunRecordDto(row),
    agent_id: row.agentId,
    agent_name: row.agentName,
    agent_version: row.agentVersion,
  };
}
