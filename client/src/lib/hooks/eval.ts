/* hooks/eval.ts — React Query hooks for the A5 Eval Pipeline (L06).
   Cases (gold set) + batches (replays) + workspace dashboard. Types come
   from `@devdigest/shared`; response shapes are never re-parsed client-side
   (client/insights 2026-08-19). */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import { useRunEvents } from "./reviews";
import type {
  EvalCase,
  EvalCaseInput,
  EvalBatch,
  EvalBatchDetail,
  EvalBatchStarted,
  EvalDashboard,
  EvalRunResult,
} from "@devdigest/shared";

// ---- Cases -----------------------------------------------------------------

/** Every eval case owned by an agent (AC-10/AC-11). */
export function useEvalCases(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", agentId],
    queryFn: () => api.get<EvalCase[]>(`/agents/${agentId}/eval-cases`),
    enabled: !!agentId,
  });
}

/** Create a case (AC-2/AC-3 seed from a triaged finding, or the blank form). */
export function useCreateEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/agents/${agentId}/eval-cases`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

export interface UpdateEvalCaseInput {
  caseId: string;
  agentId?: string | null;
  patch: Partial<EvalCaseInput>;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, patch }: UpdateEvalCaseInput) =>
      api.put<EvalCase>(`/eval-cases/${caseId}`, patch),
    onSuccess: (_d, { agentId }) => {
      if (agentId) qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
    },
  });
}

export function useDeleteEvalCase(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/eval-cases/${caseId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", agentId] }),
  });
}

/** "Run on save" / the case row's `Run` action (AC-9). */
export function useRunEvalCase() {
  return useMutation({
    mutationFn: (caseId: string) => api.post<EvalRunResult>(`/eval-cases/${caseId}/run`),
  });
}

// ---- Batches -----------------------------------------------------------------

/** Start a batch replay over every case of the agent (AC-12). Returns
    immediately with the batch id; progress streams over SSE (see
    `useEvalBatchEvents`) rather than holding this request open. */
export function useStartEvalBatch(agentId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalBatchStarted>(`/agents/${agentId}/eval-runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
    },
  });
}

/** An agent's batch history, newest first (run history + Compare selection). */
export function useEvalBatches(agentId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batches", agentId],
    queryFn: () => api.get<EvalBatch[]>(`/agents/${agentId}/eval-runs`),
    enabled: !!agentId,
  });
}

/** One batch's aggregate + per-case detail. */
export function useEvalBatch(batchId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batch", batchId],
    queryFn: () => api.get<EvalBatchDetail>(`/eval-runs/${batchId}`),
    enabled: !!batchId,
  });
}

// ---- Dashboard -----------------------------------------------------------------

/** Workspace-wide dashboard: every agent + its latest batch, plus recent runs
    across the whole workspace (AC-31/AC-32). */
export function useEvalDashboard() {
  return useQuery({
    queryKey: ["eval-dashboard"],
    queryFn: () => api.get<EvalDashboard>("/evals/dashboard"),
  });
}

// ---- Live progress -----------------------------------------------------------------

/**
 * Batch progress over the existing run-event channel (Non-functional:
 * Responsiveness) — the batch executor reuses the same `RunBus` a review run
 * does, so this is the identical `EventSource` pattern as
 * `useRunEvents` (`lib/hooks/reviews.ts:198`), scoped to a batch id instead
 * of a review run id. `running` drives the `Running…` label (AC-9/AC-12) —
 * never polling.
 */
export function useEvalBatchEvents(batchId: string | null | undefined) {
  return useRunEvents(batchId ? [batchId] : []);
}
