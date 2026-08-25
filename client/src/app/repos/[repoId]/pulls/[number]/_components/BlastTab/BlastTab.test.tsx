import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { PrBlastResponse } from "@devdigest/shared";

// Mutable per-test hook state — mirrors the pattern OverviewTab.test.tsx uses
// for usePrIntent: mock the hook, not `fetch`, since BlastTab's only job is
// to render whatever the hook returns.
let hookState: {
  data: PrBlastResponse | undefined;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
} = {
  data: undefined,
  isLoading: false,
  isError: false,
  refetch: vi.fn(),
};

vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: () => hookState,
}));

import { BlastTab } from "./BlastTab";

beforeEach(() => {
  hookState = {
    data: undefined,
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  };
});
afterEach(cleanup);

const okResponse: PrBlastResponse = {
  status: "ok",
  reason: null,
  blast: {
    changed_symbols: [{ name: "processPayment", file: "src/billing/pay.ts", kind: "function" }],
    downstream: [
      {
        symbol: "processPayment",
        callers: [{ name: "handleCheckout", file: "src/routes/checkout.ts", line: 42 }],
        endpoints_affected: ["POST /checkout"],
        crons_affected: [],
        callers_truncated: false,
      },
    ],
    summary: "1 symbol · 1 caller · 1 endpoint",
  },
  counts: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
};

describe("BlastTab", () => {
  it("shows counts, expands a symbol to reveal callers + endpoint chips, and links file:line to GitHub", () => {
    hookState = { ...hookState, data: okResponse };

    render(<BlastTab prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);
    const countsRow = screen.getByRole("group", { name: /impact counts/i });

    expect(within(countsRow).getByText("1 symbols")).toBeInTheDocument();
    expect(within(countsRow).getByText("1 callers")).toBeInTheDocument();
    expect(within(countsRow).getByText("1 endpoints")).toBeInTheDocument();
    expect(within(countsRow).getByText("0 crons")).toBeInTheDocument();

    // Collapsed by default — caller not yet visible.
    expect(screen.queryByText("handleCheckout")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("processPayment"));

    expect(screen.getByText("handleCheckout")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /src\/routes\/checkout\.ts:42/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/widgets/blob/abc123/src/routes/checkout.ts#L42",
    );
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");

    expect(screen.getByText("POST /checkout")).toBeInTheDocument();
  });

  it("renders the degraded reason as explanatory text, never an empty tree", () => {
    hookState = {
      ...hookState,
      data: {
        status: "degraded",
        reason: "Repo has not been indexed yet.",
        blast: null,
        counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      },
    };

    render(<BlastTab prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByText("Repo has not been indexed yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows an error message when the request fails", () => {
    hookState = { ...hookState, isError: true };

    render(<BlastTab prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load the blast radius/)).toBeInTheDocument();
  });
});
