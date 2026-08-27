import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, within } from "@testing-library/react";
import type { PrBlastResponse } from "@devdigest/shared";

// Mutable per-test hook state — mirrors the pattern OverviewTab.test.tsx uses
// for usePrIntent: mock the hook, not `fetch`, since BlastRadiusCard's only
// job is to render whatever the hook returns.
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

import { BlastRadiusCard } from "./BlastRadiusCard";

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
  prior_prs: [],
};

describe("BlastRadiusCard", () => {
  it("shows counts, expands a symbol to reveal callers + endpoint chips, and links file:line to GitHub", () => {
    hookState = { ...hookState, data: okResponse };

    render(<BlastRadiusCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);
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
        prior_prs: [],
      },
    };

    render(<BlastRadiusCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByText("Repo has not been indexed yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list")).not.toBeInTheDocument();
  });

  it("shows an error message when the request fails", () => {
    hookState = { ...hookState, isError: true };

    render(<BlastRadiusCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByRole("alert")).toBeInTheDocument();
    expect(screen.getByText(/Couldn't load the blast radius/)).toBeInTheDocument();
  });

  it("switches between Tree and Graph views", () => {
    hookState = { ...hookState, data: okResponse };

    render(<BlastRadiusCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);

    // Tree is the default — the symbol entry (part of the tree list) is visible.
    expect(screen.getByText("processPayment")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Graph" }));

    // The tree list is gone; MermaidDiagram renders nothing synchronously in
    // jsdom (mermaid is loaded async), so assert on what's guaranteed to be
    // there instead: the symbol from the tree is no longer rendered.
    expect(screen.queryByText("processPayment")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Tree" }));

    expect(screen.getByText("processPayment")).toBeInTheDocument();
  });

  it("shows a collapsed-by-default Prior PRs section with a count badge, expandable to reveal links", () => {
    hookState = {
      ...hookState,
      data: {
        ...okResponse,
        prior_prs: [
          { number: 101, title: "Refactor billing", updated_at: "2026-01-05T00:00:00Z", overlap_count: 3 },
          { number: 102, title: "Add retry logic", updated_at: null, overlap_count: 1 },
          { number: 103, title: "Fix checkout bug", updated_at: "2026-02-10T00:00:00Z", overlap_count: 2 },
        ],
      },
    };

    render(<BlastRadiusCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.getByText("Prior PRs touching these files")).toBeInTheDocument();
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.queryByText("#101")).not.toBeInTheDocument();

    fireEvent.click(screen.getByText("Prior PRs touching these files"));

    const link = screen.getByRole("link", { name: "#101" });
    expect(link).toHaveAttribute("href", "https://github.com/acme/widgets/pull/101");
    expect(screen.getByText("Refactor billing")).toBeInTheDocument();
    expect(screen.getByText("Add retry logic")).toBeInTheDocument();
  });

  it("renders no Prior PRs section at all when there are none", () => {
    hookState = { ...hookState, data: { ...okResponse, prior_prs: [] } };

    render(<BlastRadiusCard prId="pr1" repoFullName="acme/widgets" headSha="abc123" />);

    expect(screen.queryByText("Prior PRs touching these files")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Prior PRs/ })).not.toBeInTheDocument();
  });
});
