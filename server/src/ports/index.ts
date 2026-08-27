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

/** One `.md` document found under a project-context search root. */
export interface ContextDocEntry {
  /** Repo-relative path, forward-slash normalized. */
  path: string;
  sizeBytes: number;
}

/**
 * Project Context Folder — reads `.md` documents from a repo clone's own
 * `.devdigest/{specs,docs,insights}/` folders (never the repo's own top-level
 * specs/docs/insights). The client has no notion of a search root or a file
 * walk, so this stays out of vendor/shared.
 */
export interface ContextDocsReader {
  /**
   * Recursively list `.md` files under `searchRoots` (each repo-relative,
   * e.g. `docs`, `specs`) inside `root` (the repo's clone path). Never
   * throws — any filesystem error degrades to `[]`.
   */
  list(root: string, searchRoots: string[]): Promise<ContextDocEntry[]>;
  /**
   * Read a document's content. `relPath` MUST already be a path the caller
   * verified against a catalog built by `list()` in this same run — this
   * method itself re-verifies the resolved path stays under `root` (symlink
   * / `..` / absolute-path escape) and throws otherwise.
   */
  read(root: string, relPath: string): Promise<string>;
}

/**
 * Project Context Folder — write side (AC-24/25). The derived on-disk
 * projection under `<root>/.devdigest/**` is rewritten from Postgres through
 * this port; Postgres stays the source of truth, this is best-effort output.
 *
 * `relPath` MUST already be validated by the caller (no absolute, no `..`,
 * inside a search root, `.md` for a doc) — but every method here re-resolves
 * the path and throws if it escapes `root` (symlink / `..` / absolute), the
 * same defense `ContextDocsReader.read` applies on the read side.
 *
 * `FsContextDocsReader` implements this interface too — one class, one shared
 * root-containment check for reads and writes.
 */
export interface ContextDocsWriter {
  /** Write `content` (utf8) to `<root>/<relPath>`, creating parent dirs. */
  write(root: string, relPath: string, content: string): Promise<void>;
  /** Ensure `<root>/<relDir>` exists (mkdir -p). */
  ensureDir(root: string, relDir: string): Promise<void>;
}
