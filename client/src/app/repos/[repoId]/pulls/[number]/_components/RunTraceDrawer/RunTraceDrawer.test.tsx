import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.014, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

vi.mock("@/lib/hooks/trace", () => ({
  useRunTrace: vi.fn(() => ({ data: TRACE, isLoading: false })),
}));
vi.mock("@/lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";
import { useRunTrace } from "@/lib/hooks/trace";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("$0.014")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("shows per-document Specs read entries and the full untrusted specs block on expand", () => {
    const SPECS_TEXT =
      "--- .devdigest/specs/rate-limits.md ---\nAll public endpoints must be rate-limited.\n--- end ---";
    vi.mocked(useRunTrace).mockReturnValueOnce({
      data: {
        ...TRACE,
        specs_read: [
          ".devdigest/specs/rate-limits.md · ≈120 tokens",
          ".devdigest/docs/auth.md · ≈340 tokens",
        ],
        prompt_assembly: { ...TRACE.prompt_assembly, specs: SPECS_TEXT },
      },
      isLoading: false,
    } as ReturnType<typeof useRunTrace>);

    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);

    // AC-19: each attached document appears with its own path and token estimate.
    expect(screen.getByText(".devdigest/specs/rate-limits.md · ≈120 tokens")).toBeInTheDocument();
    expect(screen.getByText(".devdigest/docs/auth.md · ≈340 tokens")).toBeInTheDocument();

    // The Prompt assembly section is collapsed by default — open it first.
    fireEvent.click(screen.getByText("Prompt assembly"));

    // AC-20: expanding "Project context — attached specs (untrusted)" shows the
    // exact block text, delimiters included, with no truncation. Match on the
    // raw textContent (a normalizer bypass) since the block is multi-line.
    const exactSpecsText = (_content: string, node: Element | null) => node?.textContent === SPECS_TEXT;
    const specsLabel = screen.getByText("Project context — attached specs (untrusted)");
    expect(screen.queryByText(exactSpecsText)).not.toBeInTheDocument();
    fireEvent.click(specsLabel);
    expect(screen.getByText(exactSpecsText)).toBeInTheDocument();
  });
});
