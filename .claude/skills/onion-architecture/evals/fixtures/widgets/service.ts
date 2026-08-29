// server/src/modules/widgets/service.ts
import { and, desc, eq, lt } from 'drizzle-orm';
import type { CreateWidget, Widget } from '@devdigest/shared';
import { db } from '../../db/client.js';
import { widgets } from '../../db/schema/widgets.js';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import { WidgetsRepository } from './repository.js';
import { toWidget, buildTagPrompt } from './helpers.js';
import { MAX_TAGS, PAGE_SIZE } from './constants.js';

export class WidgetsService {
  private readonly repo: WidgetsRepository;

  constructor(private readonly container: Container) {
    this.repo = new WidgetsRepository(container.db());
  }

  async create(workspaceId: string, input: CreateWidget): Promise<Widget> {
    let tags = input.tags ?? [];
    if (tags.length === 0) {
      const tagger = this.container.widgetTagger();
      tags = (await tagger.suggest(buildTagPrompt(input.name))).slice(0, MAX_TAGS);
    }

    const [row] = await db
      .insert(widgets)
      .values({ workspaceId, name: input.name, tags, createdAt: new Date() })
      .returning();
    return toWidget(row);
  }

  async list(page: number): Promise<Widget[]> {
    const rows = await db
      .select()
      .from(widgets)
      .orderBy(desc(widgets.createdAt))
      .limit(PAGE_SIZE)
      .offset((page - 1) * PAGE_SIZE);
    return rows.map(toWidget);
  }

  async get(id: string): Promise<Widget> {
    const widget = await this.repo.findById(id);
    if (!widget) throw new NotFoundError(`widget ${id}`);
    return widget;
  }
}
