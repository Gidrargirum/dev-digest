/**
 * PR Brief HTTP module.
 *
 *   POST /pulls/:id/brief            → PrBriefResponse (cached Brief or { brief: null })
 *   POST /pulls/:id/brief {force}    → regenerate, then return the fresh Brief
 *
 * The route NEVER generates implicitly (spec Non-goals): without `force` it
 * only reads the cache. A `:id` that does not resolve to a PR in the caller's
 * workspace is a `404` on BOTH paths — deliberately unlike
 * `GET /pulls/:id/intent` (which returns `{ intent: null }`); see README.md.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import type { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { AppError, NotFoundError } from '../../platform/errors.js';

// Fastify represents a request with no payload as `null` at the body validator
// boundary, so accept both null and undefined for the cache-read form.
const BriefBody = z.object({ force: z.boolean().optional() }).nullish();

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, body: BriefBody },
      // `force: true` performs a paid LLM call. The read form shares the route,
      // so use the same ceiling as the review endpoint: generous for UI reads,
      // but low enough to bound accidental regeneration bursts.
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrBriefResponse> => {
      const { workspaceId } = await getContext(container, req);
      const prId = req.params.id;

      if (req.body?.force === true) {
        const res = await container.brief.regenerate(workspaceId, prId).catch((error) => {
          req.log.error({ err: error, prId }, 'PR Brief regeneration failed');
          throw new AppError(
            'brief_regeneration_failed',
            'Failed to regenerate PR Brief',
            500,
          );
        });
        if (res.kind === 'not-found') throw new NotFoundError('Pull request not found');
      }

      const got = await container.brief.get(workspaceId, prId);
      if (got.kind === 'not-found') throw new NotFoundError('Pull request not found');
      return { brief: got.brief };
    },
  );
}
