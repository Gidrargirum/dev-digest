"use client";

import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { readDiffMode } from "../_components/DiffTab/helpers";

const KNOWN_TABS = ["overview", "findings", "diff"];

export function usePrDetailController(prId: string | null) {
  const { repoId, number } = useParams<{ repoId: string; number: string }>();
  const search = useSearchParams();
  const router = useRouter();
  const queryClient = useQueryClient();

  const requestedTab = search.get("tab") ?? "overview";
  const tab = KNOWN_TABS.includes(requestedTab) ? requestedTab : "overview";
  const targetLineParam = search.get("line");

  const setParams = (entries: Array<[string, string | null]>) => {
    const params = new URLSearchParams(search.toString());
    for (const [key, value] of entries) {
      if (value == null) params.delete(key);
      else params.set(key, value);
    }
    const suffix = params.toString();
    router.replace(`/repos/${repoId}/pulls/${number}${suffix ? `?${suffix}` : ""}`);
  };

  const setParam = (key: string, value: string | null) => setParams([[key, value]]);
  const setTab = (value: string) => setParam("tab", value);
  const invalidate = (key: string) => {
    if (prId) queryClient.invalidateQueries({ queryKey: [key, prId] });
  };

  return {
    repoId,
    number,
    tab,
    traceRunId: search.get("trace"),
    targetFindingId: search.get("finding"),
    targetFile: search.get("file"),
    targetLine:
      targetLineParam != null && /^\d+$/.test(targetLineParam)
        ? Number(targetLineParam)
        : null,
    diffMode: readDiffMode(search.get("diffMode")),
    setParams,
    setParam,
    setTab,
    invalidateActiveRuns: () => invalidate("pr-active-runs"),
    invalidateRunHistory: () => invalidate("pr-runs"),
    invalidateIntent: () => invalidate("pr-intent"),
    invalidateBrief: () => invalidate("pr-brief"),
  };
}
