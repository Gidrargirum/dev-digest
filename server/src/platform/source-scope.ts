/**
 * What the code scanners understand.
 *
 * These are shared by `modules/repo-intel` (walk, incremental diff filter) and
 * by the two adapters that parse source on its behalf (`adapters/astgrep`,
 * `adapters/depgraph`). They lived in `modules/repo-intel/constants.ts`, which
 * made both adapters import upward into a module — infrastructure depending on
 * the application ring, the one direction the Onion forbids outright.
 *
 * Modules are siblings, not a hierarchy: what two rings share belongs to
 * neither, so it sits in platform. `repo-intel/constants.ts` re-exports both
 * names, so nothing inside the module had to change.
 */

/** Files the parsers accept. Anything else is walked past, not read. */
export const SUPPORTED_EXT = ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'] as const;

/** Signatures are trimmed to this many chars in the parse phase (cache stability). */
export const MAX_SIGNATURE_CHARS = 120;
