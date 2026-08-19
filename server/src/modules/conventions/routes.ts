/**
 * Conventions HTTP module — the Conventions Extractor (L02).
 *
 *   POST /repos/:id/conventions/extract                 → 202 { scan_id }
 *   GET  /repos/:id/conventions                         → ConventionsPage
 *   GET  /repos/:id/conventions/scans/:scanId/events    → SSE scan progress
 *   PATCH /conventions/:id                              → ConventionCandidate
 *   POST /repos/:id/conventions/skill/preview           → ConventionSkillDraft   (legacy, one merged draft)
 *   POST /repos/:id/conventions/skill                   → 201 Skill              (legacy, one merged skill)
 *   POST /repos/:id/conventions/skills/preview          → ConventionSkillDraftSet (one draft per category)
 *   POST /repos/:id/conventions/skills                  → 201 ConventionSkillsResult
 *
 * The plural routes are additive: the singular ones above keep working
 * unchanged (removed only in a later step, once every caller has moved over).
 *
 * Job-handler registration happens here, once at boot, mirroring
 * `repo-intel/routes.ts`: the extraction runs on the JobRunner, so the POST
 * returns before the model is called.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { ConventionCategory, ConventionStatus, SkillType, type RunEvent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { SKILL_TYPE } from './constants.js';
import { ConventionsService } from './service.js';

const ScanParams = z.object({
  id: z.string().uuid(),
  scanId: z.string().uuid(),
});

const PatchConventionBody = z
  .object({
    status: ConventionStatus.optional(),
    rule: z.string().min(1).optional(),
    category: ConventionCategory.optional(),
  })
  .refine((b) => b.status !== undefined || b.rule !== undefined || b.category !== undefined, {
    message: 'At least one of status, rule or category must be provided',
  });

const SkillPreviewBody = z.object({
  convention_ids: z.array(z.string().uuid()).optional(),
});

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string().min(1),
  // The modal lets the author change it; `convention` is merely the default.
  type: SkillType.default(SKILL_TYPE),
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  convention_ids: z.array(z.string().uuid()).min(1),
  agent_ids: z.array(z.string().uuid()).optional(),
});

// Same shape as `CreateSkillBody` minus `agent_ids` — derived, not
// retyped, so a validation change to one can't silently miss the other.
const SkillDraftBody = CreateSkillBody.omit({ agent_ids: true });

const CreateSkillsBody = z.object({
  drafts: z.array(SkillDraftBody).min(1),
  agent_ids: z.array(z.string().uuid()).optional(),
});

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService(container);
  service.registerJobHandlers();

  app.post(
    '/repos/:id/conventions/extract',
    {
      schema: { params: IdParams },
      // A scan is two LLM round-trips plus a repo-wide grep per candidate.
      // The global limiter (120/min) would let someone queue 120 paid scans of
      // the same repo a minute; this matches the review route's ceiling.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const result = await service.startExtract(workspaceId, req.params.id);
      if (!result) throw new NotFoundError('Repo not found');
      reply.code(202);
      return result;
    },
  );

  app.get('/repos/:id/conventions', { schema: { params: IdParams } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return service.list(workspaceId, req.params.id);
  });

  // SSE: buffered replay first, then live — identical bridge to /runs/:id/events.
  // No rate limit: one long-lived connection, not burst traffic.
  app.get(
    '/repos/:id/conventions/scans/:scanId/events',
    { schema: { params: ScanParams }, config: { rateLimit: false } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const scanId = req.params.scanId;
      // The bus is keyed by a bare uuid, so without this check any scan id
      // learned from another workspace would stream that repo's file paths,
      // rule text and dropped-candidate snippets.
      const scan = await service.getScan(workspaceId, scanId);
      if (!scan || scan.repo_id !== req.params.id) throw new NotFoundError('Scan not found');

      reply.sse(
        (async function* () {
          const queue: RunEvent[] = [];
          let resolve: (() => void) | null = null;
          let done = false;

          // `subscribe` replays the buffer to a new listener itself — pushing
          // `buffer()` in as well would deliver every past event twice.
          const unsubscribe = container.runBus.subscribe(scanId, (e) => {
            queue.push(e);
            resolve?.();
          });
          const offDone = container.runBus.onDone(scanId, () => {
            done = true;
            resolve?.();
          });

          try {
            while (true) {
              if (queue.length === 0) {
                if (done) break;
                await new Promise<void>((r) => (resolve = r));
                resolve = null;
                continue;
              }
              const e = queue.shift()!;
              yield { id: String(e.seq), event: e.kind, data: JSON.stringify(e) };
            }
          } finally {
            unsubscribe();
            offDone();
          }
        })(),
      );
    },
  );

  app.patch('/conventions/:id', { schema: { params: IdParams, body: PatchConventionBody } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const updated = await service.patch(workspaceId, req.params.id, {
      ...(req.body.status !== undefined ? { status: req.body.status } : {}),
      ...(req.body.rule !== undefined ? { rule: req.body.rule } : {}),
      ...(req.body.category !== undefined ? { category: req.body.category } : {}),
    });
    if (!updated) throw new NotFoundError('Convention not found');
    return updated;
  });

  app.post(
    '/repos/:id/conventions/skill/preview',
    { schema: { params: IdParams, body: SkillPreviewBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const draft = await service.skillDraft(workspaceId, req.params.id, req.body.convention_ids);
      if (!draft) throw new NotFoundError('Repo not found');
      return draft;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: CreateSkillBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skill = await service.createSkill(workspaceId, req.params.id, {
        name: req.body.name,
        description: req.body.description,
        type: req.body.type,
        body: req.body.body,
        ...(req.body.enabled !== undefined ? { enabled: req.body.enabled } : {}),
        conventionIds: req.body.convention_ids,
        ...(req.body.agent_ids !== undefined ? { agentIds: req.body.agent_ids } : {}),
      });
      if (!skill) throw new NotFoundError('No matching conventions found');
      reply.code(201);
      return skill;
    },
  );

  app.post(
    '/repos/:id/conventions/skills/preview',
    { schema: { params: IdParams, body: SkillPreviewBody } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const drafts = await service.skillDrafts(workspaceId, req.params.id, req.body.convention_ids);
      if (!drafts) throw new NotFoundError('Repo not found');
      return { drafts };
    },
  );

  app.post(
    '/repos/:id/conventions/skills',
    { schema: { params: IdParams, body: CreateSkillsBody } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const skills = await service.createSkills(workspaceId, req.params.id, {
        drafts: req.body.drafts.map((d) => ({
          name: d.name,
          description: d.description,
          type: d.type,
          body: d.body,
          ...(d.enabled !== undefined ? { enabled: d.enabled } : {}),
          conventionIds: d.convention_ids,
        })),
        ...(req.body.agent_ids !== undefined ? { agentIds: req.body.agent_ids } : {}),
      });
      if (!skills) throw new NotFoundError('No matching conventions found');
      reply.code(201);
      return { skills };
    },
  );
}
