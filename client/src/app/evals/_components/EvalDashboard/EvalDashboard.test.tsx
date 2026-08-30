import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalDashboard as EvalDashboardData } from "@devdigest/shared";
import messages from "../../../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";
import { EvalDashboard } from "./EvalDashboard";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const DASHBOARD: EvalDashboardData = {
  agents: [
    {
      agent_id: "ag1",
      agent_name: "Security Reviewer",
      agent_model: "gpt-4.1",
      latest_batch: {
        id: "batch1",
        agent_id: "ag1",
        agent_version: 3,
        owner_kind: "agent",
        owner_id: "ag1",
        skill_version: null,
        marginal: null,
        status: "done",
        started_at: "2026-08-29T00:00:00Z",
        finished_at: "2026-08-29T00:01:00Z",
        cases_total: 8,
        cases_passed: 8,
        recall: 1,
        precision: 1,
        citation_accuracy: 1,
        no_flag_rate: null,
        cost_usd: 0.01,
        duration_ms: 12000,
      },
    },
    {
      agent_id: "ag2",
      agent_name: "Style Reviewer",
      agent_model: "gpt-4o-mini",
      latest_batch: null,
    },
  ],
  recent_runs: [
    {
      id: "run1",
      case_id: "case1",
      case_name: "Detects SQL injection",
      batch_id: "batch1",
      agent_id: "ag1",
      agent_name: "Security Reviewer",
      agent_version: 3,
      ran_at: "2026-08-29T00:01:00Z",
      actual_output: null,
      pass: true,
      recall: 1,
      precision: 1,
      citation_accuracy: 1,
      duration_ms: 1000,
      cost_usd: 0.001,
      matched: [],
      unmatched: [],
    },
  ],
};

function renderDashboard(data: EvalDashboardData) {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/evals/dashboard")) {
        return { ok: true, status: 200, json: async () => data } as Response;
      }
      if (/\/agents\/[^/]+\/eval-runs$/.test(url)) {
        return { ok: true, status: 200, json: async () => [] } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ToastProvider>
          <EvalDashboard />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalDashboard", () => {
  it("shows metrics for an agent with a batch and 'Configure eval cases →' for one with none (AC-31)", async () => {
    renderDashboard(DASHBOARD);

    expect((await screen.findAllByText("Security Reviewer")).length).toBeGreaterThan(0);
    expect(screen.getByText("gpt-4.1")).toBeInTheDocument();
    expect(screen.getByText("RECALL")).toBeInTheDocument();
    expect(screen.getAllByText("100%").length).toBeGreaterThan(0);

    expect(screen.getByText("Style Reviewer")).toBeInTheDocument();
    expect(screen.getByText("gpt-4o-mini")).toBeInTheDocument();
    expect(screen.getByText("Configure eval cases →")).toBeInTheDocument();
  });

  it("renders the Recent runs table with an agent and version column per row (AC-32)", async () => {
    renderDashboard(DASHBOARD);

    expect(await screen.findByText("Detects SQL injection")).toBeInTheDocument();
    const run = DASHBOARD.recent_runs[0]!;
    expect(screen.getAllByText(run.agent_name).length).toBeGreaterThan(0);
    expect(screen.getByText(`v${run.agent_version}`)).toBeInTheDocument();
  });
});
