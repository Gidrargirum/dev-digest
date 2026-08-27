/** Shown under the counts row when `status === "partial"` — the reason string
 *  from the API names WHAT was capped, this note explains what that MEANS for
 *  the data on screen. */
export const PARTIAL_NOTE_PREFIX = "Partial results:";

/** Tree = the existing expandable caller list. Graph = a Mermaid flowchart of
 *  symbol → caller file → endpoint/cron. Local `useState` on the card, not the
 *  URL — this is a view preference for one card, not page-level navigation. */
export type BlastView = "tree" | "graph";

/** Hard cap on nodes rendered in the Graph view. `buildBlastChart` (helpers.ts)
 *  truncates to this count, prioritizing symbols, then files, then endpoints,
 *  then crons — a hub file can fan out to hundreds of callers, and both Mermaid
 *  and the reader stop being useful well before that. */
export const GRAPH_MAX_NODES = 40;
