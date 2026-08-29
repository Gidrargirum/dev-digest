/** PR-aware change detector for the model-backed harness evals. */

import { appendFileSync, existsSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const EVALS_DIR = join(dirname(fileURLToPath(import.meta.url)), "..");
const REPO_ROOT = join(EVALS_DIR, "..");
const SAFE_NAME = /^[a-z0-9][a-z0-9-]*$/;

function hasEvals(root, tier, name) {
  const dir = join(root, "evals", tier, name);
  return existsSync(dir) && readdirSync(dir).some((file) => file.endsWith(".eval.ts"));
}

function directoriesWithEvals(root, tier) {
  const dir = join(root, "evals", tier);
  if (!existsSync(dir)) return [];
  return readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .filter((name) => hasEvals(root, tier, name))
    .sort();
}

function hasArtifact(root, tier, name) {
  return tier === "skills"
    ? existsSync(join(root, ".claude", "skills", name, "SKILL.md"))
    : existsSync(join(root, ".claude", "agents", `${name}.md`));
}

function namesTouched(changed, artifactPattern, evalPattern) {
  const names = new Set();
  for (const file of changed) {
    const match = file.match(artifactPattern) ?? file.match(evalPattern);
    if (match) names.add(match[1]);
  }
  return [...names].sort();
}

export function detect(changed, root = REPO_ROOT, { forceScope } = {}) {
  const fullRun =
    forceScope === "all" ||
    changed.some(
    (file) =>
      /^evals\/(?:src|scripts|proxy)\//.test(file) ||
      /^evals\/(?:package\.json|pnpm-lock\.yaml|pnpm-workspace\.yaml|tsconfig\.json|vitest\.config\.ts)$/.test(file) ||
      file === ".github/workflows/evals.yml",
    );
  const touchedSkills = namesTouched(
    changed,
    /^\.claude\/skills\/([^/]+)\//,
    /^evals\/skills\/([^/]+)\//,
  );
  const touchedAgents = namesTouched(
    changed,
    /^\.claude\/agents\/(?!README\.md$)([^/]+)\.md$/,
    /^evals\/agents\/([^/]+)\//,
  );
  const candidateSkills = fullRun ? directoriesWithEvals(root, "skills") : touchedSkills;
  const candidateAgents = fullRun ? directoriesWithEvals(root, "agents") : touchedAgents;
  const skills = candidateSkills.filter((name) =>
    SAFE_NAME.test(name) && hasEvals(root, "skills", name) && hasArtifact(root, "skills", name),
  );
  const agents = candidateAgents.filter((name) =>
    SAFE_NAME.test(name) && hasEvals(root, "agents", name) && hasArtifact(root, "agents", name),
  );
  const skippedSkills = touchedSkills.filter((name) => !hasEvals(root, "skills", name));
  const skippedAgents = touchedAgents.filter((name) => !hasEvals(root, "agents", name));
  const integrityCandidates = fullRun
    ? { skills: directoriesWithEvals(root, "skills"), agents: directoriesWithEvals(root, "agents") }
    : { skills: touchedSkills.filter((name) => hasEvals(root, "skills", name)), agents: touchedAgents.filter((name) => hasEvals(root, "agents", name)) };
  const integrityErrors = [
    ...integrityCandidates.skills
      .filter((name) => !SAFE_NAME.test(name) || !hasArtifact(root, "skills", name))
      .map((name) => `skill/${name}: missing .claude/skills/${name}/SKILL.md`),
    ...integrityCandidates.agents
      .filter((name) => !SAFE_NAME.test(name) || !hasArtifact(root, "agents", name))
      .map((name) => `agent/${name}: missing .claude/agents/${name}.md`),
  ];
  const instructionsChanged = changed.some((file) => /(^|\/)(?:AGENTS|CLAUDE)\.md$/.test(file));
  const agentArtifactChanged = changed.some((file) => /^\.claude\/agents\/(?!README\.md$)[^/]+\.md$/.test(file));
  const harnessConfigChanged = changed.some((file) =>
    /^\.claude\/(?:settings[^/]*\.json|hooks\/|commands\/)/.test(file),
  );
  const workflowChanged = changed.some((file) => /^evals\/workflow\//.test(file));
  const runWorkflow =
    forceScope === "workflow" || fullRun || instructionsChanged || agentArtifactChanged || harnessConfigChanged || workflowChanged;
  const matrix = {
    include: [
      ...skills.map((name) => ({ tier: "skill", name, path: `skills/${name}` })),
      ...agents.map((name) => ({ tier: "agent", name, path: `agents/${name}` })),
      ...(runWorkflow ? [{ tier: "workflow", name: "general", path: "workflow" }] : []),
    ],
  };

  return {
    matrix,
    skills,
    agents,
    runWorkflow,
    skippedSkills,
    skippedAgents,
    integrityErrors,
    fullRun,
    hasWork: skills.length > 0 || agents.length > 0 || runWorkflow,
  };
}

export function formatSummary(result, changedCount) {
  const lines = [
    "## Harness eval selection",
    "",
    `Changed files: ${changedCount}`,
    `- Skills: ${result.skills.join(", ") || "none"}`,
    `- Agents: ${result.agents.join(", ") || "none"}`,
    `- General workflow: ${result.runWorkflow ? "run" : "skip"}`,
  ];
  for (const name of result.skippedSkills) lines.push(`- SKIP skill/${name}: no matching *.eval.ts`);
  for (const name of result.skippedAgents) lines.push(`- SKIP agent/${name}: no matching *.eval.ts`);
  lines.push(`- Matrix: ${result.matrix.include.map((suite) => `${suite.tier}/${suite.name}`).join(", ") || "empty"}`);
  for (const problem of result.integrityErrors) lines.push(`- ERROR invalid eval ${problem}`);
  return `${lines.join("\n")}\n`;
}

function writeOutput(key, value) {
  const output = process.env.GITHUB_OUTPUT;
  if (output) appendFileSync(output, `${key}=${value}\n`);
  else console.log(`${key}=${value}`);
}

function main() {
  const changed = (process.env.CHANGED_FILES ?? "")
    .split("\n")
    .map((file) => file.trim())
    .filter(Boolean);
  const forceScope = process.env.FORCE_SCOPE || undefined;
  const result = detect(changed, REPO_ROOT, { forceScope });
  writeOutput("matrix", JSON.stringify(result.matrix));
  writeOutput("skills", JSON.stringify(result.skills));
  writeOutput("agents", JSON.stringify(result.agents));
  writeOutput("run_workflow", String(result.runWorkflow));
  writeOutput("has_work", String(result.hasWork));
  writeOutput("skipped_skills", JSON.stringify(result.skippedSkills));
  writeOutput("skipped_agents", JSON.stringify(result.skippedAgents));
  writeOutput("integrity_errors", JSON.stringify(result.integrityErrors));
  const summary = formatSummary(result, changed.length);
  process.stderr.write(summary);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
