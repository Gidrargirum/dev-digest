/**
 * Project Context Folder — filesystem reader/writer for the repository's own
 * documentation directories (`config.contextSearchRoots`, default
 * `docs` / `specs` / `insights`; amended 2026-08-27) — every `**\/*.md` under
 * them.
 *
 * `list()` never throws (AC-5/US-6: a broken/missing clone degrades to an
 * empty catalog, never a 500). `read()` DOES throw on anything outside the
 * repo's clone root — path traversal, an escaping symlink, a missing file —
 * because the caller (service) uses that to distinguish "verified but
 * unreadable at run time" (AC-21: skip + mark broken) from a genuine bug.
 *
 * `write()` / `ensureDir()` rewrite the DERIVED on-disk projection from
 * Postgres (AC-25). They apply the SAME root-containment check as `read()`
 * (shared `resolveInside`) before touching disk — the write side may not
 * weaken the read side's AC-16 guarantee (AC-37). Postgres stays the source
 * of truth; a write failure here is best-effort degradation, never data loss.
 *
 * Deliberately NOT built on `modules/repo-intel/pipeline/walk.ts` — that
 * walker is infrastructure importing from a module's private pipeline;
 * `infra-does-not-import-modules` forbids an adapter reaching into
 * `modules/**`, so this is its own small walk over a much smaller tree.
 */
import { lstat, mkdir, readdir, readFile, realpath, stat, writeFile } from 'node:fs/promises';
import type { Dirent } from 'node:fs';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import type {
  ContextDocEntry,
  ContextDocsReader,
  ContextDocsWriter,
} from '../../ports/index.js';

export class FsContextDocsReader implements ContextDocsReader, ContextDocsWriter {
  async list(root: string, searchRoots: string[]): Promise<ContextDocEntry[]> {
    const out: ContextDocEntry[] = [];
    for (const searchRoot of searchRoots) {
      const abs = join(root, searchRoot);
      try {
        await walk(root, abs, out);
      } catch {
        // Missing/unreadable search root (repo not cloned, folder absent) —
        // degrade to "no documents here", never fail the whole catalog.
      }
    }
    out.sort((a, b) => a.path.localeCompare(b.path));
    return out;
  }

  async read(root: string, relPath: string): Promise<string> {
    const resolved = await this.resolveInside(root, relPath, { mustExist: true });
    return readFile(resolved, 'utf8');
  }

  async write(root: string, relPath: string, content: string): Promise<void> {
    const resolved = await this.resolveInside(root, relPath, { mustExist: false });
    await mkdir(dirname(resolved), { recursive: true });
    await writeFile(resolved, content, 'utf8');
  }

  async ensureDir(root: string, relDir: string): Promise<void> {
    const resolved = await this.resolveInside(root, relDir, { mustExist: false });
    await mkdir(resolved, { recursive: true });
  }

  /**
   * Resolve `relPath` under `root` and prove it stays inside — the one check
   * shared by every read and write path. Rejects absolute paths and `..`
   * segments lexically, then rejects a resolved path (or, when the target
   * does not exist yet, its nearest existing ancestor) that a symlink would
   * carry outside `realpath(root)`.
   */
  private async resolveInside(
    root: string,
    relPath: string,
    opts: { mustExist: boolean },
  ): Promise<string> {
    if (isAbsolute(relPath) || relPath.split(/[\\/]/).some((seg) => seg === '..')) {
      throw new Error(`Document path escapes repo root: ${relPath}`);
    }
    // Resolve the candidate against the CANONICAL root, not the raw `root` —
    // when `root` itself contains a symlink (macOS `/var`→`/private/var`, a
    // symlinked clone dir), `resolve(root, …)` and `realpath(root)` live in
    // different path spaces and every in-bounds path fails the check below.
    const rootReal = await realpath(root);
    const candidate = resolve(rootReal, relPath);
    if (candidate !== rootReal && !candidate.startsWith(rootReal + sep)) {
      throw new Error(`Document path escapes repo root: ${relPath}`);
    }

    // Walk outward to the nearest path that actually exists and realpath THAT —
    // catches a symlinked directory anywhere along the chain.
    let existing = candidate;
    let realExisting: string | undefined;
    while (true) {
      try {
        realExisting = await realpath(existing);
        break;
      } catch {
        const parent = dirname(existing);
        if (parent === existing) break;
        existing = parent;
      }
    }
    if (realExisting !== undefined) {
      if (realExisting !== rootReal && !realExisting.startsWith(rootReal + sep)) {
        throw new Error(`Document path escapes repo root: ${relPath}`);
      }
      if (opts.mustExist && realExisting !== candidate) {
        throw new Error(`Document not found: ${relPath}`);
      }
    } else if (opts.mustExist) {
      throw new Error(`Document not found: ${relPath}`);
    }

    // The final segment itself must not be a symlink (would let a later write
    // follow it out of the tree).
    try {
      const st = await lstat(candidate);
      if (st.isSymbolicLink()) {
        throw new Error(`Document path is a symlink: ${relPath}`);
      }
    } catch (err) {
      if (err instanceof Error && err.message.startsWith('Document path is a symlink')) throw err;
      // ENOENT on a not-yet-created file is fine for a write.
    }

    return candidate;
  }
}

async function walk(root: string, dir: string, out: ContextDocEntry[]): Promise<void> {
  let entries: Dirent[];
  try {
    entries = (await readdir(dir, { withFileTypes: true })) as Dirent[];
  } catch {
    return;
  }

  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue; // never follow symlinks out of the tree
    const full = join(dir, entry.name);

    if (entry.isDirectory()) {
      await walk(root, full, out);
      continue;
    }

    if (!entry.isFile()) continue;
    if (extname(entry.name).toLowerCase() !== '.md') continue;

    let sizeBytes: number;
    try {
      sizeBytes = (await stat(full)).size;
    } catch {
      continue;
    }

    const path = relative(root, full).split(sep).join('/');
    out.push({ path, sizeBytes });
  }
}
