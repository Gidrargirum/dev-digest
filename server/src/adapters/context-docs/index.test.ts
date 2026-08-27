import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtemp, mkdir, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, sep } from 'node:path';
import { FsContextDocsReader } from './index.js';

/**
 * Unit test for `FsContextDocsReader` against a REAL filesystem (no mocks) —
 * complements `server/src/modules/context/service.test.ts`, which only
 * exercises AC-16 against a mock reader. This file is what actually proves
 * the adapter's own walk/filter/escape-rejection logic works on disk.
 */
describe('FsContextDocsReader', () => {
  let root: string;
  let reader: FsContextDocsReader;

  beforeEach(async () => {
    root = await mkdtemp(join(tmpdir(), 'context-docs-'));
    reader = new FsContextDocsReader();

    // In-bounds structure under the three canonical search roots.
    await mkdir(join(root, '.devdigest/specs/nested'), { recursive: true });
    await mkdir(join(root, '.devdigest/docs'), { recursive: true });
    await mkdir(join(root, '.devdigest/insights'), { recursive: true });
    await writeFile(join(root, '.devdigest/specs/a.md'), 'spec A');
    await writeFile(join(root, '.devdigest/specs/nested/b.md'), 'spec B nested');
    await writeFile(join(root, '.devdigest/docs/c.md'), 'doc C');
    await writeFile(join(root, '.devdigest/insights/d.md'), 'insight D');

    // Non-.md file inside a search root — must be filtered out by list().
    await writeFile(join(root, '.devdigest/specs/notes.txt'), 'not markdown');

    // Out-of-bounds file: above the repo root entirely (reachable only via `..`).
    const outsideDir = join(root, '..', `outside-${Date.now()}`);
    await mkdir(outsideDir, { recursive: true });
    await writeFile(join(outsideDir, 'escaped.md'), 'should never be readable');

    // Symlink inside a search root pointing OUTSIDE the repo root.
    await symlink(outsideDir, join(root, '.devdigest/specs', 'escape-link'));

    // Keep the outside dir path around for cleanup + assertions via closure.
    (reader as unknown as { __outsideDir?: string }).__outsideDir = outsideDir;
  });

  afterEach(async () => {
    const outsideDir = (reader as unknown as { __outsideDir?: string }).__outsideDir;
    await rm(root, { recursive: true, force: true });
    if (outsideDir) await rm(outsideDir, { recursive: true, force: true });
  });

  describe('list()', () => {
    it('walks all search roots, returns only .md files, repo-relative and forward-slash normalized, sorted', async () => {
      const entries = await reader.list(root, [
        '.devdigest/specs',
        '.devdigest/docs',
        '.devdigest/insights',
      ]);

      const paths = entries.map((e) => e.path);
      expect(paths).toEqual([
        '.devdigest/docs/c.md',
        '.devdigest/insights/d.md',
        '.devdigest/specs/a.md',
        '.devdigest/specs/nested/b.md',
      ]);
      // No forward-slash normalization surprises even on this platform's separator.
      expect(paths.some((p) => p.includes(sep) && sep !== '/')).toBe(false);
      // The non-.md file and the escaping symlink never appear.
      expect(paths.some((p) => p.endsWith('notes.txt'))).toBe(false);
      expect(paths.some((p) => p.includes('escape-link'))).toBe(false);
      expect(paths.some((p) => p.includes('escaped.md'))).toBe(false);

      const sizes = new Map(entries.map((e) => [e.path, e.sizeBytes]));
      expect(sizes.get('.devdigest/specs/a.md')).toBe('spec A'.length);
    });

    it('degrades to [] for a missing search root instead of throwing', async () => {
      const entries = await reader.list(root, ['.devdigest/does-not-exist']);
      expect(entries).toEqual([]);
    });

    it('degrades to [] for every search root when the repo root itself does not exist', async () => {
      const missingRoot = join(root, 'no-such-clone');
      const entries = await reader.list(missingRoot, ['.devdigest/specs']);
      expect(entries).toEqual([]);
    });
  });

  describe('read()', () => {
    it('reads a file that is inside the root', async () => {
      const content = await reader.read(root, '.devdigest/specs/a.md');
      expect(content).toBe('spec A');
    });

    it('rejects an absolute path outside the root', async () => {
      const outsideDir = (reader as unknown as { __outsideDir: string }).__outsideDir;
      await expect(reader.read(root, join(outsideDir, 'escaped.md'))).rejects.toThrow();
    });

    it('rejects a relative path that escapes the root via ..', async () => {
      await expect(
        reader.read(root, '.devdigest/specs/../../../etc/passwd'),
      ).rejects.toThrow();
    });

    it('rejects a symlink that resolves outside the root', async () => {
      await expect(
        reader.read(root, '.devdigest/specs/escape-link/escaped.md'),
      ).rejects.toThrow();
    });

    it('rejects a path that does not exist at all', async () => {
      await expect(reader.read(root, '.devdigest/specs/missing.md')).rejects.toThrow(
        'Document not found',
      );
    });
  });
});
