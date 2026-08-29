// server/src/modules/widgets/repository.ts
import { and, desc, eq, lt, sql } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { widgets } from '../../db/schema/widgets.js';
import type { WidgetRow } from '../../db/rows.js';
import { STALE_AFTER_DAYS } from './constants.js';

export class WidgetsRepository {
  constructor(private readonly db: Db) {}

  async findById(id: string): Promise<WidgetRow | undefined> {
    const [row] = await this.db.select().from(widgets).where(eq(widgets.id, id));
    return row;
  }

  async countAll(): Promise<number> {
    const [{ n }] = await this.db.select({ n: sql<number>`count(*)` }).from(widgets);
    return Number(n);
  }

  async listStaleUntagged(): Promise<WidgetRow[]> {
    return this.db
      .select()
      .from(widgets)
      .where(
        and(
          eq(sql`cardinality(${widgets.tags})`, 0),
          lt(widgets.createdAt, sql`now() - make_interval(days => ${STALE_AFTER_DAYS})`),
        ),
      )
      .orderBy(desc(widgets.createdAt));
  }
}
