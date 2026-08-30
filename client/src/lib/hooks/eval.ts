/* hooks/eval.ts — React Query hooks for the A5 Eval Pipeline (L06).
   Cases (gold set) + batches (replays) + workspace dashboard. Types come
   from `@devdigest/shared`; response shapes are never re-parsed client-side
   (client/insights 2026-08-19). */
"use client";

import { useEffect, useRef, useState } from "react";
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
  EvalRunRecord,
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
  /** Amendment A — set when editing a skill-owned case, so the skill's case
   *  list (`["eval-cases","skill",id]`) is invalidated too. Kept as a
   *  separate optional field rather than widening `agentId`'s meaning:
   *  `/eval-cases/:caseId` itself is owner-agnostic (AC-54), only the
   *  React Query cache key needs to know which list to refresh. */
  skillId?: string | null;
  patch: Partial<EvalCaseInput>;
}

export function useUpdateEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ caseId, patch }: UpdateEvalCaseInput) =>
      api.put<EvalCase>(`/eval-cases/${caseId}`, patch),
    onSuccess: (_d, { agentId, skillId }) => {
      if (agentId) qc.invalidateQueries({ queryKey: ["eval-cases", agentId] });
      if (skillId) qc.invalidateQueries({ queryKey: ["eval-cases", "skill", skillId] });
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

// ---- Cases (skill-owned, Amendment A) ---------------------------------------

/** Every eval case owned by a skill (AC-55, mirrors AC-10/AC-11 for agents). */
export function useSkillEvalCases(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-cases", "skill", skillId],
    queryFn: () => api.get<EvalCase[]>(`/skills/${skillId}/eval-cases`),
    enabled: !!skillId,
  });
}

/** Create a skill-owned case (AC-36) — a second route family, not a
 *  generalisation of the agent route (A-3). */
export function useCreateSkillEvalCase(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: EvalCaseInput) => api.post<EvalCase>(`/skills/${skillId}/eval-cases`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", "skill", skillId] }),
  });
}

