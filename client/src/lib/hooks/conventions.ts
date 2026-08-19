/* hooks/conventions.ts — React Query hooks for the Conventions Extractor:
   scan a cloned repo for house-rules, triage the candidates, then bake the
   accepted ones into a Skill.

   The candidate list self-updates by polling while a scan is queued/running —
   SSE (`/repos/:id/conventions/scans/:scanId/events`) is a nicety, polling is
   the baseline that also survives a reconnect. */
"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ConventionCandidate,
  ConventionCategory,
  ConventionStatus,
  ConventionsPage,
  ConventionSkillDraft,
  ConventionSkillDraftSet,
  ConventionSkillsResult,
  Skill,
  SkillType,
} from "@devdigest/shared";

/** Poll cadence while a scan is queued/running. */
const SCAN_POLL_MS = 2000;

export function useConventions(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["conventions", repoId],
    queryFn: () => api.get<ConventionsPage>(`/repos/${repoId}/conventions`),
    enabled: !!repoId,
    refetchInterval: (query) => {
      // `data` survives an error, so an outage mid-scan would otherwise poll a
      // dead endpoint (and toast) forever. A failing query stops polling; the
      // ErrorState's Retry is the way back.
      if (query.state.status === "error") return false;
      const status = query.state.data?.scan?.status;
      return status === "queued" || status === "running" ? SCAN_POLL_MS : false;
    },
  });
}

export function useExtractConventions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (repoId: string) =>
      api.post<{ scan_id: string }>(`/repos/${repoId}/conventions/extract`),
    onSuccess: (_data, repoId) => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

export interface PatchConventionInput {
  id: string;
  /** Only used to invalidate the owning repo's list — not sent in the body. */
  repoId: string;
  patch: {
    status?: ConventionStatus;
    rule?: string;
    category?: ConventionCategory;
  };
}

export function usePatchConvention() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, patch }: PatchConventionInput) =>
      api.patch<ConventionCandidate>(`/conventions/${id}`, patch),
    onSuccess: (_data, { repoId }) => qc.invalidateQueries({ queryKey: ["conventions", repoId] }),
  });
}

/** Deterministic skill draft merged from the selected candidates. `enabled`
    gates the POST so it only fires once the create-skill modal opens. */
export function useConventionSkillDraft(
  repoId: string | null | undefined,
  conventionIds: string[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["convention-skill-draft", repoId, conventionIds],
    queryFn: () =>
      api.post<ConventionSkillDraft>(`/repos/${repoId}/conventions/skill/preview`, {
        convention_ids: conventionIds,
      }),
    enabled: enabled && !!repoId,
  });
}

export interface CreateConventionSkillInput {
  repoId: string;
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  convention_ids: string[];
  agent_ids?: string[];
}

export function useCreateConventionSkill() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, ...input }: CreateConventionSkillInput) =>
      api.post<Skill>(`/repos/${repoId}/conventions/skill`, input),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}

/** One deterministic draft per (grouped) category — the multi-skill preview.
    `enabled` gates the POST so it only fires once the create-skill modal opens. */
export function useConventionSkillDrafts(
  repoId: string | null | undefined,
  conventionIds: string[],
  enabled: boolean,
) {
  return useQuery({
    queryKey: ["convention-skill-drafts", repoId, conventionIds],
    queryFn: () =>
      api.post<ConventionSkillDraftSet>(`/repos/${repoId}/conventions/skills/preview`, {
        convention_ids: conventionIds,
      }),
    enabled: enabled && !!repoId,
  });
}

export interface CreateConventionSkillsDraftInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  enabled: boolean;
  convention_ids: string[];
}

export interface CreateConventionSkillsInput {
  repoId: string;
  drafts: CreateConventionSkillsDraftInput[];
  agent_ids?: string[];
}

export function useCreateConventionSkills() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ repoId, ...input }: CreateConventionSkillsInput) =>
      api.post<ConventionSkillsResult>(`/repos/${repoId}/conventions/skills`, input),
    onSuccess: (_data, { repoId }) => {
      qc.invalidateQueries({ queryKey: ["conventions", repoId] });
      qc.invalidateQueries({ queryKey: ["skills"] });
    },
  });
}
