import { beforeEach, describe, expect, it, vi } from "vitest";

const runClaude = vi.fn();
const runOpenRouter = vi.fn();

vi.mock("./run-claude.js", () => ({ runClaude }));
vi.mock("./run-openrouter.js", () => ({ runOpenRouter }));

describe("runContent on OpenRouter", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.stubEnv("EVAL_BACKEND", "openrouter");
    runClaude.mockReset();
    runOpenRouter.mockReset();
  });

  it("routes a content-only skill directly to OpenRouter", async () => {
    const { runContent } = await import("./dispatch.js");
    await runContent("prompt", { allowedTools: [] });
    expect(runOpenRouter).toHaveBeenCalledOnce();
    expect(runClaude).not.toHaveBeenCalled();
  });

  it("routes a tool-using skill through the Agent SDK bridge", async () => {
    const { runContent } = await import("./dispatch.js");
    await runContent("prompt", { allowedTools: ["Read"] });
    expect(runClaude).toHaveBeenCalledOnce();
    expect(runOpenRouter).not.toHaveBeenCalled();
  });
});
