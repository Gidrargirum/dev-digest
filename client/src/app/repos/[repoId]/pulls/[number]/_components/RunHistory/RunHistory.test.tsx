/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: null,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(runs: RunSummary[], findingsByRun?: Map<string, FindingRecord[]>) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory runs={runs} findingsByRun={findingsByRun} onOpenTrace={() => {}} />
    </NextIntlClientProvider>,
  );
}

function finding(id: string, severity: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id,
    review_id: "r1",
    severity: severity as FindingRecord["severity"],
    category: "perf",
    title: `${severity} in this run`,
    file: "src/api/users.ts",
    start_line: 45,
    end_line: 52,
    rationale: "The loop calls the DB once per user.",
    confidence: 0.86,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });
});

describe("RunHistory — per-run findings breakdown", () => {
  it("shows severity counters for the run, dismissed findings excluded", () => {
    renderRuns(
      [run({ status: "done", findings_count: 3, blockers: 2, score: 38 })],
      new Map([
        [
          "run-1",
          [
            finding("f1", "CRITICAL"),
            finding("f2", "CRITICAL"),
            finding("f3", "WARNING"),
            finding("f4", "WARNING", { dismissed_at: "2026-06-14T00:00:00.000Z" }),
          ],
        ],
      ]),
    );
    expect(screen.getByLabelText("Critical: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Warning: 1")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Suggestion/)).not.toBeInTheDocument();
    // The blocker suffix stays next to the counters.
    expect(screen.getByText(/2 blockers/)).toBeInTheDocument();
  });

  it("opens a popover listing this run's findings", async () => {
    renderRuns(
      [run({ status: "done", findings_count: 1, blockers: 1, score: 38 })],
      new Map([["run-1", [finding("f1", "CRITICAL")]]]),
    );
    fireEvent.mouseEnter(screen.getByRole("button", { name: "Show findings" }));
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument());
    expect(screen.getByText("1 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("CRITICAL in this run")).toBeInTheDocument();
    expect(screen.getByText("src/api/users.ts:45-52")).toBeInTheDocument();
  });

  it("falls back to the run's denormalized count when no review is loaded", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("3 finding(s)")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Show findings" })).not.toBeInTheDocument();
  });
});
