import { describe, it, expect, vi } from 'vitest';
import type { ContextDocEntry, ContextDocsReader, Tokenizer } from '../../ports/index.js';
import { ContextService } from './service.js';
import type { ContextRepository } from './repository.js';
import type { OrderedDoc } from './helpers.js';

/**
 * Unit tests for ContextService — Project Context Folder (server-unit lane).
 * Substitutes the reader/repository/tokenizer via constructor injection
 * (ports), never module mocks, per the onion-architecture rule for
 * `service.ts` (application ring: takes ports, never `Container`).
 */

/** Spy reader: records every `read()` call so tests can assert AC-16 —
 * a path outside the catalog is rejected WITHOUT ever reaching `read()`. */
class SpyContextDocsReader implements ContextDocsReader {
  public reads: string[] = [];
  public listCalls: { root: string; searchRoots: string[] }[] = [];
  constructor(
    private entries: ContextDocEntry[] = [],
    private files: Record<string, string> = {},
  ) {}
  async list(root: string, searchRoots: string[]): Promise<ContextDocEntry[]> {
    this.listCalls.push({ root, searchRoots });
    return this.entries;
  }
  async read(_root: string, relPath: string): Promise<string> {
    this.reads.push(relPath);
    const content = this.files[relPath];
    if (content === undefined) throw new Error(`Document not found: ${relPath}`);
    return content;
  }
}

/** Deterministic, LLM-free tokenizer stub — content length stands in for a
 * real token count; the point is that it never calls out anywhere (AC-3). */
const lengthTokenizer: Tokenizer = { count: (text: string) => text.length };

function fakeRepo(overrides: Partial<ContextRepository> = {}): ContextRepository {
  const base = {
    getClonePath: vi.fn(async () => '/clones/acme/widgets'),
    agentAttachments: vi.fn(async (): Promise<OrderedDoc[]> => []),
    skillAttachments: vi.fn(async (): Promise<OrderedDoc[]> => []),
    enabledSkillAttachmentsForAgent: vi.fn(async (): Promise<OrderedDoc[]> => []),
    setAgentAttachments: vi.fn(async () => undefined),
    setSkillAttachments: vi.fn(async () => undefined),
    usageCounts: vi.fn(async () => new Map<string, number>()),
  };
  return { ...base, ...overrides } as unknown as ContextRepository;
}

describe('ContextService — AC-2 (search roots come from configuration)', () => {
  it('passes the constructor-configured search roots to the reader, not the default ones', async () => {
    const reader = new SpyContextDocsReader([]);
    const customRoots = ['.devdigest/custom-specs'];
    const service = new ContextService(fakeRepo(), reader, lengthTokenizer, customRoots);

    await service.catalog('repo-1');

    expect(reader.listCalls).toHaveLength(1);
    expect(reader.listCalls[0]!.searchRoots).toEqual(customRoots);
    expect(reader.listCalls[0]!.searchRoots).not.toEqual([
      '.devdigest/specs',
      '.devdigest/docs',
      '.devdigest/insights',
    ]);
  });
});

describe('ContextService — AC-3 (deterministic token estimate, no LLM)', () => {
  it("computes each document's tokens via the injected Tokenizer only", async () => {
    const entries: ContextDocEntry[] = [
      { path: '.devdigest/specs/a.md', sizeBytes: 5 },
      { path: '.devdigest/specs/bb.md', sizeBytes: 10 },
    ];
    const files = { '.devdigest/specs/a.md': 'hello', '.devdigest/specs/bb.md': 'hello world!' };
    const reader = new SpyContextDocsReader(entries, files);
    const service = new ContextService(fakeRepo(), reader, lengthTokenizer, ['.devdigest/specs']);

    const docs = await service.catalog('repo-1');

    expect(docs).toHaveLength(2);
    expect(docs.find((d) => d.path === '.devdigest/specs/a.md')?.tokens).toBe('hello'.length);
    expect(docs.find((d) => d.path === '.devdigest/specs/bb.md')?.tokens).toBe('hello world!'.length);
  });
});

describe('ContextService.readContent — AC-16 (reject a path outside the fresh catalog, without disk access)', () => {
  const catalogEntries: ContextDocEntry[] = [{ path: '.devdigest/specs/a.md', sizeBytes: 5 }];
  const files = { '.devdigest/specs/a.md': 'hello' };

  it.each([
    ['absolute path', '/etc/passwd'],
    ['path traversal', '.devdigest/specs/../../../etc/passwd'],
    ['non-.md file', '.devdigest/specs/a.txt'],
    ['outside search roots (symlink target style)', '.devdigest/other/a.md'],
  ])('rejects %s without ever calling reader.read()', async (_label, badPath) => {
    const reader = new SpyContextDocsReader(catalogEntries, files);
    const service = new ContextService(fakeRepo(), reader, lengthTokenizer, ['.devdigest/specs']);

    const content = await service.readContent('repo-1', badPath);

    expect(content).toBeUndefined();
    expect(reader.reads).toEqual([]);
  });

  it('reads a path that IS present in the fresh catalog', async () => {
    const reader = new SpyContextDocsReader(catalogEntries, files);
    const service = new ContextService(fakeRepo(), reader, lengthTokenizer, ['.devdigest/specs']);

    const content = await service.readContent('repo-1', '.devdigest/specs/a.md');

    expect(content).toBe('hello');
    expect(reader.reads).toEqual(['.devdigest/specs/a.md']);
  });
});

