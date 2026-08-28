import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, ReviewRecord, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { PrBriefCard } from "./PrBriefCard";

const briefMutation = vi.hoisted(() => ({
  mutate: vi.fn(),
  isPending: false,
  isError: false,
}));
const runMutation = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@/lib/hooks/brief", () => ({
  useRegenerateBrief: () => briefMutation,
}));
vi.mock("@/lib/hooks/reviews", () => ({ useRunReview: () => runMutation }));

afterEach(() => {
  cleanup();
  briefMutation.mutate.mockReset();
  briefMutation.isPending = false;
  briefMutation.isError = false;
  runMutation.mutate.mockReset();
  runMutation.isPending = false;
});

const BRIEF: PrBriefRecord = {
  what: "Adds a guarded endpoint.",
  why: "The API needs a safer write path.",
  risk_level: "high",
  risks: [],
  review_focus: [],
  pr_id: "pr-1",
  head_sha: "head-1",
  run_id: "run-1",
  generated_at: "2026-08-28T00:00:00.000Z",
};

const RUN: RunSummary = {
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
};

const REVIEW = { run_id: "run-1", verdict: "approve" } as ReviewRecord;

function renderCard(brief: PrBriefRecord | null = BRIEF) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PrBriefCard
        prId="pr-1"
        state={{ loading: false, error: false, value: brief, onRetry: vi.fn() }}
        metrics={{ runs: [RUN], reviews: [REVIEW] }}
        reviewAction={{ onStart: vi.fn(), onStarted: vi.fn() }}
      />
    </NextIntlClientProvider>,
  );
}

describe("PrBriefCard", () => {
  it("shows the brief, producing-run metrics, verdict, and regenerates without starting a review", async () => {
    renderCard();

    expect(screen.getByText(BRIEF.what)).toBeInTheDocument();
    expect(screen.getByText("Approve")).toBeInTheDocument();
    expect(screen.getByText("3 findings · 1 blockers")).toBeInTheDocument();
    expect(screen.getByText("1,200→340")).toBeInTheDocument();
    expect(screen.getByText("$0.120")).toBeInTheDocument();
    expect(screen.getByText("87")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Regenerate" }));
    expect(briefMutation.mutate).toHaveBeenCalledTimes(1);
    expect(runMutation.mutate).not.toHaveBeenCalled();
  });

  it("keeps the card mounted and turns the regenerate control into retry after failure", () => {
    briefMutation.isError = true;
    renderCard();

    expect(screen.getByText(BRIEF.what)).toBeInTheDocument();
    expect(screen.getByRole("alert")).toHaveTextContent("Failed to load PR Brief");
    expect(screen.getByRole("button", { name: "Retry" })).toBeEnabled();
  });

  it("shows only the run-review nudge when no brief exists", async () => {
    renderCard(null);

    expect(screen.getByText("No PR Brief yet")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Regenerate" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /run review/i }));
    expect(runMutation.mutate).toHaveBeenCalledWith(
      { prId: "pr-1", all: true },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
