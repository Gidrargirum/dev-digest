#!/usr/bin/env node
/**
 * pnpm verify:l06 — the L06 (eval pipeline) acceptance gate (AC-35, extended
 * by Amendment A's AC-61).
 *
 * Exits non-zero unless ALL of:
 *   1. The seeded "General Reviewer" agent has >= 8 eval cases.
 *   2. Both expectation types (`must_find` / `must_not_flag`) are represented.
 *   3. A batch scores end-to-end against a STUBBED provider — no API keys, no
 *      network — via `ContainerOverrides`, never a module mock.
 *   4. `modules/eval/scorer.ts` performs no provider call — asserted
 *      STRUCTURALLY: its import list contains no adapter/container/provider
 *      import (only `@devdigest/shared`).
 *   5. (Amendment A) The seed carries at least one skill with skill-owned
 *      cases covering both expectation types AND at least one adversarial
 *      case of each polarity (`adversarial-*` naming convention, AC-59/60).
 *   6. (Amendment A) A skill batch scores end-to-end against a stubbed
 *      provider that returns DIFFERENT findings for the `with` and
 *      `without` passes.
 *   7. (Amendment A) The persisted run for such a case carries BOTH passes.
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

    // ---- Amendment A: skill-level evals (AC-61) ----

    // Check 5: seed carries a skill with skill-owned cases covering both
    // expectation types AND both adversarial polarities.
    const skillCaseRows = await db.select().from(t.evalCases).where(eq(t.evalCases.ownerKind, 'skill'));
    const casesBySkill = new Map();
    for (const c of skillCaseRows) {
      if (!casesBySkill.has(c.ownerId)) casesBySkill.set(c.ownerId, []);
      casesBySkill.get(c.ownerId).push(c);
    }
    let targetSkillId;
    let targetCases;
    for (const [skillId, cases] of casesBySkill) {
      const types = new Set(cases.map((c) => c.expectationType));
      const hasAdversarialFind = cases.some(
        (c) => c.name.startsWith('adversarial-') && c.expectationType === 'must_find',
      );
      const hasAdversarialNotFlag = cases.some(
        (c) => c.name.startsWith('adversarial-') && c.expectationType === 'must_not_flag',
      );
      if (types.has('must_find') && types.has('must_not_flag') && hasAdversarialFind && hasAdversarialNotFlag) {
        targetSkillId = skillId;
        targetCases = cases;
        break;
      }
    }
    if (!targetSkillId) {
      fail(
        'expected a skill with skill-owned cases covering both expectation types and both adversarial polarities',
      );
      return;
    }
    const missingBaseline = targetCases.filter((c) => !c.baselineAgentId);
    if (missingBaseline.length > 0) {
      fail(`skill-owned cases missing baseline_agent_id: ${missingBaseline.map((c) => c.name).join(', ')}`);
      return;
    }
    pass(
      `skill ${targetSkillId} has ${targetCases.length} skill-owned cases, both expectation types and both adversarial polarities present`,
    );

    // Check 6 + 7: a skill batch scores end-to-end against a stubbed
    // provider returning DIFFERENT findings for `with`/`without`, and the
    // persisted run carries both passes.
    const [baselineAgentRow] = await db
      .select()
      .from(t.agents)
      .where(eq(t.agents.id, targetCases[0].baselineAgentId));
    if (!baselineAgentRow) {
      fail(`baseline agent ${targetCases[0].baselineAgentId} not found`);
      return;
    }

    // Build a finding that matches an actual must_find case's expectation
    // exactly, so it survives grounding for THAT case's `with` pass — proof
    // the alternation reaches persistence, not just the mock.
    const mustFindCase = targetCases.find((c) => c.expectationType === 'must_find' && !c.name.startsWith('adversarial-'));
    const expected = mustFindCase?.expectedOutput?.[0];
    if (!expected) {
      fail('expected a non-adversarial must_find skill case with at least one expectation');
      return;
    }
    const withFixture = {
      verdict: 'comment',
      summary: 'with the skill under test',
      score: 60,
      findings: [
        {
          id: 'verify-l06-skill-with-1',
          severity: expected.severity,
          category: expected.category,
          title: expected.title,
          file: expected.file,
          start_line: expected.start_line,
          end_line: expected.end_line,
          rationale: 'stub finding for verify:l06',
          confidence: 0.9,
        },
      ],
    };
    const withoutFixture = { verdict: 'approve', summary: 'without the skill under test', score: 95, findings: [] };

    const skillLlm = new MockLLMProvider('openai', {
      structuredSequence: [withFixture, withoutFixture],
    });
    const skillContainer = new Container(config, db, {
      llm: { [baselineAgentRow.provider]: skillLlm },
    });
    const skillExecutor = new EvalBatchExecutor(skillContainer);
    const { batch_id: skillBatchId } = await skillExecutor.runSkillBatch(
      baselineAgentRow.workspaceId,
      targetSkillId,
    );

    const skillDeadline = Date.now() + 10_000;
    let skillBatchRow;
    do {
      [skillBatchRow] = await db.select().from(t.evalBatches).where(eq(t.evalBatches.id, skillBatchId));
      if (skillBatchRow && skillBatchRow.status !== 'running') break;
      await new Promise((r) => setTimeout(r, 25));
    } while (Date.now() < skillDeadline);

    if (!skillBatchRow || skillBatchRow.status === 'running') {
      fail('skill batch did not finish within 10s');
      return;
    }
    if (skillBatchRow.status !== 'done') {
      fail(`skill batch finished with status "${skillBatchRow.status}", expected "done"`);
      return;
    }

    const skillRuns = await db.select().from(t.evalRuns).where(eq(t.evalRuns.batchId, skillBatchId));
    if (skillRuns.length !== targetCases.length) {
      fail(`expected ${targetCases.length} eval_runs rows for the skill batch, found ${skillRuns.length}`);
      return;
    }

    let sawBothPassesEverywhere = true;
    let sawDifference = false;
    for (const run of skillRuns) {
      const actual = run.actualOutput;
      if (!actual || actual.with === undefined || actual.without === undefined) {
        sawBothPassesEverywhere = false;
        continue;
      }
      const withCount = actual.with?.findings?.length ?? 0;
      const withoutCount = actual.without?.findings?.length ?? 0;
      if (withCount !== withoutCount) sawDifference = true;
    }
    if (!sawBothPassesEverywhere) {
      fail('every skill-owned run must persist both the `with` and `without` passes (AC-44)');
      return;
    }
    if (!sawDifference) {
      fail('expected at least one skill-owned run to show different `with`/`without` findings');
      return;
    }
    pass(
      `skill batch ${skillBatchId} scored end-to-end with distinguishable with/without passes (${skillRuns.length} case run(s))`,
    );
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
