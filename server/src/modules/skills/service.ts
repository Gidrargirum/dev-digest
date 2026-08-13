import type {
  Skill,
  SkillVersion,
  SkillStats,
  CommunitySkill,
  SkillImportDraft,
  SkillType,
  SkillSource,
} from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { SkillsRepository } from './repository.js';
import {
  toSkillDto,
  toSkillVersionDto,
  toSkillStatsDto,
  toCommunitySkillDto,
  parseSkillMarkdown,
  extractSkillFromZip,
} from './helpers.js';

export interface CreateSkillInput {
  name: string;
  description: string;
  type: SkillType;
  body: string;
  source: SkillSource;
  enabled?: boolean;
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: SkillType;
  body?: string;
  enabled?: boolean;
}

/**
 * Skills application service. Mirrors `AgentsService`: workspace-scoped
 * methods return `undefined` on a missing/foreign row — the route layer maps
 * that to a 404. Community catalog methods are global (no workspace scope).
 */
export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source,
      body: input.body,
      enabled: input.enabled,
    });
    return toSkillDto(row);
  }

  async update(workspaceId: string, id: string, patch: UpdateSkillInput): Promise<Skill | undefined> {
    const row = await this.repo.update(workspaceId, id, patch);
    return row ? toSkillDto(row) : undefined;
  }

  async listVersions(workspaceId: string, id: string): Promise<SkillVersion[] | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    const rows = await this.repo.listVersions(id);
    return rows.map(toSkillVersionDto);
  }

  async getVersion(workspaceId: string, id: string, version: number): Promise<SkillVersion | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    const row = await this.repo.getVersion(id, version);
    return row ? toSkillVersionDto(row) : undefined;
  }

  async restoreVersion(workspaceId: string, id: string, version: number): Promise<Skill | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    const row = await this.repo.restoreVersion(workspaceId, id, version);
    return row ? toSkillDto(row) : undefined;
  }

  async stats(workspaceId: string, id: string): Promise<SkillStats | undefined> {
    const existing = await this.repo.getById(workspaceId, id);
    if (!existing) return undefined;
    const raw = await this.repo.statsFor(id);
    return toSkillStatsDto(raw);
  }

  async listCommunity(q?: string, lang?: string): Promise<CommunitySkill[]> {
    const rows = await this.repo.listCommunity(q, lang);
    return rows.map(toCommunitySkillDto);
  }

  /** Parse an uploaded file (plain markdown or `.zip`) into an import draft. */
  importPreviewFromFile(filename: string, contentBase64: string): SkillImportDraft {
    const buf = Buffer.from(contentBase64, 'base64');
    if (filename.toLowerCase().endsWith('.zip')) {
      return extractSkillFromZip(buf);
    }
    return parseSkillMarkdown(filename, buf.toString('utf8'));
  }
}