describe('ContextService.resolveForRun — AC-11 (agent + enabled-skill merge, dedup, agent wins)', () => {
  it('merges agent docs first, then enabled-skill docs, dropping the skill duplicate on collision', async () => {
    const entries: ContextDocEntry[] = [
      { path: 'a.md', sizeBytes: 1 },
      { path: 'shared.md', sizeBytes: 1 },
      { path: 'skill-only.md', sizeBytes: 1 },
    ];
    const files = { 'a.md': 'A', 'shared.md': 'SHARED', 'skill-only.md': 'SKILL' };
    const reader = new SpyContextDocsReader(entries, files);
    const repo = fakeRepo({
      agentAttachments: vi.fn(async (): Promise<OrderedDoc[]> => [
        { path: 'shared.md', order: 1 },
        { path: 'a.md', order: 0 },
      ]),
      enabledSkillAttachmentsForAgent: vi.fn(async (): Promise<OrderedDoc[]> => [
        { path: 'shared.md', order: 0 },
        { path: 'skill-only.md', order: 1 },
      ]),
    });
    const service = new ContextService(repo, reader, lengthTokenizer, ['.devdigest/specs']);

    const { ok, skipped } = await service.resolveForRun('agent-1', 'repo-1');

    expect(skipped).toEqual([]);
    expect(ok.map((d) => d.path)).toEqual(['a.md', 'shared.md', 'skill-only.md']);
    // The agent's own copy of shared.md content is the one actually read, but
    // content is identical either way here — the important assertion is order
    // + no duplicate entry for shared.md.
    expect(ok.filter((d) => d.path === 'shared.md')).toHaveLength(1);
  });
});

describe('ContextService.resolveForRun — AC-16 + AC-21 (skip, never throw)', () => {
  it('skips a path missing from the fresh catalog without reading from disk, and continues', async () => {
    const entries: ContextDocEntry[] = [{ path: 'a.md', sizeBytes: 1 }];
    const files = { 'a.md': 'A' };
    const reader = new SpyContextDocsReader(entries, files);
    const repo = fakeRepo({
      agentAttachments: vi.fn(async (): Promise<OrderedDoc[]> => [
        { path: 'a.md', order: 0 },
        { path: 'gone.md', order: 1 }, // no longer in the catalog
      ]),
    });
    const service = new ContextService(repo, reader, lengthTokenizer, ['.devdigest/specs']);

    const { ok, skipped } = await service.resolveForRun('agent-1', 'repo-1');

    expect(ok.map((d) => d.path)).toEqual(['a.md']);
    expect(skipped).toEqual(['gone.md']);
    expect(reader.reads).toEqual(['a.md']); // never attempted to read the uncataloged path
  });

  it('skips a cataloged-but-unreadable document without throwing', async () => {
    const entries: ContextDocEntry[] = [{ path: 'a.md', sizeBytes: 1 }];
    // No entry in `files` — read() throws, even though it IS in the catalog.
    const reader = new SpyContextDocsReader(entries, {});
    const repo = fakeRepo({
      agentAttachments: vi.fn(async (): Promise<OrderedDoc[]> => [{ path: 'a.md', order: 0 }]),
    });
    const service = new ContextService(repo, reader, lengthTokenizer, ['.devdigest/specs']);

    await expect(service.resolveForRun('agent-1', 'repo-1')).resolves.toEqual({
      ok: [],
      skipped: ['a.md'],
    });
  });

  it('a broken attachment stays in agentAttachments() with `broken: true` (not silently removed)', async () => {
    const entries: ContextDocEntry[] = [{ path: 'a.md', sizeBytes: 1 }];
    const reader = new SpyContextDocsReader(entries, { 'a.md': 'A' });
    const repo = fakeRepo({
      agentAttachments: vi.fn(async (): Promise<OrderedDoc[]> => [
        { path: 'a.md', order: 0 },
        { path: 'renamed-away.md', order: 1 },
      ]),
    });
    const service = new ContextService(repo, reader, lengthTokenizer, ['.devdigest/specs']);

    const attachments = await service.agentAttachments('agent-1', 'repo-1');

    expect(attachments).toEqual([
      { path: 'a.md', order: 0, broken: false },
      { path: 'renamed-away.md', order: 1, broken: true },
    ]);
  });
});
