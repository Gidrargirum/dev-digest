/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   optional Smart Diff finding annotations. Public surface: the DiffViewer
   component + the DiffCommentApi / DiffAnnotationApi contracts. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffAnnotationApi, DiffFindingMark } from "./annotations";
export type { DiffTargetApi, TargetState } from "./targeting";
export { resolveTarget } from "./targeting";
export { LARGE_FILE_LINES } from "./constants";
