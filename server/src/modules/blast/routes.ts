/**
 * Blast Radius HTTP module.
 *
 *   GET /pulls/:id/blast → PrBlastResponse
 *
 * Unlike `modules/intent/routes.ts`, a `:id` that does not resolve to a PR in
 * the caller's workspace is a 404 (`NotFoundError`), not a
 * `{ blast: null }` 200 — see specs/blast-radius.md "API contract" for why
 * this module doesn't follow the intent module's convention.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrBlastResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/blast',
    {
      schema: { params: IdParams },
      // A GET read over an already-computed index (no LLM call, no clone
      // parsing on the hot path), but still a BFS over `file_edges` two hops
      // deep — cheaper than `conventions/extract`'s LLM-backed 10/min, but
      // not free enough for the global 120/min default. 30/min splits the
      // difference.
      config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
    },
    async (req): Promise<PrBlastResponse> => {
      const { workspaceId } = await getContext(container, req);
      const blast = await container.blast.getBlast(workspaceId, req.params.id);
      if (!blast) throw new NotFoundError('Pull request not found');
      return blast;
    },
  );
}
