/**
 * Content-tier runner selection. Content-only calls (skillTask, the LLM judge) can run on any
 * OpenAI-compatible backend, so under EVAL_BACKEND=openrouter content-only calls go direct
 * through run-openrouter. A procedural skill with tools uses the Agent SDK + translating proxy.
 *
 * Tool-using tiers (agentTask, workflowTask) do NOT use this — they call runClaude directly,
 * because only the Agent SDK produces the subagent/skill/file-read trace they assert on.
 */

import { runClaude, type Result, type RunOptions } from "./run-claude.js";
import { runOpenRouter } from "./run-openrouter.js";

const BACKEND = process.env.EVAL_BACKEND ?? "subscription";

export function runContent(prompt: string, opts: RunOptions = {}): Promise<Result> {
  if (BACKEND === "openrouter") {
    if (opts.allowedTools?.length) {
      return runClaude(prompt, opts);
    }
    return runOpenRouter(prompt, opts);
  }
  return runClaude(prompt, opts);
}
