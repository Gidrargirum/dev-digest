import type { PrFile } from "@devdigest/shared";
import { SMART_MODE_VALUE, type DiffMode } from "./constants";

/** Reads the `?diffMode=` query value into a `DiffMode`. Anything other than
 *  the literal `"smart"` — missing, empty, or a stray/legacy value — falls
 *  back to `"normal"`, so the tab defaults to Normal (see ./constants). */
export function readDiffMode(value: string | null | undefined): DiffMode {
  return value === SMART_MODE_VALUE ? "smart" : "normal";
}

/** Total additions/deletions across every file in the diff — used by the
 *  Smart Diff top summary line (requirement 2: affected-files count +
 *  aggregate +/-). */
export function sumChangedLines(files: PrFile[]): { additions: number; deletions: number } {
  return files.reduce(
    (acc, f) => ({
      additions: acc.additions + (f.additions ?? 0),
      deletions: acc.deletions + (f.deletions ?? 0),
    }),
    { additions: 0, deletions: 0 },
  );
}
