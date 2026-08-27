import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrWhyRiskBrief } from "@/lib/types";
import { ApiError } from "@/lib/api";
import messages from "../../../../../../../../../../messages/en/prReview.json";

// The card reaches brief data only through the hooks layer (AC-34); the hook
// is the boundary we mock, never the card's own internals.
type QueryState = {
  data: { brief: PrWhyRiskBrief | null } | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
};
type MutationState = {
  mutate: ReturnType<typeof vi.fn>;
  isPending: boolean;
  error: unknown;
};

let query: QueryState;
let mutation: MutationState;

vi.mock("@/lib/hooks", () => ({
  usePrWhyRiskBrief: () => query,
  useRegeneratePrBrief: () => mutation,
}));

import { WhyRiskBriefCard } from "./WhyRiskBriefCard";

afterEach(cleanup);

function brief(over: Partial<PrWhyRiskBrief> = {}): PrWhyRiskBrief {
  return {
    pr_id: "pr1",
    what: "Adds a token-bucket rate limiter to the public API.",
    why: "Public endpoints are currently unthrottled and abusable.",
    risk_level: "high",
    risks: [
      {
        title: "HIDDEN_RISK_TITLE",
        detail: null,
        path: "src/limiter.ts",
        line: 20,
        endpoint: null,
      },
    ],
    review_focus: [
      { path: "src/limiter.ts", line: 12, reason: "check the refill math" },
    ],
    risks_total: 1,
    review_focus_total: 1,
    sources: ["pr_title", "pr_files"],
    pr_state_key: "state-a",
    model: "openai/gpt-4.1",
    computed_at: "2026-08-27T00:00:00.000Z",
    ...over,
  };
}

function renderCard(onOpenLine = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <WhyRiskBriefCard prId="pr1" onOpenLine={onOpenLine} />
    </NextIntlClientProvider>,
  );
  return onOpenLine;
}

describe("WhyRiskBriefCard", () => {
  it("shows a skeleton while the first request is in flight, then the error state with a working retry that keeps the card mounted", () => {
    const refetch = vi.fn();
    query = { data: undefined, isLoading: true, isError: false, refetch };
    mutation = { mutate: vi.fn(), isPending: false, error: null };
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <WhyRiskBriefCard prId="pr1" onOpenLine={vi.fn()} />
      </NextIntlClientProvider>,
    );

    // Skeleton: the frame is there, but neither content nor an error alert.
    expect(screen.getByText("Why + Risk Brief")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText(/token-bucket/)).not.toBeInTheDocument();

    query = { data: undefined, isLoading: false, isError: true, refetch };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <WhyRiskBriefCard prId="pr1" onOpenLine={vi.fn()} />
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("alert")).toBeInTheDocument();
    // The card itself did not disappear (AC-32).
    expect(screen.getByText("Why + Risk Brief")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Retry" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("offers an explicit regenerate action when no brief exists yet (AC-33)", () => {
    query = { data: { brief: null }, isLoading: false, isError: false, refetch: vi.fn() };
    mutation = { mutate: vi.fn(), isPending: false, error: null };
    renderCard();

    expect(screen.getByText("No brief generated yet")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Generate brief" }));
    expect(mutation.mutate).toHaveBeenCalledTimes(1);
  });

  it("renders what/why, a non-colour risk-level cue, keyboard-reachable Review Focus entries that navigate, the truncation count, and never a second copy of risks[]", () => {
    query = {
      data: {
        brief: brief({
          review_focus: [
            { path: "src/limiter.ts", line: 12, reason: "check the refill math" },
          ],
          review_focus_total: 4,
        }),
      },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    mutation = { mutate: vi.fn(), isPending: false, error: null };
    const onOpenLine = renderCard();

    expect(screen.getByText(/token-bucket rate limiter/)).toBeInTheDocument();
    expect(screen.getByText(/currently unthrottled/)).toBeInTheDocument();

    // AC-26: the level is readable without colour — a text label.
    expect(screen.getByText("High risk")).toBeInTheDocument();

    // AC-27: a real <button> whose accessible name carries the file path.
    const entry = screen.getByRole("button", { name: /src\/limiter\.ts/ });
    fireEvent.click(entry);
    expect(onOpenLine).toHaveBeenCalledWith("src/limiter.ts", 12);

    // AC-35: the list must not read as exhaustive.
    expect(screen.getByText("Showing 1 of 4")).toBeInTheDocument();

    // AC-24: risks[] live only in the Intent block, never here.
    expect(screen.queryByText("HIDDEN_RISK_TITLE")).not.toBeInTheDocument();
  });

  it("keeps the regenerate control's two disabled states distinct: in-flight vs budget-exhausted (AC-30 / AC-39)", () => {
    query = { data: { brief: brief() }, isLoading: false, isError: false, refetch: vi.fn() };

    mutation = { mutate: vi.fn(), isPending: true, error: null };
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <WhyRiskBriefCard prId="pr1" onOpenLine={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const regenerating = screen.getByRole("button", { name: "Regenerating…" });
    expect(regenerating).toBeDisabled();

    mutation = {
      mutate: vi.fn(),
      isPending: false,
      error: new ApiError("rate limited", 429, "rate_limited", undefined, 45),
    };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <WhyRiskBriefCard prId="pr1" onOpenLine={vi.fn()} />
      </NextIntlClientProvider>,
    );
    const exhausted = screen.getByRole("button", { name: /next try in 45s/ });
    expect(exhausted).toBeDisabled();
    // Distinct copy, not the in-flight label.
    expect(screen.queryByRole("button", { name: "Regenerating…" })).not.toBeInTheDocument();
  });

  it("surfaces a 'brief updated' notice without swapping the on-screen content until the reader activates it (AC-37)", () => {
    query = { data: { brief: brief({ what: "OLD what", pr_state_key: "state-a" }) }, isLoading: false, isError: false, refetch: vi.fn() };
    mutation = { mutate: vi.fn(), isPending: false, error: null };
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <WhyRiskBriefCard prId="pr1" onOpenLine={vi.fn()} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("OLD what")).toBeInTheDocument();

    query = {
      data: { brief: brief({ what: "NEW what", pr_state_key: "state-b" }) },
      isLoading: false,
      isError: false,
      refetch: vi.fn(),
    };
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <WhyRiskBriefCard prId="pr1" onOpenLine={vi.fn()} />
      </NextIntlClientProvider>,
    );

    // Notice shown, content NOT replaced.
    expect(screen.getByText("Brief updated")).toBeInTheDocument();
    expect(screen.getByText("OLD what")).toBeInTheDocument();
    expect(screen.queryByText("NEW what")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Show the new brief" }));
    expect(screen.getByText("NEW what")).toBeInTheDocument();
  });
});
