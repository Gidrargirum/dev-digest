import { describe, expect, it } from "vitest";
import { resolveModels } from "./config.js";

describe("resolveModels", () => {
  it("uses the OpenRouter tier defaults", () => {
    expect(resolveModels({ EVAL_BACKEND: "openrouter" })).toEqual({
      content: "deepseek/deepseek-v4-flash-0731",
      tool: "google/gemini-2.5-flash",
      judge: "google/gemini-2.5-flash",
    });
  });

  it("keeps EVAL_MODEL as a backwards-compatible fallback", () => {
    expect(resolveModels({ EVAL_BACKEND: "openrouter", EVAL_MODEL: "vendor/legacy" })).toEqual({
      content: "vendor/legacy",
      tool: "vendor/legacy",
      judge: "vendor/legacy",
    });
  });

  it("lets tier-specific variables override the fallback independently", () => {
    expect(resolveModels({
      EVAL_BACKEND: "openrouter",
      EVAL_MODEL: "vendor/legacy",
      EVAL_CONTENT_MODEL: "vendor/content",
      EVAL_TOOL_MODEL: "vendor/tool",
      EVAL_JUDGE_MODEL: "vendor/judge",
    })).toEqual({ content: "vendor/content", tool: "vendor/tool", judge: "vendor/judge" });
  });
});
