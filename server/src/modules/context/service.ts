import { basename, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import type {
  ContextAttachment,
  ContextDoc,
  ContextDocCoverage,
  ContextFolder,
} from '@devdigest/shared';
import type { ContextDocsReader, ContextDocsWriter, Tokenizer } from '../../ports/index.js';
import { BadRequestError, ConflictError, NotFoundError } from '../../platform/errors.js';
import { ContextRepository } from './repository.js';
import {
  mergeAttachments,
  sourceTagFor,
  validateContextPath,
  validateUploadBytes,
} from './helpers.js';
import { DEFAULT_CONTEXT_SEARCH_ROOTS } from './constants.js';

const sha256 = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');

/** One document successfully resolved (read + counted) for a run. */
export interface ResolvedContextDoc {
  path: string;
  content: string;
  tokens: number;
}

/** Outcome of resolving an agent's project context for one run (AC-11/16/21). */
export interface ResolvedContext {
  ok: ResolvedContextDoc[];
  /** Paths that were attached but not present in the catalog / unreadable at run time. */
  skipped: string[];
}

/**
 * Project Context Folder — application service. Takes ports (a repository +
 * a reader + a tokenizer), never the `Container` — the container constructs
 * this service, so accepting `Container` would cycle (same reasoning as
 * `RepoIntelService`/`RepoIntelDeps`).
 *
 * Ring placement: catalog scanning and file reads are infrastructure (the
 * reader adapter); merging agent+skill attachments and resolving them to
 * strings is this service's job; inserting into the prompt is reviewer-core's.
 */
export class ContextService {
  constructor(
    private repo: ContextRepository,
    private reader: ContextDocsReader,
    private tokenizer: Tokenizer,
    private searchRoots: string[] = DEFAULT_CONTEXT_SEARCH_ROOTS,
    /**
     * Write side (AC-24/25). Optional only so the base spec's unit tests, which
     * predate the authoring spec, keep constructing the service with four args;
     * the container always injects it. Authoring methods require it.
     */
    private writer?: ContextDocsWriter,
  ) {}

  /**
   * Rewrite any drifted on-disk projection from the database (AC-25) BEFORE a
   * catalog scan or run resolution reads it. Postgres is the source of truth;
   * a file whose sha differs from the stored `contentSha` (or is missing) is
   * stale and gets overwritten. Best-effort: one file's write failure is
   * logged-by-omission, never fatal — the DB copy is still authoritative.
   */
  private async materialize(clonePath: string, repoId: string): Promise<void> {
    const writer = this.writer;
    if (!writer) return;
    let nodes;
    try {
      nodes = await this.repo.listNodes(repoId);
    } catch {
      return;
    }
    for (const node of nodes) {
      if (node.kind !== 'doc') continue;
      try {
        let onDisk: string | undefined;
        try {
          onDisk = await this.reader.read(clonePath, node.path);
        } catch {
          onDisk = undefined;
        }
        if (onDisk !== undefined && sha256(onDisk) === node.contentSha) continue;
        await writer.write(clonePath, node.path, node.content);
      } catch {
        // Single-file drift repair failed — the DB row is still the truth.
      }
    }
  }

  /**
   * The repository's full document catalog (AC-1/2/3), with each document's
   * "used by N agents" badge (AC-23). Empty when the repo has no clone path
   * yet (AC-5 — the client renders the empty-state reason).
   */
  async catalog(repoId: string): Promise<ContextDoc[]> {
    const clonePath = await this.repo.getClonePath(repoId);
    if (!clonePath) return [];
    await this.materialize(clonePath, repoId);

    const [entries, usage] = await Promise.all([
      this.reader.list(clonePath, this.searchRoots),
      this.repo.usageCounts(repoId),
    ]);

    const docs: ContextDoc[] = [];
    for (const entry of entries) {
      let tokens = 0;
      try {
        const content = await this.reader.read(clonePath, entry.path);
        tokens = this.tokenizer.count(content);
      } catch {
        // Listed but unreadable between list() and read() (rare TOCTOU) — a
        // 0-token catalog entry is still useful, not a reason to drop the row.
      }
      docs.push({
        path: entry.path,
        name: basename(entry.path),
        source: sourceTagFor(entry.path),
        size_bytes: entry.sizeBytes,
        tokens,
        used_by_agents: usage.get(entry.path) ?? 0,
      });
    }
    return docs;
  }

  /** A single document's content for Preview mode (AC-4), verified against the live catalog (AC-16). */
  async readContent(repoId: string, path: string): Promise<string | undefined> {
    const clonePath = await this.repo.getClonePath(repoId);
    if (!clonePath) return undefined;
    await this.materialize(clonePath, repoId);
    const entries = await this.reader.list(clonePath, this.searchRoots);
    if (!entries.some((e) => e.path === path)) return undefined;
    try {
      return await this.reader.read(clonePath, path);
    } catch {
      return undefined;
    }
  }

  /** An agent's own attached documents (Context tab), each flagged `broken` against the live catalog. */
  async agentAttachments(agentId: string, repoId: string): Promise<ContextAttachment[]> {
    const [docs, catalogPaths] = await Promise.all([
      this.repo.agentAttachments(agentId, repoId),
      this.catalogPaths(repoId),
    ]);
    return docs.map((d) => ({ path: d.path, order: d.order, broken: !catalogPaths.has(d.path) }));
  }

  /** A skill's own attached documents (Project context to use section), same `broken` semantics. */
  async skillAttachments(skillId: string, repoId: string): Promise<ContextAttachment[]> {
    const [docs, catalogPaths] = await Promise.all([
      this.repo.skillAttachments(skillId, repoId),
      this.catalogPaths(repoId),
    ]);
    return docs.map((d) => ({ path: d.path, order: d.order, broken: !catalogPaths.has(d.path) }));
  }

  /** Replace an agent's attached documents (order = position in `paths`), last save wins (AC-9). */
  async setAgentAttachments(
    agentId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextAttachment[]> {
    await this.repo.setAgentAttachments(agentId, repoId, paths);
    return this.agentAttachments(agentId, repoId);
  }

  /** Replace a skill's attached documents, same semantics as `setAgentAttachments`. */
  async setSkillAttachments(
    skillId: string,
    repoId: string,
    paths: string[],
  ): Promise<ContextAttachment[]> {
    await this.repo.setSkillAttachments(skillId, repoId, paths);
    return this.skillAttachments(skillId, repoId);
  }

  /**
   * Resolve an agent's project context for a run (AC-11): merge the agent's
   * own documents with its enabled skills' documents (dedup, agent wins),
   * verify each merged path against the catalog built by the reader THIS
   * run (AC-16 — never read a path the run-time catalog doesn't contain),
   * and read + count tokens for every survivor. A path that fails either
   * check is reported in `skipped`, never thrown (AC-21 — the run continues).
   */
  async resolveForRun(agentId: string, repoId: string): Promise<ResolvedContext> {
    const clonePath = await this.repo.getClonePath(repoId);
    if (!clonePath) return { ok: [], skipped: [] };
    await this.materialize(clonePath, repoId);

    const [entries, agentDocs, skillDocs] = await Promise.all([
      this.reader.list(clonePath, this.searchRoots),
      this.repo.agentAttachments(agentId, repoId),
      this.repo.enabledSkillAttachmentsForAgent(agentId, repoId),
    ]);
    const catalogPaths = new Set(entries.map((e) => e.path));
    const mergedPaths = mergeAttachments(agentDocs, skillDocs);

    const ok: ResolvedContextDoc[] = [];
    const skipped: string[] = [];
    for (const path of mergedPaths) {
      if (!catalogPaths.has(path)) {
        skipped.push(path);
        continue;
      }
      try {
        const content = await this.reader.read(clonePath, path);
        ok.push({ path, content, tokens: this.tokenizer.count(content) });
      } catch {
        skipped.push(path);
      }
    }
    return { ok, skipped };
  }

  // ----------------------------------------------------------- Authoring

  /**
   * Create a new `.md` document (AC-29). Rejects, in order: an invalid/escaping
   * path (AC-37), a repo with no clone yet (explicit reason — user decision #1),
   * a path already taken by a doc OR a folder (AC-38), and a file that already
   * exists on disk. On success it upserts an (empty by default) doc and writes
   * the derived projection.
   */
  async createDoc(repoId: string, rawPath: string, content = ''): Promise<ContextDoc> {
    const path = this.assertPath(rawPath, { requireMd: true });
    const clonePath = await this.requireClonePath(repoId);

    if (await this.repo.getNode(repoId, path)) {
      throw new ConflictError('A document or folder already exists at the target path');
    }
    let onDisk = false;
    try {
      await this.reader.read(clonePath, path);
      onDisk = true;
    } catch {
      onDisk = false;
    }
    if (onDisk) throw new ConflictError('A file already exists at the target path');

    await this.repo.upsertDoc(repoId, path, content, sha256(content));
    await this.safeWrite(clonePath, path, content);
    return this.toContextDoc(repoId, path, content);
  }

  /** Upload an existing local `.md` file (AC-31/32) — validate bytes, then create. */
  async uploadDoc(repoId: string, rawPath: string, base64: string): Promise<ContextDoc> {
    const path = this.assertPath(rawPath, { requireMd: true });
    const check = validateUploadBytes(base64, path);
    if (!check.ok) throw new BadRequestError(check.reason);
    return this.createDoc(repoId, path, check.content);
  }

  /** Register a new folder branch (AC-30). Collides with a doc node → 409 (AC-38). */
  async createFolder(repoId: string, rawPath: string): Promise<ContextFolder> {
    const path = this.assertPath(rawPath, { requireMd: false });
    const existing = await this.repo.getNode(repoId, path);
    if (existing?.kind === 'doc') {
      throw new ConflictError('A document already exists at the target path');
    }
    await this.repo.insertFolder(repoId, path);
    const clonePath = await this.repo.getClonePath(repoId);
    if (clonePath) await this.safeEnsureDir(clonePath, path);
    return { path };
  }

  /**
   * Save an edited document (AC-34/35): last-write-wins, no precondition. Upserts
   * the new content, rewrites the projection, and returns the document with a
   * recomputed token estimate — available immediately, no review run needed.
   */
  async saveDoc(repoId: string, rawPath: string, content: string): Promise<ContextDoc> {
    const path = this.assertPath(rawPath, { requireMd: true });
    const existing = await this.repo.getNode(repoId, path);
    if (existing?.kind === 'folder') {
      throw new ConflictError('A folder exists at the target path');
    }
    await this.repo.upsertDoc(repoId, path, content, sha256(content));
    const clonePath = await this.repo.getClonePath(repoId);
    if (clonePath) await this.safeWrite(clonePath, path, content);
    return this.toContextDoc(repoId, path, content);
  }

  /** Explicitly-registered empty folders (AC-27/30) — the tree merges these with the doc catalog. */
  async folders(repoId: string): Promise<ContextFolder[]> {
    const nodes = await this.repo.listNodes(repoId);
    return nodes.filter((n) => n.kind === 'folder').map((n) => ({ path: n.path }));
  }

  /**
   * COVERAGE for one document (AC-39/40): workspace agents with this exact
   * document attached (directly or via an enabled skill) over all workspace
   * agents. `percent` is `null` — never `0` — when the workspace has no agents.
   */
  async coverage(workspaceId: string, repoId: string, path: string): Promise<ContextDocCoverage> {
    const [attached, total] = await Promise.all([
      this.repo.countAgentsUsingDoc(workspaceId, repoId, path),
      this.repo.countWorkspaceAgents(workspaceId),
    ]);
    return {
      attached_agents: attached,
      total_agents: total,
      percent: total === 0 ? null : (attached / total) * 100,
    };
  }

  private assertPath(rawPath: string, opts: { requireMd: boolean }): string {
    const check = validateContextPath(rawPath, this.searchRoots, opts);
    if (!check.ok) throw new BadRequestError(check.reason);
    return check.path;
  }

  private async requireClonePath(repoId: string): Promise<string> {
    const clonePath = await this.repo.getClonePath(repoId);
    if (!clonePath) {
      throw new BadRequestError('Repository is not cloned yet — cannot author documents');
    }
    return clonePath;
  }

  private async toContextDoc(repoId: string, path: string, content: string): Promise<ContextDoc> {
    const usage = await this.repo.usageCounts(repoId);
    return {
      path,
      name: basename(path),
      source: sourceTagFor(path),
      size_bytes: Buffer.byteLength(content, 'utf8'),
      tokens: this.tokenizer.count(content),
      used_by_agents: usage.get(path) ?? 0,
    };
  }

  private async safeWrite(clonePath: string, path: string, content: string): Promise<void> {
    if (!this.writer) return;
    try {
      await this.writer.ensureDir(clonePath, dirname(path));
      await this.writer.write(clonePath, path, content);
    } catch {
      // Projection is derived (AC-25) — Postgres already holds the truth.
    }
  }

  private async safeEnsureDir(clonePath: string, path: string): Promise<void> {
    if (!this.writer) return;
    try {
      await this.writer.ensureDir(clonePath, path);
    } catch {
      // Derived projection — non-fatal.
    }
  }

  private async catalogPaths(repoId: string): Promise<Set<string>> {
    const clonePath = await this.repo.getClonePath(repoId);
    if (!clonePath) return new Set();
    const entries = await this.reader.list(clonePath, this.searchRoots);
    return new Set(entries.map((e) => e.path));
  }
}
