import { describe, expect, it } from "vitest";
import { EVAL_CONTENT_MODEL, EVAL_TOOL_MODEL } from "../config.js";
import { resolveClaudeModel } from "./run-claude.js";
import { resolveOpenRouterModel } from "./run-openrouter.js";

describe("runtime model boundaries", () => {
  it("uses EVAL_CONTENT_MODEL for direct OpenRouter calls", () => {
    expect(resolveOpenRouterModel()).toBe(EVAL_CONTENT_MODEL);
    expect(resolveOpenRouterModel({ model: "override/content" })).toBe("override/content");
  });

  it("uses EVAL_TOOL_MODEL for Claude Agent SDK calls", () => {
    expect(resolveClaudeModel()).toBe(EVAL_TOOL_MODEL);
    expect(resolveClaudeModel({ model: "override/tool" })).toBe("override/tool");
  });
});
