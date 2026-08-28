import { describe, expect, it } from "vitest";
import type { PrBriefRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import { formatTokens, resolveBriefMetrics } from "./helpers";

const brief = (runId: string | null): PrBriefRecord => ({
  what: "Adds a guarded endpoint.",
  why: "The API needs a safer write path.",
  risk_level: "high",
  risks: [],
  review_focus: [],
  pr_id: "pr-1",
  head_sha: "head-1",
  run_id: runId,
  generated_at: "2026-08-28T00:00:00.000Z",
});

const run = (over: Partial<RunSummary> = {}): RunSummary => ({
  run_id: "run-1",
  agent_id: "agent-1",
  agent_name: "Security",
  provider: "openai",
  model: "gpt-4.1",
  status: "done",
  error: null,
  duration_ms: 1200,
  tokens_in: 1200,
  tokens_out: 340,
  cost_usd: 0.12,
  findings_count: 3,
  grounding: "3/3",
  ran_at: "2026-08-28T10:00:00.000Z",
  score: 87,
  blockers: 1,
  ...over,
});

describe("PR Brief metric helpers", () => {
  it("resolves the producing run and keeps input/output token direction", () => {
    const review = { run_id: "run-1", verdict: "approve" } as ReviewRecord;
    expect(resolveBriefMetrics(brief("run-1"), [run()], [review])).toMatchObject({
      score: 87,
      verdict: "approve",
      findingsCount: 3,
      blockers: 1,
      unknown: false,
    });
    expect(formatTokens(1200, 340)).toBe("1,200→340");
  });

  it("falls back to the newest done run after force regeneration", () => {
    const newest = run({ run_id: "run-new", ran_at: "2026-08-28T11:00:00.000Z", score: null });
    const older = run({ run_id: "run-old", ran_at: "2026-08-28T09:00:00.000Z", score: 50 });
    expect(resolveBriefMetrics(brief(null), [older, newest], [])).toMatchObject({
      score: null,
      findingsCount: 3,
      unknown: false,
    });
  });

  it("never displays metrics from a producing run before it is done", () => {
    const inFlight = run({ run_id: "run-1", status: "running" });
    expect(resolveBriefMetrics(brief("run-1"), [inFlight], [])).toMatchObject({
      score: null,
      findingsCount: null,
      unknown: true,
    });
  });
});
