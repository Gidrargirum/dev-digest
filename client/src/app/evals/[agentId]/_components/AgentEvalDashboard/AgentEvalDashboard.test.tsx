import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { Agent, EvalBatch, EvalCase } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";
import { AgentEvalDashboard } from "./AgentEvalDashboard";

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

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
  version: 8,
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
  expected_output: [],
  notes: null,
};

function batch(over: Partial<EvalBatch>): EvalBatch {
  return {
    id: "b",
    agent_id: "ag1",
    agent_version: 8,
    owner_kind: "agent",
    owner_id: "ag1",
    skill_version: null,
    marginal: null,
    status: "done",
    started_at: "2026-08-01T00:00:00Z",
    finished_at: "2026-08-01T00:01:00Z",
    cases_total: 8,
    cases_passed: 6,
    recall: 0.8,
    precision: 0.9,
    citation_accuracy: 0.85,
    no_flag_rate: null,
    cost_usd: 0.01,
    duration_ms: 9000,
    ...over,
  };
}

// Newest-first, as the API returns them.
const LATEST = batch({ id: "batch3", agent_version: 8, precision: 0.6, started_at: "2026-08-29T00:00:00Z" });
const PREVIOUS = batch({ id: "batch2", agent_version: 7, precision: 0.9, started_at: "2026-08-15T00:00:00Z" });
const OLDEST = batch({ id: "batch1", agent_version: 6, precision: 0.85, started_at: "2026-08-01T00:00:00Z" });
const BATCHES = [LATEST, PREVIOUS, OLDEST];

function renderDashboard() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/agents/ag1/eval-runs")) {
        return { ok: true, status: 200, json: async () => BATCHES } as Response;
      }
      if (url.endsWith("/agents/ag1/eval-cases")) {
        return { ok: true, status: 200, json: async () => [CASE] } as Response;
      }
      if (url.endsWith("/agents/ag1")) {
        return { ok: true, status: 200, json: async () => AGENT } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <AgentEvalDashboard agentId="ag1" />
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("AgentEvalDashboard", () => {
  it("renders the trend chart and precision-regression banner from ≥2 batches, and enables Compare only at exactly two selections (AC-27/AC-30/AC-33)", async () => {
    renderDashboard();

    // AC-33: latest batch's precision (60%) fell vs. the previous (90%).
    expect(await screen.findByText("Precision dropped -30% vs. the previous run")).toBeInTheDocument();

    // AC-30: ≥2 batches renders the trend chart section.
    expect(screen.getByText("Metric trend")).toBeInTheDocument();

    // AC-27: Compare starts disabled, stays disabled at one selection, and
    // enables at exactly two.
    const compareBtn = screen.getByRole("button", { name: "Compare" });
    expect(compareBtn).toBeDisabled();

    const checkboxes = screen.getAllByRole("checkbox");
    expect(checkboxes).toHaveLength(3);
    fireEvent.click(checkboxes[0]!);
    expect(compareBtn).toBeDisabled();
    fireEvent.click(checkboxes[1]!);
    expect(compareBtn).toBeEnabled();
  });
});
