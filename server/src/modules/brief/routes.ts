/**
 * PR Why + Risk Brief HTTP module (spec 2026-08-27-pr-why-risk-brief).
 *
 *   GET  /pulls/:id/brief            → PrWhyRiskBriefResponse
 *                                      `{ brief: null }` 200 when none exists
 *                                      OR the PR is in another workspace
 *                                      (AC-20 + AC-22 — deliberately
 *                                      indistinguishable). A read never
 *                                      triggers a computation.
 *   POST /pulls/:id/brief/regenerate → PrWhyRiskBriefRegenerateResponse
 *                                      an explicit action, not a `force` flag
 *                                      on the read (AC-21). Rate limited to
 *                                      MAX_REGEN / minute PER PULL REQUEST
 *                                      (AC-38); background recomputes never go
 *                                      through HTTP so never consume it.
 */
import type { FastifyInstance, FastifyRequest } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type {
  PrWhyRiskBriefResponse,
  PrWhyRiskBriefRegenerateResponse,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { MAX_REGEN } from './constants.js';

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  // Bind the `brief.compute` job handler exactly once at boot, on the
  // container's own facade instance — mirrors
  // `container.repoIntel.registerIndexJobHandlers()` in repo-intel/routes.ts.
  // Background triggers (pulls/routes.ts, reviews/run-executor.ts) enqueue
  // through `container.brief`, which constructs the same instance.
  container.brief.registerJobHandlers();

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams } },
    async (req): Promise<PrWhyRiskBriefResponse> => {
      const { workspaceId } = await getContext(container, req);
      const brief = await container.brief.get(workspaceId, req.params.id);
      return { brief: brief ?? null };
    },
  );

  app.post(
    '/pulls/:id/brief/regenerate',
    {
      schema: { params: IdParams },
      config: {
        rateLimit: {
          max: MAX_REGEN,
          timeWindow: '1 minute',
          // Budget is PER PULL REQUEST — not global, not per IP (AC-38).
          keyGenerator: (req: FastifyRequest) =>
            `brief-regen:${(req.params as { id: string }).id}`,
        },
      },
    },
    async (req): Promise<PrWhyRiskBriefRegenerateResponse> => {
      const { workspaceId } = await getContext(container, req);
      const result = await container.brief.requestRecompute(workspaceId, req.params.id, {
        force: true,
      });
      if (result === 'unknown_pr') throw new NotFoundError('Pull request not found');
      // 'running' → explicit "already running" (AC-8); 'started' → enqueued.
      return { status: result };
    },
  );
}
