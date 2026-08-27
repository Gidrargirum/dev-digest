import { z } from 'zod';

/**
 * Project Context Folder — repository `.md` documents manually attached to
 * agents/skills and mechanically inserted into the prompt as untrusted data.
 *
 * `SpecFile` (contracts/platform.ts) is a different, pre-existing shape (no
 * source tag, no token estimate, no usage count) — feature agents EXTEND the
 * barrel with new files rather than editing an existing one, so this is a
 * new file, not a widening of `SpecFile`.
 */

// ---- Document catalog (reader) ----

export const ContextDocSource = z.enum(['specs', 'docs', 'insights']);
export type ContextDocSource = z.infer<typeof ContextDocSource>;

export const ContextDoc = z.object({
  /** Repo-relative path — a document's identity, never its file name. */
  path: z.string(),
  name: z.string(),
  source: ContextDocSource,
  size_bytes: z.number().int(),
  /** Deterministic token estimate (Tokenizer port, no LLM call). */
  tokens: z.number().int(),
  /** Agents (within the workspace) that have this doc attached, directly or via an enabled skill. */
  used_by_agents: z.number().int(),
});
export type ContextDoc = z.infer<typeof ContextDoc>;

// ---- Attachment (agent or skill scope) ----

export const ContextAttachment = z.object({
  path: z.string(),
  order: z.number().int(),
  /** True when the document is missing/unreadable at last resolution — stays attached until detached. */
  broken: z.boolean(),
});
export type ContextAttachment = z.infer<typeof ContextAttachment>;

// ---- Set attachments (agent/skill editor) ----

export const SetContextBody = z.object({
  repo_id: z.string().uuid(),
  paths: z.array(z.string()),
});
export type SetContextBody = z.infer<typeof SetContextBody>;

// ---- Authoring: folder tree, create / upload / save, coverage ----

/**
 * A browsable folder branch (AC-27/30). A folder can exist in the tree with no
 * document under it yet (created via the folder-icon action).
 */
export const ContextFolder = z.object({
  /** Repo-relative folder path, forward-slash normalized, no trailing slash. */
  path: z.string(),
});
export type ContextFolder = z.infer<typeof ContextFolder>;

/** Create an empty `.md` document at a chosen path (AC-29). */
export const CreateContextDocBody = z.object({
  path: z.string(),
  /** Seed content; defaults to '' — an empty 0-byte document (AC-29). */
  content: z.string().default(''),
});
export type CreateContextDocBody = z.infer<typeof CreateContextDocBody>;

/**
 * Upload an existing local `.md` file (AC-31/32). The bytes travel as base64
 * in the JSON body — no multipart. Size / UTF-8 / extension are validated
 * server-side against the decoded bytes before anything is stored.
 */
export const UploadContextDocBody = z.object({
  path: z.string(),
  content_base64: z.string(),
});
export type UploadContextDocBody = z.infer<typeof UploadContextDocBody>;

/** Save an edited document's content (AC-34), last-write-wins (AC-35). */
export const SaveContextDocBody = z.object({
  path: z.string(),
  content: z.string(),
});
export type SaveContextDocBody = z.infer<typeof SaveContextDocBody>;

/** Register a new folder (path prefix) in the tree (AC-30). */
export const CreateContextFolderBody = z.object({
  path: z.string(),
});
export type CreateContextFolderBody = z.infer<typeof CreateContextFolderBody>;

/**
 * COVERAGE for one open document (AC-39/40): the share of the workspace's
 * agents that have this exact document attached, directly or inherited via an
 * enabled skill. `percent` is `null` (never `0`) when the workspace has zero
 * agents — the UI shows an explicit "no agents in this workspace" state (AC-40).
 */
export const ContextDocCoverage = z.object({
  attached_agents: z.number().int(),
  total_agents: z.number().int(),
  percent: z.number().nullable(),
});
export type ContextDocCoverage = z.infer<typeof ContextDocCoverage>;
