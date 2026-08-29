/**
 * All tunables in one place. No logic here — just the knobs the rest of the package reads.
 * Nothing in this module imports from another src module (it is the bottom of the dependency
 * graph): config knows nothing of runtime, scoring, or the SDK.
 */

// --- Models -----------------------------------------------------------------
// EVAL_MODEL remains the backwards-compatible override for every tier. The tier-specific knobs
// let CI use a cheap content model while reserving a tool-capable model for Agent SDK sessions.
export function resolveModels(env: NodeJS.ProcessEnv = process.env) {
  const openrouter = (env.EVAL_BACKEND ?? "subscription") === "openrouter";
  const fallback = env.EVAL_MODEL;
  return {
    content:
      env.EVAL_CONTENT_MODEL ??
      fallback ??
      (openrouter ? "deepseek/deepseek-v4-flash-0731" : "claude-haiku-4-5"),
    tool:
      env.EVAL_TOOL_MODEL ??
      fallback ??
      (openrouter ? "google/gemini-2.5-flash" : "claude-haiku-4-5"),
    judge:
      env.EVAL_JUDGE_MODEL ??
      fallback ??
      (openrouter ? "google/gemini-2.5-flash" : "claude-sonnet-5"),
  };
}

const MODELS = resolveModels();
export const EVAL_CONTENT_MODEL = MODELS.content;
export const EVAL_TOOL_MODEL = MODELS.tool;
export const EVAL_MODEL = EVAL_TOOL_MODEL;
export const EVAL_JUDGE_MODEL = MODELS.judge;
export const MAX_TURNS = Number(process.env.EVAL_MAX_TURNS ?? "8");

// --- Configuration tag ------------------------------------------------------
// "candidate" = artifact injected (normal). "baseline" = no artifact (benchmark lift baseline).
export const EVAL_CONFIG = process.env.EVAL_CONFIG ?? "candidate";
export const IS_BASELINE = EVAL_CONFIG === "baseline";

// --- Scoring / statistics thresholds ---------------------------------------
export const DEFAULT_THRESHOLD = 0.6; // judge score gate for a quality case
export const FLAKY_LOW = 0.2; // pass rate strictly inside (20%, 80%) is "flaky"
export const FLAKY_HIGH = 0.8;
export const COST_REGRESSION_RATIO = 1.25; // candidate mean tokens > 125% of baseline

// --- Tool allow-lists -------------------------------------------------------
// Subagent-spawning tool name varies by harness; count both.
export const SPAWN_TOOLS = new Set(["Task", "Agent"]);
// workflowTask runs against the LIVE repo with bypassPermissions — keep this read-only.
export const WORKFLOW_ALLOWED_TOOLS = ["Read", "Grep", "Glob", "Task", "Agent", "Skill"];

// --- Output verbosity -------------------------------------------------------
// Set EVAL_QUIET to suppress per-run trace/verdict spam during multi-run aggregation.
export const QUIET = Boolean(process.env.EVAL_QUIET);
