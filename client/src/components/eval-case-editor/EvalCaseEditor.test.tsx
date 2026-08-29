import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { EvalCase, EvalRun } from "@devdigest/shared";
import messages from "../../../messages/en/eval.json";
import { ToastProvider } from "@/lib/toast";
import { EvalCaseEditor } from "./EvalCaseEditor";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const EVAL_CASE: EvalCase = {
  id: "case1",
  owner_kind: "agent",
  owner_id: "ag1",
  name: "stripe-key-leak",
  input_diff: "--- a/src/config.ts\n+++ b/src/config.ts\n@@ -10,6 +10,7 @@\n+  stripeKey: \"sk_live_...\"",
  input_files: ["src/config.ts"],
  input_meta: { title: "Add Stripe integration", body: "Wire up payments via Stripe SDK." },
  expectation_type: "must_find",
  expected_output: [
    { file: "src/config.ts", start_line: 11, end_line: 11, severity: "CRITICAL", category: "security", title: "Hardcoded Stripe secret key" },
  ],
  notes: null,
};

const RUN_RESULT: EvalRun = {
  recall: 1,
  precision: 1,
  citation_accuracy: 1,
  no_flag_rate: null,
  traces_passed: 1,
  traces_total: 1,
  duration_ms: 1200,
  cost_usd: 0.002,
  per_trace: [],
};

function renderEditor(props: Partial<React.ComponentProps<typeof EvalCaseEditor>> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ eval: messages }}>
        <ToastProvider>
          <EvalCaseEditor agentId="ag1" evalCase={EVAL_CASE} onClose={() => {}} {...props} />
        </ToastProvider>
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("EvalCaseEditor", () => {
  it("disables Save and Run case while the expected_output textarea holds unparseable JSON (AC-8)", () => {
    renderEditor();

    const saveBtn = screen.getByRole("button", { name: "Save" });
    const runBtn = screen.getByRole("button", { name: "Run case" });
    // Valid JSON (the seeded expected_output) keeps both enabled.
    expect(saveBtn).toBeEnabled();
    expect(runBtn).toBeEnabled();
    expect(screen.getByText("valid JSON")).toBeInTheDocument();

    const expectedOutputBox = screen.getByRole("textbox", { name: /expected output/i });
    fireEvent.change(expectedOutputBox, { target: { value: "{not valid json" } });

    expect(screen.getByText("invalid JSON")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Run case" })).toBeDisabled();
  });

  it("reads 'Never run yet' until the case is run, then renders the scored Actual output (AC-9)", async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const url = String(input);
      if (url.endsWith("/eval-cases/case1/run")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({ run_id: "run1", case_id: "case1", result: RUN_RESULT }),
        } as Response;
      }
      throw new Error(`unexpected fetch: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    renderEditor();

    expect(screen.getByText("Never run yet")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Run case" }));

    await waitFor(() => expect(screen.queryByText("Never run yet")).not.toBeInTheDocument());
    expect(screen.getByText("recall 100% · precision 100% · citation 100% · 1.2s")).toBeInTheDocument();
  });
});
