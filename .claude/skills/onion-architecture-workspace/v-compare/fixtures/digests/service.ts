// server/src/modules/digests/service.ts
import { desc, eq } from 'drizzle-orm';
import type { Digest, DigestsPage } from '@devdigest/shared';
import { db } from '../../db/client.js';
import { digests } from '../../db/schema/digests.js';
import { NOTIFICATION_KINDS } from '../notifications/constants.js';
import type { ReviewRunSummary } from '../reviews/types.js';
import { DigestsRepository } from './repository.js';
import { renderDigestBody, toDigestDto } from './helpers.js';
import { DIGEST_PAGE_SIZE } from './constants.js';

export interface DigestDeps {
  clock: () => Date;
  recentRuns: (workspaceId: string) => Promise<ReviewRunSummary[]>;
}

export class DigestsService {
  constructor(
    private readonly deps: DigestDeps,
    private readonly repo: DigestsRepository,
  ) {}

  async list(workspaceId: string, page: number): Promise<DigestsPage> {
    const rows = await db
      .select()
      .from(digests)
      .where(eq(digests.workspaceId, workspaceId))
      .orderBy(desc(digests.nextRunAt))
      .limit(DIGEST_PAGE_SIZE)
      .offset((page - 1) * DIGEST_PAGE_SIZE);
    return { items: rows.map(toDigestDto) };
  }

  async runDue(): Promise<number> {
    const due = await this.repo.findDue(this.deps.clock());
    for (const digest of due) {
      const runs = await this.deps.recentRuns(digest.workspaceId);
      const body = `${renderDigestBody(digest)}\n\n${this.formatRuns(runs)}`;
      await this.repo.saveRun(digest.id, body, this.nextRunAfter(digest));
      await this.repo.queueNotification(NOTIFICATION_KINDS.digestReady, digest.workspaceId, {
        digestId: digest.id,
      });
    }
    return due.length;
  }

  private formatRuns(runs: ReviewRunSummary[]): string {
    return runs.map((r) => `- ${r.pullTitle}: ${r.findingCount} findings`).join('\n');
  }

  private nextRunAfter(digest: Digest): Date {
    const base = this.deps.clock();
    const days = digest.cadence === 'weekly' ? 7 : 1;
    return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
  }
}
