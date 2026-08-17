import { inflateRawSync } from 'node:zlib';
import type {
  Skill,
  SkillVersion,
  SkillStats,
  CommunitySkill,
  SkillImportDraft,
  SkillType,
} from '@devdigest/shared';
import type { SkillRow, SkillVersionRow, CommunitySkillRow } from '../../db/rows.js';
import type { SkillStatsRaw } from './repository.js';
import { MAX_IMPORT_BYTES } from './constants.js';

/**
 * Pure mapping + parsing helpers for the skills module. No I/O — everything
 * here operates on already-fetched rows or already-read buffers, so it's
 * cheap to unit test.
 */

const SKILL_TYPES: SkillType[] = ['rubric', 'convention', 'security', 'custom'];

export function toSkillDto(row: SkillRow): Skill {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    type: row.type as SkillType,
    source: row.source as Skill['source'],
    body: row.body,
    enabled: row.enabled,
    version: row.version,
    evidence_files: row.evidenceFiles ?? null,
  };
}

export function toSkillVersionDto(row: SkillVersionRow): SkillVersion {
  return {
    skill_id: row.skillId,
    version: row.version,
    body: row.body,
    created_at: row.createdAt.toISOString(),
  };
}

export function toSkillStatsDto(input: SkillStatsRaw): SkillStats {
  const { usedBy, findings30d, accepted30d, byCategory } = input;
  return {
    used_by: usedBy,
    findings_30d: findings30d,
    accepted_30d: accepted30d,
    accept_rate: findings30d === 0 ? null : Math.round((accepted30d / findings30d) * 100),
    by_category: byCategory,
  };
}

export function toCommunitySkillDto(row: CommunitySkillRow): CommunitySkill {
  return {
    id: row.id,
    name: row.name,
    repo: row.repo,
    stars: row.stars,
    lang: row.lang,
    desc: row.description,
    type: row.type as SkillType,
    body: row.body,
  };
}

/**
 * Parse a plain markdown skill file. Supports an OPTIONAL flat YAML
 * frontmatter block (`name:` / `description:` / `type:` only — no nesting,
 * no lists) delimited by `---` on its own line at the very start of the
 * text. Falls back to deriving name/description from the body's first
 * heading/paragraph when frontmatter is absent or incomplete.
 */
