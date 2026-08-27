/* hooks/diff-target.ts — reads the `?file=` / `?line=` URL parameters into a
   normalized diff target (spec 2026-08-27-pr-why-risk-brief, AC-27/AC-28).

   This hook does NOT navigate — navigation is built by `page.tsx` in a single
   batched `setParams` call (several consecutive single-param writes read a
   stale snapshot and overwrite each other). It only reads. `src/lib/` must not
   import from `src/app/**`, so this stays self-contained. */
"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";

export interface DiffTarget {
  path: string;
  /** `null` when `?line=` is absent or non-numeric — never `NaN`. */
  line: number | null;
}

export function useDiffTarget(): DiffTarget | null {
  const search = useSearchParams();
  const file = search.get("file");
  const lineRaw = search.get("line");
  return useMemo(() => {
    if (!file) return null;
    const n = lineRaw != null && lineRaw !== "" ? Number(lineRaw) : NaN;
    return { path: file, line: Number.isFinite(n) ? n : null };
  }, [file, lineRaw]);
}
