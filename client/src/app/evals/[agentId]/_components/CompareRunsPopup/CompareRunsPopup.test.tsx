import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalBatch, AgentVersion } from "@devdigest/shared";
import messages from "../../../../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";
import { CompareRunsPopup } from "./CompareRunsPopup";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

function batch(over: Partial<EvalBatch>): EvalBatch {
  return {
    id: "b",
    agent_id: "ag1",
    agent_version: 1,
    status: "done",
    started_at: "2026-08-01T00:00:00Z",
    finished_at: "2026-08-01T00:01:00Z",
    cases_total: 8,
    cases_passed: 6,
    recall: 0.7,
    precision: 0.9,
    citation_accuracy: 0.8,
    no_flag_rate: null,
    cost_usd: 0.01,
    duration_ms: 9000,
    ...over,
  };
}

const OLDER = batch({ id: "batch7", agent_version: 7, recall: 0.7, precision: 0.9, citation_accuracy: 0.8, cost_usd: 0.01 });
const NEWER = batch({ id: "batch8", agent_version: 8, recall: 0.85, precision: 0.7, citation_accuracy: 0.9, cost_usd: 0.015 });

function agentVersion(version: number, prompt: string): AgentVersion {
  return {
    agent_id: "ag1",
    version,
    created_at: "2026-08-01T00:00:00Z",
    config: {
      provider: "openai",
      model: "gpt-4.1",
      system_prompt: prompt,
      output_schema: null,
      strategy: "single-pass",
      ci_fail_on: "critical",
      repo_intel: true,
      skills: [],
    },
  };
}

function renderPopup() {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/agents/ag1/versions/7")) {
        return { ok: true, status: 200, json: async () => agentVersion(7, "You are a reviewer.\nBe strict.") } as Response;
      }
      if (url.endsWith("/agents/ag1/versions/8")) {
        return {
          ok: true,
          status: 200,
          json: async () => agentVersion(8, "You are a reviewer.\nBe strict about security."),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    }),
  );
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ToastProvider>
          <CompareRunsPopup agentId="ag1" older={OLDER} newer={NEWER} onClose={() => {}} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("CompareRunsPopup", () => {
  it("shows the signed metric deltas and the system_prompt diff between the two versions (AC-28)", async () => {
    renderPopup();

    // Recall rose (+15%), precision fell (-20%, no minus glyph — sign carried
    // in the value itself per Accessibility), citation rose (+10%).
    expect(await screen.findByText("+15%")).toBeInTheDocument();
    expect(screen.getByText("-20%")).toBeInTheDocument();
    expect(screen.getByText("+10%")).toBeInTheDocument();
    expect(screen.getByText("$0.0050")).toBeInTheDocument();

    // The prompt diff renders the added line and the shared line.
    expect(await screen.findByText(/Be strict about security\./)).toBeInTheDocument();
    expect(screen.getByText("You are a reviewer.", { exact: false })).toBeInTheDocument();
  });
});
