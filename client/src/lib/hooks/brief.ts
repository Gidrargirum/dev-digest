/* hooks/brief.ts — the PR Brief (POST /pulls/:id/brief).

   POST, not GET: a body-less request only reads the cache keyed by the PR's
   current head_sha. It returns the cached Brief (or
   `{ brief: null }` when no valid cache exists — AC-11). `{ force: true }`
   forces a fresh model call. A 404 (unknown/foreign pr_id) is normalized into
   an `ApiError` by lib/api.ts — the UI treats it as the same error state as
   any other failure (AC-30), no dedicated branch. */
"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "../api";
// Type-only: the client bundles no runtime Zod from @devdigest/shared — the
// server is the only party that parses/validates this contract.
import type { PrBriefResponse } from "@devdigest/shared";

/** The cached PR Brief for a PR's current head_sha; `data.brief` is `null`
    when nothing valid is cached yet (AC-11). */
export function usePrBrief(
  prId: string | null | undefined,
  headSha?: string | null,
) {
  return useQuery({
    // Include the server-side cache key so a newly observed commit never
    // reuses the previous head's client cache while the fresh read is pending.
    queryKey: ["pr-brief", prId, headSha ?? null],
    // Body-less POST — apiFetch adds `content-type` only when a body exists,
    // so nothing to set by hand here (see client/AGENTS.md gotchas).
    queryFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
  });
}

/** Force a fresh Brief regeneration (`{ force: true }`), then refresh the
    cached query so the card re-renders with the new content. */
export function useRegenerateBrief(prId: string | null | undefined) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<PrBriefResponse>(`/pulls/${prId}/brief`, { force: true }),
    // Prefix invalidation refreshes whichever head_sha key is currently mounted.
    onSuccess: () => qc.invalidateQueries({ queryKey: ["pr-brief", prId] }),
  });
}