/** Mirrors `useDeleteEvalCase` for the skill-owned case list. */
export function useDeleteSkillEvalCase(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (caseId: string) => api.del<{ ok: boolean }>(`/eval-cases/${caseId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["eval-cases", "skill", skillId] }),
  });
}

const RUN_POLL_INTERVAL_MS = 700;
// A one-case batch is still one real LLM call — observed ~23s end to end
// against a live provider, so leave real headroom above that rather than
// tuning to the happy path.
const RUN_POLL_MAX_ATTEMPTS = 90; // ~63s ceiling

/** The server dispatches a single-case run as a one-case batch (every
    `eval_runs` row must belong to a batch) and its `POST` returns
    immediately with `{ batch_id }` — poll the batch detail until it leaves
    `running` and hand back that case's row, so callers get a real result
    instead of a batch id nobody follows up on. */
async function pollForCaseRun(batchId: string, caseId: string): Promise<EvalRunRecord> {
  for (let attempt = 0; attempt < RUN_POLL_MAX_ATTEMPTS; attempt++) {
    const detail = await api.get<EvalBatchDetail>(`/eval-runs/${batchId}`);
    if (detail.batch.status !== "running") {
      const run = detail.runs.find((r) => r.case_id === caseId);
      if (run) return run;
      throw new Error("Eval case ran but produced no result row");
    }
    await new Promise((resolve) => setTimeout(resolve, RUN_POLL_INTERVAL_MS));
  }
  throw new Error("Eval case run timed out");
}

/** "Run on save" / the case row's `Run` action (AC-9). Also invalidates the
    agent's batch history and the workspace dashboard, since a single-case
    run creates a new (one-case) batch that becomes the agent's latest. */
export function useRunEvalCase() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (caseId: string) => {
      const { batch_id } = await api.post<EvalBatchStarted>(`/eval-cases/${caseId}/run`);
      return pollForCaseRun(batch_id, caseId);
    },
    onSuccess: () => {
      // Also invalidates "eval-batch" (singular, the per-batch detail query
      // `useEvalBatch` reads) — a single-case run's batch can be the same id
      // an earlier, still-mounted detail query already cached, so the list
      // refetch alone isn't enough to guarantee that detail is re-fetched too.
      qc.invalidateQueries({
        predicate: (q) =>
          q.queryKey[0] === "eval-batches" || q.queryKey[0] === "eval-dashboard" || q.queryKey[0] === "eval-batch",
      });
    },
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

/** One batch's aggregate + per-case detail — owner-agnostic (`GET
    /eval-runs/:batchId`, AC-54), so this is reused unchanged for a skill
    batch's detail too. */
export function useEvalBatch(batchId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batch", batchId],
    queryFn: () => api.get<EvalBatchDetail>(`/eval-runs/${batchId}`),
    enabled: !!batchId,
  });
}

// ---- Batches (skill-owned, Amendment A) --------------------------------------

/** Start a skill batch — two passes per case (AC-41). Unlike
    `useStartEvalBatch`, this does NOT invalidate `["eval-dashboard"]`: skill
    batches never appear on the workspace dashboard (A-4). */
export function useStartSkillEvalBatch(skillId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<EvalBatchStarted>(`/skills/${skillId}/eval-runs`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["eval-batches", "skill", skillId] });
    },
  });
}

/** A skill's batch history, newest first. */
export function useSkillEvalBatches(skillId: string | null | undefined) {
  return useQuery({
    queryKey: ["eval-batches", "skill", skillId],
    queryFn: () => api.get<EvalBatch[]>(`/skills/${skillId}/eval-runs`),
    enabled: !!skillId,
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

/**
 * The "Run eval (N)" / "Run all evals" action: starts a batch, then follows
 * its SSE channel and re-invalidates `eval-batches`/`eval-dashboard` only
 * once the batch actually finishes. `useStartEvalBatch` alone invalidates
 * right after the `202` — at that point the batch is still `running` with no
 * scores yet, so the UI looked like the button did nothing until a manual
 * reload. `isRunning` stays true for the whole batch, not just the POST.
 */
export function useRunAgentEvalBatch(agentId: string | null | undefined) {
  const qc = useQueryClient();
  const start = useStartEvalBatch(agentId);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const { running } = useEvalBatchEvents(pendingBatchId);
  // `running` starts `false` and only flips `true` once useEvalBatchEvents'
  // own effect has run — on the very first render after `setPendingBatchId`
  // it is still `false`, which used to satisfy `pendingBatchId && !running`
  // immediately and tear the subscription down before the batch had even
  // been observed running: the button's "Running…" state vanished within one
  // tick, the cache got invalidated onto the still-`running` batch (no
  // scores yet), and nothing was left watching for the real completion
  // minutes later. Require an actual true→false transition instead.
  const sawRunningRef = useRef(false);

  useEffect(() => {
    if (!pendingBatchId) {
      sawRunningRef.current = false;
      return;
    }
    if (running) sawRunningRef.current = true;
    if (!running && sawRunningRef.current) {
      qc.invalidateQueries({ queryKey: ["eval-batches", agentId] });
      qc.invalidateQueries({ queryKey: ["eval-dashboard"] });
      // The batch that just finished may already be cached under
      // ["eval-batch", pendingBatchId] (e.g. it was the agent's previous
      // latest batch, still mounted) — invalidate its detail explicitly so
      // per-case rows don't keep reading a pre-completion snapshot.
      qc.invalidateQueries({ queryKey: ["eval-batch", pendingBatchId] });
      setPendingBatchId(null);
    }
  }, [running, pendingBatchId, agentId, qc]);

  const run = () => start.mutate(undefined, { onSuccess: (started) => setPendingBatchId(started.batch_id) });

  return { run, isRunning: start.isPending || !!pendingBatchId };
}

/**
 * The skill batch equivalent of `useRunAgentEvalBatch` — same SSE-follow
 * pattern, but only re-invalidates `["eval-batches","skill",skillId]"`, never
 * `["eval-dashboard"]"` (A-4: skill batches are never listed there).
 */
export function useRunSkillEvalBatch(skillId: string | null | undefined) {
  const qc = useQueryClient();
  const start = useStartSkillEvalBatch(skillId);
  const [pendingBatchId, setPendingBatchId] = useState<string | null>(null);
  const { running } = useEvalBatchEvents(pendingBatchId);
  // See useRunAgentEvalBatch — requires a true→false transition, not merely
  // "currently false", so the just-started render doesn't look finished.
  const sawRunningRef = useRef(false);

  useEffect(() => {
    if (!pendingBatchId) {
      sawRunningRef.current = false;
      return;
    }
    if (running) sawRunningRef.current = true;
    if (!running && sawRunningRef.current) {
      qc.invalidateQueries({ queryKey: ["eval-batches", "skill", skillId] });
      qc.invalidateQueries({ queryKey: ["eval-batch", pendingBatchId] });
      setPendingBatchId(null);
    }
  }, [running, pendingBatchId, skillId, qc]);

  const run = () => start.mutate(undefined, { onSuccess: (started) => setPendingBatchId(started.batch_id) });

  return { run, isRunning: start.isPending || !!pendingBatchId };
}
