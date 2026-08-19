/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/** Smart Diff's "LARGE" badge threshold (additions+deletions), a product
 *  decision, not a technical one — see plans/smart-diff.md. Only rendered
 *  when `DiffAnnotationApi` is present (Smart Diff mode); the caller wires
 *  this constant into `annotations.largeFileLines` rather than FileCard
 *  reading it directly, keeping normal-mode rendering unaware Smart Diff
 *  exists at all. */
export const LARGE_FILE_LINES = 300;
