/* hooks/brief.ts — React Query hooks for the PR Why + Risk Brief
   (spec 2026-08-27-pr-why-risk-brief).
     GET  /pulls/:id/brief            → PrWhyRiskBriefResponse
     POST /pulls/:id/brief/regenerate → PrWhyRiskBriefRegenerateResponse */
"use client";

import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "../api";
// Type-only import: the client bundles no runtime Zod from @devdigest/shared —
// the server is the only party that parses/validates this contract, and a
// runtime import here breaks the webpack bundle.
import type {
  PrWhyRiskBriefResponse,
  PrWhyRiskBriefRegenerateResponse,
} from "@devdigest/shared";

/** Background poll interval for the brief (AC-37). Deliberate: no SSE, no
 *  runBus — the card compares the polled `pr_state_key`/`computed_at` against
 *  what is on screen and offers an explicit refresh rather than swapping. */
export const BRIEF_POLL_MS = 18_000;

/** The cached, model-authored Why + Risk Brief for a PR. `brief` is `null`
 *  when none has been computed yet OR the PR is in another workspace
 *  (AC-20 + AC-22 — deliberately indistinguishable). A read never triggers a
 *  computation server-side. */
export function usePrWhyRiskBrief(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-why-risk-brief", prId],
    queryFn: () => api.get<PrWhyRiskBriefResponse>(`/pulls/${prId}/brief`),
    enabled: !!prId,
    refetchInterval: BRIEF_POLL_MS,
  });
}

/** Force a brief recompute (AC-21). Does NOT invalidate the brief query on
 *  success — that would swap the content under the reader, contradicting
 *  AC-37; the card turns `{ status }` into an "update started" affordance and
 *  lets the background poll surface the new brief. A 429 surfaces as an
 *  `ApiError` carrying `status` and `retryAfter` (AC-39). */
export function useRegeneratePrBrief(prId: string | null | undefined) {
  return useMutation({
    mutationFn: () =>
      api.post<PrWhyRiskBriefRegenerateResponse>(`/pulls/${prId}/brief/regenerate`),
  });
}
