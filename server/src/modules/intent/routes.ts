/**
 * Intent HTTP module.
 *
 *   GET /pulls/:id/intent → PrIntentResponse ({ intent: null } when not yet
 *                           computed, or when `:id` isn't a PR in the caller's
 *                           workspace — never a 404, so the client's
 *                           `apiFetch` doesn't normalize "not computed yet"
 *                           into an `ApiError`, and a bad id leaks no more
 *                           signal than a real-but-uncomputed one).
 *
 * There is no POST/recompute route (decision #2, plans/intent-layer.md §1):
 * intent is derived once per `(pr_id, head_sha)` at review-run time, inside
 * `ReviewRunExecutor` (reviews/run-executor.ts), not from this module.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import type { PrIntentResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams } },
    async (req): Promise<PrIntentResponse> => {
      const { workspaceId } = await getContext(container, req);
      // Tenancy is enforced by the use case itself (IntentService.get →
      // IntentRepository.findIntentForWorkspace joins on pull_requests), so
      // this route no longer needs `reviews`' repository just to check
      // ownership before delegating — the module boundary
      // (.dependency-cruiser.cjs's no-cross-module-imports) stays intact.
      const intent = await container.intent.get(workspaceId, req.params.id);
      return { intent: intent ?? null };
    },
  );
}
