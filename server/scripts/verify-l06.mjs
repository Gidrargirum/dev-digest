#!/usr/bin/env node
/**
 * pnpm verify:l06 — the L06 (eval pipeline) acceptance gate (AC-35).
 *
 * Exits non-zero unless ALL of:
 *   1. The seeded "General Reviewer" agent has >= 8 eval cases.
 *   2. Both expectation types (`must_find` / `must_not_flag`) are represented.
 *   3. A batch scores end-to-end against a STUBBED provider — no API keys, no
 *      network — via `ContainerOverrides`, never a module mock.
 *   4. `modules/eval/scorer.ts` performs no provider call — asserted
 *      STRUCTURALLY: its import list contains no adapter/container/provider
 *      import (only `@devdigest/shared`).
 *
 * Reviewed by `security`, but matches no `routing.md` structural rule — it's
 * a test harness, not production code (see the plan's Risks section).
 */
import 'dotenv/config';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { and, eq } from 'drizzle-orm';

import { createDb } from '../src/db/client.js';
import * as t from '../src/db/schema.js';
import { loadConfig } from '../src/platform/config.js';
import { Container } from '../src/platform/container.js';
import { MockLLMProvider } from '../src/adapters/mocks.js';
import { EvalBatchExecutor } from '../src/modules/eval/batch-executor.js';

const serverDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');

let failed = false;
function fail(msg) {
  failed = true;
  console.error(`✗ verify:l06 — ${msg}`);
}
function pass(msg) {
  console.log(`✓ ${msg}`);
}

/** Check 4: scorer.ts's import list is structurally port-free. */
function checkScorerIsPortFree() {
  const scorerPath = resolve(serverDir, 'src/modules/eval/scorer.ts');
  const src = readFileSync(scorerPath, 'utf8');
  const importLines = src
    .split('\n')
    .filter((line) => line.trim().startsWith('import '));
  const offending = importLines.filter((line) => !line.includes("from '@devdigest/shared'"));
  if (offending.length > 0) {
    fail(`scorer.ts imports something other than @devdigest/shared:\n  ${offending.join('\n  ')}`);
    return;
  }
  pass('scorer.ts is port-free — imports only @devdigest/shared, no adapter/container/provider');
}

async function main() {
  checkScorerIsPortFree();

  const config = loadConfig(process.env);
  const { db, close } = createDb(config.databaseUrl);

  try {
    // Checks 1 + 2: seeded cases.
    const [agent] = await db
      .select()
      .from(t.agents)
      .where(eq(t.agents.name, 'General Reviewer'));
    if (!agent) {
      fail('seeded "General Reviewer" agent not found — run `pnpm db:seed` first');
      return;
    }

    const cases = await db
      .select()
      .from(t.evalCases)
      .where(and(eq(t.evalCases.ownerKind, 'agent'), eq(t.evalCases.ownerId, agent.id)));

    if (cases.length < 8) {
      fail(`expected >= 8 seeded eval cases for "General Reviewer", found ${cases.length}`);
      return;
    }
    const types = new Set(cases.map((c) => c.expectationType));
    if (!types.has('must_find') || !types.has('must_not_flag')) {
      fail(`expected both expectation types present, found: ${[...types].join(', ') || 'none'}`);
      return;
    }
    pass(`${cases.length} seeded eval cases for "General Reviewer", both expectation types present`);

    // Check 3: a batch scores end-to-end against a stubbed provider.
    const mockLlm = new MockLLMProvider('openai', {
      structured: { verdict: 'approve', summary: 'looks fine', score: 90, findings: [] },
    });
    const container = new Container(config, db, {
      llm: { [agent.provider]: mockLlm },
    });
    const executor = new EvalBatchExecutor(container);
    const { batch_id } = await executor.runBatch(agent.workspaceId, agent.id);

    // Poll for completion — the executor runs the loop fire-and-forget.
    const deadline = Date.now() + 10_000;
    let batchRow;
    do {
      [batchRow] = await db.select().from(t.evalBatches).where(eq(t.evalBatches.id, batch_id));
      if (batchRow && batchRow.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 25));
    } while (Date.now() < deadline);

    if (!batchRow || batchRow.status === 'running') {
      fail('batch did not finish within 10s');
      return;
    }
    if (batchRow.status !== 'done') {
      fail(`batch finished with status "${batchRow.status}", expected "done"`);
      return;
    }
    const runs = await db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, batch_id));
    if (runs.length !== cases.length) {
      fail(`expected ${cases.length} eval_runs rows for the batch, found ${runs.length}`);
      return;
    }
    pass(`batch ${batch_id} scored end-to-end against a stubbed provider (${runs.length} case run(s))`);
  } finally {
    await close();
  }
}

main()
  .then(() => process.exit(failed ? 1 : 0))
  .catch((err) => {
    console.error('✗ verify:l06 — unexpected error:', err);
    process.exit(1);
  });
