/** Number of skeleton rows shown while the document catalog loads. */
export const SKELETON_ROWS = 5;

/** Configured Project Context search roots (server: AC-2 default). Used to seed
    the "parent folder" choices in the create dialogs; the server re-validates
    every target path regardless. */
export const CONTEXT_SEARCH_ROOTS = [
  ".devdigest/specs",
  ".devdigest/docs",
  ".devdigest/insights",
];

/** Hard upload ceiling in bytes, mirrored from the server (AC-31). */
export const MAX_UPLOAD_BYTES = 1_048_576;