export function parseSkillMarkdown(filename: string, text: string): SkillImportDraft {
  let body = text;
  let fmName: string | undefined;
  let fmDescription: string | undefined;
  let fmType: string | undefined;

  const lines = text.split('\n');
  if (lines[0]?.trim() === '---') {
    const closeIdx = lines.indexOf('---', 1);
    if (closeIdx !== -1) {
      const fmLines = lines.slice(1, closeIdx);
      for (const line of fmLines) {
        const m = /^([a-zA-Z_]+):\s*(.*)$/.exec(line.trim());
        if (!m) continue;
        const key = m[1]!.toLowerCase();
        const value = m[2]!.trim().replace(/^["']|["']$/g, '');
        if (key === 'name') fmName = value;
        else if (key === 'description') fmDescription = value;
        else if (key === 'type') fmType = value;
      }
      body = lines.slice(closeIdx + 1).join('\n');
    }
  }

  const bodyLines = body.split('\n');
  const headingLine = bodyLines.find((l) => /^#\s+/.test(l.trim()));
  const derivedName = headingLine ? headingLine.trim().replace(/^#+\s*/, '').trim() : undefined;

  const derivedDescription = (() => {
    for (const line of bodyLines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      if (/^#/.test(trimmed)) continue;
      return trimmed.slice(0, 300);
    }
    return '';
  })();

  const nameNoExt = filename.replace(/\.[^./]+$/, '');

  const name = fmName || derivedName || nameNoExt;
  const description = fmDescription || derivedDescription || '';
  const type: SkillType = SKILL_TYPES.includes(fmType as SkillType) ? (fmType as SkillType) : 'custom';

  return { name, description, type, body, ignored_files: [] };
}

// ---------------------------------------------------------------- ZIP import
//
// Minimal ZIP reader using only Node built-ins. A ZIP file's authoritative
// index is the "End Of Central Directory" (EOCD) record, a fixed-size
// footer located at (or near) the end of the file. It points at the
// "central directory": a run of per-entry records, each describing a
// filename, compression method, sizes, and the OFFSET of that entry's
// local file header (which itself repeats the filename + a second copy of
// the sizes, then the raw/compressed data). We do not stream — the whole
// archive is already in memory as `bytes`.

const EOCD_SIG = 0x06054b50;
const CENTRAL_DIR_SIG = 0x02014b50;
const LOCAL_FILE_SIG = 0x04034b50;

interface CentralDirEntry {
  filename: string;
  compressionMethod: number;
  compressedSize: number;
  localHeaderOffset: number;
}

function findEocdOffset(buf: Buffer): number {
  // Search backward for the EOCD signature. Bound the search to the last
  // 64KB + fixed header size, since the only variable-length part of the
  // EOCD record is a trailing comment capped at 65535 bytes.
  const searchStart = Math.max(0, buf.length - (65535 + 22));
  for (let i = buf.length - 22; i >= searchStart; i--) {
    if (buf.readUInt32LE(i) === EOCD_SIG) return i;
  }
  throw new Error('Not a valid ZIP archive (no End Of Central Directory record found)');
}

function readCentralDirectory(buf: Buffer): CentralDirEntry[] {
  const eocdOffset = findEocdOffset(buf);
  const entryCount = buf.readUInt16LE(eocdOffset + 10);
  const centralDirOffset = buf.readUInt32LE(eocdOffset + 16);

  const entries: CentralDirEntry[] = [];
  let offset = centralDirOffset;
  for (let i = 0; i < entryCount; i++) {
    if (buf.readUInt32LE(offset) !== CENTRAL_DIR_SIG) {
      throw new Error('Malformed ZIP central directory');
    }
    const compressionMethod = buf.readUInt16LE(offset + 10);
    const compressedSize = buf.readUInt32LE(offset + 20);
    const filenameLen = buf.readUInt16LE(offset + 28);
    const extraLen = buf.readUInt16LE(offset + 30);
    const commentLen = buf.readUInt16LE(offset + 32);
    const localHeaderOffset = buf.readUInt32LE(offset + 42);
    const filenameStart = offset + 46;
    const filename = buf.toString('utf8', filenameStart, filenameStart + filenameLen);

    entries.push({ filename, compressionMethod, compressedSize, localHeaderOffset });
    offset = filenameStart + filenameLen + extraLen + commentLen;
  }
  return entries;
}

function readEntryData(buf: Buffer, entry: CentralDirEntry): Buffer {
  const offset = entry.localHeaderOffset;
  if (buf.readUInt32LE(offset) !== LOCAL_FILE_SIG) {
    throw new Error('Malformed ZIP local file header');
  }
  const filenameLen = buf.readUInt16LE(offset + 26);
  const extraLen = buf.readUInt16LE(offset + 28);
  const dataStart = offset + 30 + filenameLen + extraLen;
  const raw = buf.subarray(dataStart, dataStart + entry.compressedSize);

  if (entry.compressionMethod === 0) return Buffer.from(raw);
  if (entry.compressionMethod === 8) {
    // Cap enforced DURING decompression (not after): a small crafted DEFLATE
    // stream can expand to gigabytes, and inflateRawSync throws as soon as
    // this limit would be exceeded rather than materializing the full output.
    try {
      return inflateRawSync(raw, { maxOutputLength: MAX_IMPORT_BYTES });
    } catch {
      throw new Error('Archive contents too large');
    }
  }
  throw new Error(`Unsupported ZIP compression method: ${entry.compressionMethod}`);
}

function isBlockedPath(filename: string): boolean {
  const lower = filename.toLowerCase();
  return (
    filename.includes('..') ||
    filename.startsWith('/') ||
    lower.includes('bin/') ||
    lower.includes('scripts/') ||
    lower.endsWith('.sh') ||
    lower.endsWith('.js') ||
    lower.endsWith('.py') ||
    lower.endsWith('.exe')
  );
}

/**
 * Best-effort ZIP importer: pulls the first (preferring `SKILL.md`) markdown
 * file out of an uploaded archive and parses it via `parseSkillMarkdown`.
 * Not a general-purpose ZIP library — throws on anything it doesn't
 * understand rather than silently misparsing.
 */
export function extractSkillFromZip(bytes: Uint8Array): SkillImportDraft {
  const buf = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const entries = readCentralDirectory(buf);

  const ignoredFiles: string[] = [];
  const mdCandidates: CentralDirEntry[] = [];

  for (const entry of entries) {
    if (entry.filename.endsWith('/')) continue; // directory entry
    const isMd = entry.filename.toLowerCase().endsWith('.md');
    if (!isMd || isBlockedPath(entry.filename)) {
      ignoredFiles.push(entry.filename);
      continue;
    }
    mdCandidates.push(entry);
  }

  // Prefer an entry literally named SKILL.md (any depth); else first in order.
  let chosen: CentralDirEntry | undefined = mdCandidates.find(
    (e) => e.filename.toLowerCase().split('/').pop() === 'skill.md',
  );
  chosen ??= mdCandidates[0];

  if (!chosen) throw new Error('No markdown file found in archive');

  // Every other .md candidate is "not read" — counts as ignored too.
  for (const c of mdCandidates) {
    if (c !== chosen) ignoredFiles.push(c.filename);
  }

  let data: Buffer;
  try {
    data = readEntryData(buf, chosen);
  } catch {
    // Unsupported compression on the chosen entry — fall back through the
    // remaining candidates rather than failing the whole import.
    ignoredFiles.push(chosen.filename);
    const remaining = mdCandidates.filter((c) => c !== chosen);
    const next = remaining[0];
    if (!next) throw new Error('No markdown file found in archive');
    data = readEntryData(buf, next);
    chosen = next;
  }

  if (data.byteLength > MAX_IMPORT_BYTES) {
    throw new Error('Archive contents too large');
  }

  const draft = parseSkillMarkdown(chosen.filename, data.toString('utf8'));
  return { ...draft, ignored_files: ignoredFiles };
}
