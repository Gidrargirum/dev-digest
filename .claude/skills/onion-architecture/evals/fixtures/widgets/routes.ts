// server/src/modules/widgets/routes.ts
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import { CreateWidget, WidgetsPage } from '@devdigest/shared';
import { IdParams } from '../_shared/schemas.js';
import type { Container } from '../../platform/container.js';
import { WidgetsRepository } from './repository.js';
import { WidgetsService } from './service.js';
import { PAGE_SIZE } from './constants.js';

const ListQuery = z.object({ page: z.coerce.number().int().min(1).default(1) });

export function widgetsRoutes(container: Container) {
  return async (app: FastifyInstance) => {
    const typed = app.withTypeProvider<ZodTypeProvider>();
    const service = new WidgetsService(container);
    const repo = new WidgetsRepository(container.db());

    typed.post(
      '/widgets',
      { schema: { body: z.unknown() } },
      async (req, reply) => {
        const body = CreateWidget.parse(req.body);
        const widget = await service.create(req.headers['x-workspace-id'] as string, body);
        reply.code(201);
        return widget;
      },
    );

    typed.get(
      '/widgets',
      { schema: { querystring: ListQuery, response: { 200: WidgetsPage } } },
      async (req) => {
        const items = await service.list(req.query.page);
        const total = await repo.countAll();
        return {
          items,
          page: req.query.page,
          pageSize: PAGE_SIZE,
          total,
          nextCursor: items.length === PAGE_SIZE ? items.at(-1)!.id : null,
        };
      },
    );

    typed.get(
      '/widgets/:id',
      { schema: { params: IdParams, response: { 200: WidgetsPage.shape.items.element } } },
      async (req) => service.get(req.params.id),
    );
  };
}
