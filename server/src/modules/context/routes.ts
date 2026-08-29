import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  SetContextBody,
  CreateContextDocBody,
  CreateContextFolderBody,
  SaveContextDocBody,
  UploadContextDocBody,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

/** ~1.5 MiB — base64 inflates the 1 MiB decoded-byte ceiling (AC-31) by ~33%. */
const UPLOAD_BODY_LIMIT = 1_572_864;

/**
 * Project Context Folder module.
 *   GET  /repos/:repoId/context/docs           → document catalog (AC-1/2/3/23)
 *   GET  /repos/:repoId/context/docs/content   → preview one document's content (AC-4/16)
 *   POST /repos/:repoId/context/docs           → create an empty document (AC-29)
 *   POST /repos/:repoId/context/docs/upload    → upload a .md file, base64 body (AC-31/32)
 *   PUT  /repos/:repoId/context/docs/content   → save an edit (AC-34/35)
 *   POST /repos/:repoId/context/folders        → create an empty folder branch (AC-30)
 *   GET  /repos/:repoId/context/folders        → explicitly-registered folders (AC-27/30)
 *   GET  /repos/:repoId/context/docs/coverage  → COVERAGE for one document (AC-39/40)
 *   GET /agents/:id/context                  → an agent's attached documents (Context tab)
 *   PUT /agents/:id/context                  → replace an agent's attached documents (AC-6/8/9)
 *   GET /skills/:id/context                  → a skill's attached documents
 *   PUT /skills/:id/context                  → replace a skill's attached documents (AC-10)
 *
 * The document-content route has no authorization beyond the catalog check
 * (AC-16): this repo has one access level per workspace — a decision, not an
 * oversight (see docs/plans/2026-08-26-project-context-folder.plan.md).
 */

const RepoParams = z.object({ repoId: z.string().uuid() });
const DocContentQuery = z.object({ path: z.string().min(1) });
const RepoIdQuery = z.object({ repo_id: z.string().uuid() });

export default async function contextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = app.container.projectContext;

  app.get('/repos/:repoId/context/docs', { schema: { params: RepoParams } }, async (req) => {
    await getContext(app.container, req);
    return service.catalog(req.params.repoId);
  });

  app.get(
    '/repos/:repoId/context/docs/content',
    { schema: { params: RepoParams, querystring: DocContentQuery } },
    async (req) => {
      await getContext(app.container, req);
      const content = await service.readContent(req.params.repoId, req.query.path);
      if (content === undefined) throw new NotFoundError('Document not found');
      return { path: req.query.path, content };
    },
  );

  app.post(
    '/repos/:repoId/context/docs',
    { schema: { params: RepoParams, body: CreateContextDocBody } },
    async (req, reply) => {
      await getContext(app.container, req);
      const doc = await service.createDoc(req.params.repoId, req.body.path, req.body.content);
      reply.status(201);
      return doc;
    },
  );

  app.post(
    '/repos/:repoId/context/docs/upload',
    {
      bodyLimit: UPLOAD_BODY_LIMIT,
      schema: { params: RepoParams, body: UploadContextDocBody },
    },
    async (req, reply) => {
      await getContext(app.container, req);
      const doc = await service.uploadDoc(
        req.params.repoId,
        req.body.path,
        req.body.content_base64,
      );
      reply.status(201);
      return doc;
    },
  );

  app.put(
    '/repos/:repoId/context/docs/content',
    { schema: { params: RepoParams, body: SaveContextDocBody } },
    async (req) => {
      await getContext(app.container, req);
      return service.saveDoc(req.params.repoId, req.body.path, req.body.content);
    },
  );

  app.post(
    '/repos/:repoId/context/folders',
    { schema: { params: RepoParams, body: CreateContextFolderBody } },
    async (req, reply) => {
      await getContext(app.container, req);
      const folder = await service.createFolder(req.params.repoId, req.body.path);
      reply.status(201);
      return folder;
    },
  );

  app.get(
    '/repos/:repoId/context/folders',
    { schema: { params: RepoParams } },
    async (req) => {
      await getContext(app.container, req);
      return service.folders(req.params.repoId);
    },
  );

  app.get(
    '/repos/:repoId/context/docs/coverage',
    { schema: { params: RepoParams, querystring: DocContentQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      return service.coverage(workspaceId, req.params.repoId, req.query.path);
    },
  );

  app.get(
    '/agents/:id/context',
    { schema: { params: IdParams, querystring: RepoIdQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await app.container.agentsRepo.getById(workspaceId, req.params.id);
      if (!agent) throw new NotFoundError('Agent not found');
      return service.agentAttachments(req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/agents/:id/context',
    { schema: { params: IdParams, body: SetContextBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const agent = await app.container.agentsRepo.getById(workspaceId, req.params.id);
      if (!agent) throw new NotFoundError('Agent not found');
      return service.setAgentAttachments(req.params.id, req.body.repo_id, req.body.paths);
    },
  );

  app.get(
    '/skills/:id/context',
    { schema: { params: IdParams, querystring: RepoIdQuery } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await app.container.skillsRepo.getById(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return service.skillAttachments(req.params.id, req.query.repo_id);
    },
  );

  app.put(
    '/skills/:id/context',
    { schema: { params: IdParams, body: SetContextBody } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await app.container.skillsRepo.getById(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return service.setSkillAttachments(req.params.id, req.body.repo_id, req.body.paths);
    },
  );
}
