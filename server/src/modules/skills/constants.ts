/**
 * Skills module constants.
 */

/** Version stamped on a skill's first `skill_versions` snapshot, on insert. */
export const INITIAL_SKILL_VERSION = 1;

/** Cap on the decompressed body size accepted from an imported file/archive. */
export const MAX_IMPORT_BYTES = 262_144; // 256 KB
