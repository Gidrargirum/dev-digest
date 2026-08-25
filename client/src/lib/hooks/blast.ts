/* hooks/blast.ts — React Query hook for the Blast Radius tab.
   GET /pulls/:id/blast → PrBlastResponse (repo-intel derived, no model call). */
"use client";

import { useQuery } from "@tanstack/react-query";
import { api } from "../api";
// Type-only import: the client bundles no runtime Zod from @devdigest/shared —
// the server is the only party that parses/validates this contract.
import type { PrBlastResponse } from "@devdigest/shared";

/** Blast radius for a PR's diff — changed symbols, callers, and affected
    endpoints/crons up to two hops out. `status` distinguishes a genuinely
    empty result (`ok`/`partial`) from "no usable index" (`degraded`, where
    `blast` is `null`). */
export function usePrBlast(prId: string | null | undefined) {
  return useQuery({
    queryKey: ["pr-blast", prId],
    queryFn: () => api.get<PrBlastResponse>(`/pulls/${prId}/blast`),
    enabled: !!prId,
  });
}
