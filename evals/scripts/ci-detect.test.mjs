import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { detect, formatSummary } from "./ci-detect.mjs";

function fixture({ skills = [], agents = [], orphanAgents = [] } = {}) {
  const root = mkdtempSync(join(tmpdir(), "eval-detect-"));
  for (const skill of skills) {
    mkdirSync(join(root, ".claude", "skills", skill), { recursive: true });
    writeFileSync(join(root, ".claude", "skills", skill, "SKILL.md"), "# skill\n");
    mkdirSync(join(root, "evals", "skills", skill), { recursive: true });
    writeFileSync(join(root, "evals", "skills", skill, `${skill}.eval.ts`), "");
  }
  for (const agent of agents) {
    mkdirSync(join(root, ".claude", "agents"), { recursive: true });
    writeFileSync(join(root, ".claude", "agents", `${agent}.md`), "# agent\n");
    mkdirSync(join(root, "evals", "agents", agent), { recursive: true });
    writeFileSync(join(root, "evals", "agents", agent, `${agent}.eval.ts`), "");
  }
  for (const agent of orphanAgents) {
    mkdirSync(join(root, "evals", "agents", agent), { recursive: true });
    writeFileSync(join(root, "evals", "agents", agent, `${agent}.eval.ts`), "");
  }
  return root;
}

test("selects a changed skill and explicitly skips a skill without evals", () => {
  const root = fixture({ skills: ["security"] });
  mkdirSync(join(root, ".claude", "skills", "new-skill"), { recursive: true });
  writeFileSync(join(root, ".claude", "skills", "new-skill", "SKILL.md"), "");
  const result = detect([".claude/skills/security/SKILL.md", ".claude/skills/new-skill/SKILL.md"], root);
  assert.deepEqual(result.skills, ["security"]);
  assert.deepEqual(result.skippedSkills, ["new-skill"]);
  assert.deepEqual(result.matrix.include, [{ tier: "skill", name: "security", path: "skills/security" }]);
  assert.match(formatSummary(result, 2), /SKIP skill\/new-skill: no matching \*\.eval\.ts/);
});

test("an agent change selects its eval and the general workflow", () => {
  const root = fixture({ agents: ["reviewer"] });
  const result = detect([".claude/agents/reviewer.md"], root);
  assert.deepEqual(result.agents, ["reviewer"]);
  assert.equal(result.runWorkflow, true);
  assert.deepEqual(result.matrix.include, [
    { tier: "agent", name: "reviewer", path: "agents/reviewer" },
    { tier: "workflow", name: "general", path: "workflow" },
  ]);
});

test("an agent without evals is skipped while the general workflow still runs", () => {
  const root = fixture();
  mkdirSync(join(root, ".claude", "agents"), { recursive: true });
  writeFileSync(join(root, ".claude", "agents", "new-agent.md"), "# agent\n");
  const result = detect([".claude/agents/new-agent.md"], root);
  assert.deepEqual(result.skippedAgents, ["new-agent"]);
  assert.deepEqual(result.matrix.include, [{ tier: "workflow", name: "general", path: "workflow" }]);
});

test("a deleted agent still selects the workflow and exposes the invalid targeted eval", () => {
  const root = fixture({ orphanAgents: ["removed"] });
  const result = detect([".claude/agents/removed.md"], root);
  assert.equal(result.runWorkflow, true);
  assert.deepEqual(result.agents, []);
  assert.deepEqual(result.integrityErrors, ["agent/removed: missing .claude/agents/removed.md"]);
});

test("nested instruction changes select only the workflow", () => {
  const root = fixture();
  for (const file of ["AGENTS.md", "server/AGENTS.md", "client/CLAUDE.md"]) {
    assert.equal(detect([file], root).runWorkflow, true, file);
  }
});

test("settings, hooks, and commands changes select one workflow suite", () => {
  const root = fixture();
  for (const file of [
    ".claude/settings.json",
    ".claude/settings.local.json",
    ".claude/hooks/pre-tool.mjs",
    ".claude/commands/review.md",
    "evals/workflow/review-workflow.eval.ts",
  ]) {
    const result = detect([file], root);
    assert.deepEqual(result.matrix.include, [{ tier: "workflow", name: "general", path: "workflow" }], file);
  }
});

test("the agents README is not treated as an agent or workflow change", () => {
  const result = detect([".claude/agents/README.md"], fixture());
  assert.deepEqual(result.skippedAgents, []);
  assert.deepEqual(result.matrix.include, []);
});

test("targeted eval file changes select their matching suite", () => {
  const root = fixture({ skills: ["security"], agents: ["reviewer"] });
  assert.deepEqual(detect(["evals/skills/security/security.eval.ts"], root).matrix.include, [
    { tier: "skill", name: "security", path: "skills/security" },
  ]);
  assert.deepEqual(detect(["evals/agents/reviewer/reviewer.eval.ts"], root).matrix.include, [
    { tier: "agent", name: "reviewer", path: "agents/reviewer" },
  ]);
});

test("shared engine changes select all runnable suites and report orphan evals", () => {
  const root = fixture({ skills: ["security"], agents: ["reviewer"], orphanAgents: ["orphan"] });
  const result = detect(["evals/src/config.ts"], root);
  assert.deepEqual(result.skills, ["security"]);
  assert.deepEqual(result.agents, ["reviewer"]);
  assert.equal(result.runWorkflow, true);
  assert.deepEqual(result.integrityErrors, ["agent/orphan: missing .claude/agents/orphan.md"]);
  assert.match(formatSummary(result, 1), /ERROR invalid eval agent\/orphan/);
});

test("all shared engine and CI paths invalidate every suite", () => {
  const root = fixture({ skills: ["security"], agents: ["reviewer"] });
  for (const file of [
    "evals/src/config.ts",
    "evals/scripts/ci-detect.mjs",
    "evals/proxy/litellm.config.yaml",
    "evals/package.json",
    "evals/pnpm-lock.yaml",
    "evals/pnpm-workspace.yaml",
    "evals/tsconfig.json",
    "evals/vitest.config.ts",
    ".github/workflows/evals.yml",
  ]) {
    const result = detect([file], root);
    assert.equal(result.fullRun, true, file);
    assert.equal(result.matrix.include.length, 3, file);
  }
});

test("matrix output is safe JSON and manual scopes are deterministic", () => {
  const root = fixture({ skills: ["security"], agents: ["reviewer"] });
  const all = detect([], root, { forceScope: "all" });
  assert.deepEqual(JSON.parse(JSON.stringify(all.matrix)), all.matrix);
  assert.equal(all.matrix.include.length, 3);
  assert.deepEqual(detect([], root, { forceScope: "workflow" }).matrix.include, [
    { tier: "workflow", name: "general", path: "workflow" },
  ]);
});

test("an unrelated change selects no model work", () => {
  assert.equal(detect(["server/src/app.ts"], fixture()).hasWork, false);
});
