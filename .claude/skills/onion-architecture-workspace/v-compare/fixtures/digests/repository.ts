// server/src/modules/digests/repository.ts
import { and, desc, eq, lt } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import { digests, notificationOutbox } from '../../db/schema/digests.js';
import type { Digest } from '@devdigest/shared';
import { toDigest } from './helpers.js';
import { MAX_CONSECUTIVE_FAILURES } from './constants.js';

export class DigestsRepository {
  constructor(private readonly db: Db) {}

  async listForWorkspace(workspaceId: string): Promise<Digest[]> {
    const rows = await this.db.select().from(digests).where(eq(digests.workspaceId, workspaceId));
    return rows.map(toDigest);
  }

  async findDue(now: Date): Promise<Digest[]> {
    const rows = await this.db
      .select()
      .from(digests)
      .where(
        and(
          eq(digests.enabled, true),
          lt(digests.nextRunAt, now),
          lt(digests.consecutiveFailures, MAX_CONSECUTIVE_FAILURES),
        ),
      )
      .orderBy(desc(digests.nextRunAt));
    return rows.map(toDigest);
  }

  async saveRun(id: string, body: string, nextRunAt: Date): Promise<void> {
    await this.db
      .update(digests)
      .set({ lastBody: body, nextRunAt, consecutiveFailures: 0 })
      .where(eq(digests.id, id));
  }

  async queueNotification(kind: string, recipientId: string, payload: unknown): Promise<void> {
    await this.db
      .insert(notificationOutbox)
      .values({ kind, recipientId, payload });
  }
}
