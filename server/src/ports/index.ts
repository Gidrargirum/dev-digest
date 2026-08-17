/**
 * Server-only ports.
 *
 * `vendor/shared/adapters.ts` holds the ports that BOTH sides of the system
 * agree on — it is vendored into the client, so anything added there lands in
 * the browser's type surface. These do not belong there: the client has no
 * notion of a token budget or an import graph, and both exist purely so
 * `modules/repo-intel` can state what it needs without naming an implementation.
 *
 * Same rule as vendor/shared all the same: an interface here may not import
 * from `modules/`, `adapters/`, `db/` or `platform/`. The implementations live
 * in `adapters/**`; the container is the only place the two meet.
 */

/** Token counter for the repo-map budget search. */
export interface Tokenizer {
  count(text: string): number;
}

/** One local import edge: `from` imports `to`. Both repo-relative. */
export interface FileEdge {
  from: string;
  to: string;
}

/** File-level import graph over an indexed repo. */
export interface DepGraph {
  /**
   * Resolve the local import edges among `files` (repo-relative) under `root`.
   * Never throws — returns `[]` on any failure, so a broken tsconfig degrades
   * the index rather than failing it.
   */
  buildEdges(root: string, files: string[]): Promise<FileEdge[]>;
}
