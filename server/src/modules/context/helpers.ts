import { extname, isAbsolute } from 'node:path';
import type { ContextDocSource } from '@devdigest/shared';

/**
 * Pure helpers for the Project Context Folder module. No I/O.
 */

/** Hard ceiling on an uploaded document, in decoded bytes (AC-31). */
export const MAX_UPLOAD_BYTES = 1_048_576;

export type PathCheck =
  | { ok: true; path: string }
  | { ok: false; reason: string };

/**
 * Validate a client-supplied target path for create/upload/edit BEFORE any
 * filesystem or database write (AC-37) — the write-side mirror of the read-side
 * AC-16 rule. Rejects: empty, absolute (`/`, `C:\`, UNC), any `.`/`..` segment,
 * backslash separators, a NUL byte, and any path not strictly inside one of the
 * configured `searchRoots`. For create/upload (`requireMd`) the path must end
 * in `.md` (lowercase compare). Symlink rejection is I/O and is NOT done here —
 * `FsContextDocsReader.resolveInside` catches an escaping symlink at write time.
 * On success the returned `path` is forward-slash normalized.
 */
export function validateContextPath(
  path: string,
  searchRoots: string[],
  opts: { requireMd: boolean },
): PathCheck {
  if (typeof path !== 'string' || path.trim() === '') {
    return { ok: false, reason: 'Path is required' };
  }
  if (path.includes('\0')) return { ok: false, reason: 'Path contains a NUL byte' };
  if (path.includes('\\')) return { ok: false, reason: 'Path must use forward slashes' };
  if (isAbsolute(path) || /^[a-zA-Z]:/.test(path)) {
    return { ok: false, reason: 'Path must be repo-relative, not absolute' };
  }

  const normalized = path.replace(/\/+/g, '/').replace(/^\/|\/$/g, '');
  const segments = normalized.split('/');
  if (segments.some((seg) => seg === '' || seg === '.' || seg === '..')) {
    return { ok: false, reason: 'Path may not contain "." or ".." segments' };
  }

  const insideRoot = searchRoots.some((root) => {
    const r = root.replace(/^\/|\/$/g, '');
    return normalized === r || normalized.startsWith(r + '/');
  });
  if (!insideRoot) {
    return { ok: false, reason: 'Path must be under one of the context search roots' };
  }
  if (searchRoots.some((root) => normalized === root.replace(/^\/|\/$/g, ''))) {
    return { ok: false, reason: 'Path may not be a search root itself' };
  }

  if (opts.requireMd && extname(normalized).toLowerCase() !== '.md') {
    return { ok: false, reason: 'File name must end in .md' };
  }

  return { ok: true, path: normalized };
}

export type UploadCheck =
  | { ok: true; content: string }
  | { ok: false; reason: string };

/**
 * Validate uploaded bytes (AC-31): base64 must decode, the decoded size must be
 * ≤ 1 MiB, the bytes must be valid UTF-8, and `fileName` must end in `.md`. On
 * any failure there is no partial result — the caller stores nothing.
 */
export function validateUploadBytes(base64: string, fileName: string): UploadCheck {
  if (extname(fileName).toLowerCase() !== '.md') {
    return { ok: false, reason: 'File name must end in .md' };
  }
  // `Buffer.from(x, 'base64')` is lenient: it skips invalid characters and
  // tolerates missing padding, so a corrupt payload decodes to a SILENTLY
  // TRUNCATED buffer rather than an error. Reject anything that is not
  // canonical, unpadded-or-padded base64, then confirm the decode round-trips
  // — AC-31 requires a hard reject, never a partial result.
  if (!/^[A-Za-z0-9+/]*={0,2}$/.test(base64) || base64.length % 4 !== 0) {
    return { ok: false, reason: 'Content is not valid base64' };
  }
  let buf: Buffer;
  try {
    buf = Buffer.from(base64, 'base64');
  } catch {
    return { ok: false, reason: 'Content is not valid base64' };
  }
  if (buf.toString('base64') !== base64) {
    return { ok: false, reason: 'Content is not valid base64' };
  }
  if (buf.byteLength > MAX_UPLOAD_BYTES) {
    return { ok: false, reason: `File exceeds the ${MAX_UPLOAD_BYTES}-byte limit` };
  }
  let content: string;
  try {
    content = new TextDecoder('utf-8', { fatal: true }).decode(buf);
  } catch {
    return { ok: false, reason: 'File is not valid UTF-8 text' };
  }
  return { ok: true, content };
}

/** A stored (path, order) pair — the only thing an attachment persists (AC-8). */
export interface OrderedDoc {
  path: string;
  order: number;
}

/**
 * Derive a document's source tag from its repo-relative path
 * (`.devdigest/specs/… → 'specs'`). Falls back to `'insights'` for anything
 * under a search root that isn't `specs`/`docs` — the catalog only ever
 * contains paths returned by the reader's configured search roots, so this
 * is a closed set in practice.
 */
export function sourceTagFor(path: string): ContextDocSource {
  if (path.startsWith('.devdigest/specs/')) return 'specs';
  if (path.startsWith('.devdigest/docs/')) return 'docs';
  return 'insights';
}

/**
 * Merge an agent's own attached documents with its enabled skills' attached
 * documents (AC-11): the agent's own documents come first, in their
 * configured order; then the enabled skills' documents, in the order the
 * skills are attached and then each skill's own order (`skillDocs` is
 * expected pre-sorted that way by the repository query). Deduplicated by
 * repo-relative path — on a collision the agent's position wins, so the
 * inherited duplicate from the skill is dropped.
 */
export function mergeAttachments(agentDocs: OrderedDoc[], skillDocs: OrderedDoc[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const doc of [...agentDocs].sort((a, b) => a.order - b.order)) {
    if (seen.has(doc.path)) continue;
    seen.add(doc.path);
    out.push(doc.path);
  }
  for (const doc of skillDocs) {
    if (seen.has(doc.path)) continue;
    seen.add(doc.path);
    out.push(doc.path);
  }
  return out;
}

/** `trace.specs_read` line format for a successfully-read document (AC-18). */
export function formatSpecsReadEntry(path: string, tokens: number): string {
  return `${path} · ≈${tokens} tokens`;
}

/** `trace.specs_read` line format for a document skipped at run time (AC-21). */
export function formatSpecsSkippedEntry(path: string): string {
  return `${path} · skipped (unreadable)`;
}
