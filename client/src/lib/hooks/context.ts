/* hooks/context.ts — React Query hooks for the Project Context Folder
   feature: browse the repository's .md document catalog, preview a single
   document's content, and manage the documents attached to an agent or a
   skill (scoped per (agent|skill, repository) pair).

   Only TYPES are imported from @devdigest/shared here — a runtime import
   pulls vendor/shared/index.ts into the Next bundle and breaks resolution
   of ./contracts/*.js (client/insights/INSIGHTS.md, 2026-08-19). No
   `.parse()` on the client. */
"use client";

import { useQuery, useQueries, useMutation, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
import type {
  ContextDoc,
  ContextAttachment,
  ContextFolder,
  ContextDocCoverage,
} from "@devdigest/shared";

/** The repository's full .md document catalog (AC-1/2/3/23). Empty array
    either because the repo has no clone yet or because no .md files exist
    under the search roots — the caller distinguishes those via `Repo.clone_path`. */
export function useContextDocs(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-docs", repoId],
    queryFn: () => api.get<ContextDoc[]>(`/repos/${repoId}/context/docs`),
    enabled: !!repoId,
  });
}

/** One document's content for Preview mode (AC-4), verified server-side
    against the live catalog (AC-16). */
export function useContextDocContent(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: ["context-doc-content", repoId, path],
    queryFn: () =>
      api.get<{ path: string; content: string }>(
        `/repos/${repoId}/context/docs/content?path=${encodeURIComponent(path!)}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Explicitly-registered empty folders (AC-27/30). The tree merges these
    with the document catalog client-side (buildTree). */
export function useContextFolders(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["context-folders", repoId],
    queryFn: () => api.get<ContextFolder[]>(`/repos/${repoId}/context/folders`),
    enabled: !!repoId,
  });
}

/** COVERAGE for one open document (AC-39/40): share of workspace agents with
    this exact document attached. `percent` is null when the workspace has no
    agents — the UI shows an explicit state, never 0%. */
export function useContextCoverage(
  repoId: string | null | undefined,
  path: string | null | undefined,
) {
  return useQuery({
    queryKey: ["context-coverage", repoId, path],
    queryFn: () =>
      api.get<ContextDocCoverage>(
        `/repos/${repoId}/context/docs/coverage?path=${encodeURIComponent(path!)}`,
      ),
    enabled: !!repoId && !!path,
  });
}

/** Shared cache invalidation after any authoring mutation (AC-41). */
function useInvalidateContext() {
  const qc = useQueryClient();
  return (repoId: string, path?: string) => {
    qc.invalidateQueries({ queryKey: ["context-docs", repoId] });
    qc.invalidateQueries({ queryKey: ["context-folders", repoId] });
    if (path) {
      qc.invalidateQueries({ queryKey: ["context-doc-content", repoId, path] });
      qc.invalidateQueries({ queryKey: ["context-coverage", repoId, path] });
    }
  };
}

/** Create a new empty .md document (AC-29). */
export function useCreateContextDoc() {
  const invalidate = useInvalidateContext();
  return useMutation({
    mutationFn: ({
      repoId,
      path,
      content = "",
    }: {
      repoId: string;
      path: string;
      content?: string;
    }) =>
      api.post<ContextDoc>(`/repos/${repoId}/context/docs`, { path, content }),
    onSuccess: (_data, { repoId, path }) => invalidate(repoId, path),
  });
}

/** Create a new folder branch (AC-30). */
export function useCreateContextFolder() {
  const invalidate = useInvalidateContext();
  return useMutation({
    mutationFn: ({ repoId, path }: { repoId: string; path: string }) =>
      api.post<ContextFolder>(`/repos/${repoId}/context/folders`, { path }),
    onSuccess: (_data, { repoId }) => invalidate(repoId),
  });
}

/** Upload an existing local .md file, base64-encoded (AC-31/32). */
export function useUploadContextDoc() {
  const invalidate = useInvalidateContext();
  return useMutation({
    mutationFn: ({
      repoId,
      path,
      contentBase64,
    }: {
      repoId: string;
      path: string;
      contentBase64: string;
    }) =>
      api.post<ContextDoc>(`/repos/${repoId}/context/docs/upload`, {
        path,
        content_base64: contentBase64,
      }),
    onSuccess: (_data, { repoId, path }) => invalidate(repoId, path),
  });
}

/** Save an edited document's content (AC-34/35), last-write-wins. */
export function useSaveContextDoc() {
  const invalidate = useInvalidateContext();
  return useMutation({
    mutationFn: ({
      repoId,
      path,
      content,
    }: {
      repoId: string;
      path: string;
      content: string;
    }) =>
      api.put<ContextDoc>(`/repos/${repoId}/context/docs/content`, {
        path,
        content,
      }),
    onSuccess: (_data, { repoId, path }) => invalidate(repoId, path),
  });
}

/** An agent's own attached documents for one repository (Context tab). */
export function useAgentContext(agentId: string | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["agent-context", agentId, repoId],
    queryFn: () =>
      api.get<ContextAttachment[]>(`/agents/${agentId}/context?repo_id=${repoId}`),
    enabled: !!agentId && !!repoId,
  });
}

/** Replace an agent's attached documents — order = position in `paths` (AC-6/8/9). */
export function useSetAgentContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      agentId,
      repoId,
      paths,
    }: {
      agentId: string;
      repoId: string;
      paths: string[];
    }) =>
      api.put<ContextAttachment[]>(`/agents/${agentId}/context`, {
        repo_id: repoId,
        paths,
      }),
    onSuccess: (_data, { agentId, repoId }) => {
      qc.invalidateQueries({ queryKey: ["agent-context", agentId, repoId] });
      qc.invalidateQueries({ queryKey: ["context-docs", repoId] });
    },
  });
}

/** A skill's own attached documents for one repository (Project context to use section). */
export function useSkillContext(skillId: string | undefined, repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["skill-context", skillId, repoId],
    queryFn: () =>
      api.get<ContextAttachment[]>(`/skills/${skillId}/context?repo_id=${repoId}`),
    enabled: !!skillId && !!repoId,
  });
}

/** Fetch several skills' attached documents at once (AC-11's inheritance
    display: an agent's Context tab shows a read-only "from skill X" row for
    every document inherited via an enabled skill). Shares the same query
    key as `useSkillContext`, so a single-skill fetch elsewhere in the app
    hits the same cache entry. */
export function useInheritedSkillContexts(
  repoId: string | null | undefined,
  skillIds: string[],
) {
  return useQueries({
    queries: skillIds.map((skillId) => ({
      queryKey: ["skill-context", skillId, repoId],
      queryFn: () =>
        api.get<ContextAttachment[]>(`/skills/${skillId}/context?repo_id=${repoId}`),
      enabled: !!repoId && !!skillId,
    })),
  });
}

/** Replace a skill's attached documents, same semantics as `useSetAgentContext`. */
export function useSetSkillContext() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      skillId,
      repoId,
      paths,
    }: {
      skillId: string;
      repoId: string;
      paths: string[];
    }) =>
      api.put<ContextAttachment[]>(`/skills/${skillId}/context`, {
        repo_id: repoId,
        paths,
      }),
    onSuccess: (_data, { skillId, repoId }) => {
      qc.invalidateQueries({ queryKey: ["skill-context", skillId, repoId] });
      qc.invalidateQueries({ queryKey: ["context-docs", repoId] });
    },
  });
}
