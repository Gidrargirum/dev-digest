/**
 * `settleWithConcurrency` — MEASURED on a real scan (plan "Крок 5" follow-up):
 * 6 extraction batches fully parallel via `Promise.allSettled` triggered
 * provider-side throttling severe enough that zero batches settled — not
 * fulfilled, not even timed out — for 10+ minutes. This is the capped-
 * concurrency replacement; these tests pin the properties the fix depends on.
 */
import { describe, expect, it } from 'vitest';
import { settleWithConcurrency } from '../src/modules/conventions/service.js';

describe('settleWithConcurrency', () => {
  it('never runs more than `limit` tasks at once', async () => {
    let inFlight = 0;
    let maxInFlight = 0;
    const tasks = Array.from({ length: 9 }, (_, i) => async () => {
      inFlight++;
      maxInFlight = Math.max(maxInFlight, inFlight);
      await new Promise((r) => setTimeout(r, 5));
      inFlight--;
      return i;
    });

    const results = await settleWithConcurrency(tasks, 3);

    expect(maxInFlight).toBeLessThanOrEqual(3);
    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([
      0, 1, 2, 3, 4, 5, 6, 7, 8,
    ]);
  });

  it('settles results in task order regardless of completion order', async () => {
    const delays = [30, 5, 20, 1];
    const tasks = delays.map((ms, i) => async () => {
      await new Promise((r) => setTimeout(r, ms));
      return i;
    });

    const results = await settleWithConcurrency(tasks, 4);

    expect(results.map((r) => (r.status === 'fulfilled' ? r.value : null))).toEqual([0, 1, 2, 3]);
  });

  it('records a rejection without throwing and without blocking the rest', async () => {
    const tasks = [
      async () => 'a',
      async () => {
        throw new Error('batch failed');
      },
      async () => 'c',
    ];

    const results = await settleWithConcurrency(tasks, 2);

    expect(results[0]).toEqual({ status: 'fulfilled', value: 'a' });
    expect(results[1]!.status).toBe('rejected');
    expect((results[1] as PromiseRejectedResult).reason).toBeInstanceOf(Error);
    expect(results[2]).toEqual({ status: 'fulfilled', value: 'c' });
  });

  it('one never-resolving task does not stop the others from being scheduled', async () => {
    let fastCompleted = 0;
    const hang = () => new Promise<never>(() => undefined);
    const fast = async () => {
      fastCompleted++;
      return 'fast';
    };
    // limit=2: the hang occupies one slot forever; the other slot must still
    // work through both fast tasks instead of deadlocking behind the hang.
    const tasks = [hang, fast, fast];

    await Promise.race([
      settleWithConcurrency(tasks, 2),
      new Promise((r) => setTimeout(r, 100)),
    ]);

    expect(fastCompleted).toBe(2);
  });
});
