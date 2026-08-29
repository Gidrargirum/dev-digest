import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalCase, EvalBatch, EvalRunRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";
import { EvalsTab } from "./EvalsTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

const CASE: EvalCase = {
  id: "case1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "stripe-key-leak",
  input_diff: "",
  input_files: [],
  input_meta: {},
  expectation_type: "must_find",
  expected_output: [
    { file: "src/config.ts", start_line: 11, end_line: 11, severity: "CRITICAL", category: "security", title: "Hardcoded Stripe secret key" },
  ],
  notes: null,
};

const BATCH: EvalBatch = {
  id: "batch1",
  agent_id: "ag1",
  agent_version: 3,
  status: "done",
  started_at: "2026-08-29T00:00:00Z",
  finished_at: "2026-08-29T00:01:00Z",
  cases_total: 1,
  cases_passed: 1,
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  no_flag_rate: null,
  cost_usd: 0.002,
  duration_ms: 6000,
};

const RUN_RECORD: EvalRunRecord = {
  id: "run1",
  case_id: "case1",
  case_name: "stripe-key-leak",
  batch_id: "batch1",
  ran_at: "2026-08-29T00:01:00Z",
  actual_output: {},
  pass: true,
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  duration_ms: 1200,
  cost_usd: 0.002,
  matched: CASE.expected_output,
  unmatched: [],
};

function mockFetch(routes: { cases: EvalCase[]; batches: EvalBatch[]; runs: EvalRunRecord[] }) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/agents/ag1/eval-cases")) {
        return { ok: true, status: 200, json: async () => routes.cases } as Response;
      }
      if (url.endsWith("/agents/ag1/eval-runs")) {
        return { ok: true, status: 200, json: async () => routes.batches } as Response;
      }
      if (url.endsWith("/eval-runs/batch1")) {
        return { ok: true, status: 200, json: async () => ({ batch: routes.batches[0], runs: routes.runs }) } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
}

function renderTab() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ToastProvider>
          <EvalsTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalsTab", () => {
  it("lists each case with its badge, recall summary and actions (AC-10)", async () => {
    mockFetch({ cases: [CASE], batches: [BATCH], runs: [RUN_RECORD] });
    renderTab();

    expect(await screen.findByText("stripe-key-leak")).toBeInTheDocument();
    expect(screen.getByText("MUST FIND")).toBeInTheDocument();
    expect(await screen.findByText("expected 1 finding(s), got 1 · recall 100%")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Run" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Edit" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Delete" })).toBeInTheDocument();
  });

  it("renders the empty state with no metric cards when the agent has no eval cases (AC-11)", async () => {
    mockFetch({ cases: [], batches: [], runs: [] });
    renderTab();

    expect(
      await screen.findByText("No eval cases yet. Create one to assert this agent's expected findings on a sample diff."),
    ).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText("RECALL")).not.toBeInTheDocument());
    expect(screen.queryByText("PRECISION")).not.toBeInTheDocument();
    expect(screen.queryByText("CITATION ACCURACY")).not.toBeInTheDocument();
  });
});
