import { describe, expect, it, vi } from "vitest";
import { EVAL_JUDGE_MODEL } from "../config.js";

const runContent = vi.fn().mockResolvedValue({
  text: '{"results":[{"practice":"grounded","passed":true,"evidence":"grounded"}]}',
});

vi.mock("../runtime/dispatch.js", () => ({ runContent }));

describe("llmJudge model boundary", () => {
  it("passes EVAL_JUDGE_MODEL to the content runner", async () => {
    const { llmJudge } = await import("./llm-judge.js");
    await llmJudge("grounded", ["grounded"]);
    expect(runContent).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ model: EVAL_JUDGE_MODEL }),
    );
  });
});
