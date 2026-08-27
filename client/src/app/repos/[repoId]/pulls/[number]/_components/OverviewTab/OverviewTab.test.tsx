import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// Mutable so each test picks the hook's answer — a hardcoded `null` here would
// mean the branch this component actually gained (rendering the card) is never
// exercised.
let intent: PrIntentRecord | null = null;

vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: () => ({ data: intent }),
}));

// BlastRadiusCard (Overview's right column) calls usePrBlast on its own —
// mock it too, or it throws for lack of a QueryClient/mock in this render tree.
vi.mock("@/lib/hooks/blast", () => ({
  usePrBlast: () => ({
    data: {
      status: "ok",
      reason: null,
      blast: { changed_symbols: [], downstream: [], summary: "0 symbols" },
      counts: { symbols: 0, callers: 0, endpoints: 0, crons: 0 },
      prior_prs: [],
    },
    isLoading: false,
    isError: false,
    refetch: vi.fn(),
  }),
}));

import { OverviewTab } from "./OverviewTab";

beforeEach(() => {
  intent = null;
});
afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("OverviewTab", () => {
  it("renders no INTENT card when intent is null, and still renders the PR description", () => {
    renderWithIntl(<OverviewTab prId="pr1" prBody="Adds a dark mode toggle to Settings." />);

    // No intent card content anywhere on the page.
    expect(screen.queryByText("Intent")).not.toBeInTheDocument();
    expect(screen.queryByText("In scope")).not.toBeInTheDocument();
    expect(screen.queryByText("Out of scope")).not.toBeInTheDocument();

    // The description block renders exactly as it did before the intent card existed.
    expect(screen.getByText("Description")).toBeInTheDocument();
    expect(screen.getByText("Adds a dark mode toggle to Settings.")).toBeInTheDocument();
  });

  it("renders the INTENT card above the description when an intent exists", () => {
    intent = {
      pr_id: "pr1",
      intent: "Adds a dark mode toggle to Settings.",
      in_scope: ["Settings page"],
      out_of_scope: ["Theme tokens"],
      risk_areas: ["Hydration mismatch"],
      confidence: "medium",
      sources: ["pr_title", "pr_branch", "pr_body"],
      head_sha: "a1b2c3d",
      computed_at: "2026-08-18T00:00:00.000Z",
    };

    const { container } = renderWithIntl(
      <OverviewTab prId="pr1" prBody="Adds a dark mode toggle to Settings." />,
    );

    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Settings page")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Theme tokens")).toBeInTheDocument();
    expect(screen.getByText("Hydration mismatch")).toBeInTheDocument();

    // The layout decision this feature made: the card sits ABOVE the description.
    const card = screen.getByText("In scope");
    const description = screen.getByText("Description");
    expect(card.compareDocumentPosition(description)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(container).toBeTruthy();
  });

  it("renders the Blast Radius card in the right column alongside the description", () => {
    renderWithIntl(<OverviewTab prId="pr1" prBody="Adds a dark mode toggle to Settings." />);

    expect(screen.getByText("Blast Radius")).toBeInTheDocument();
    expect(screen.getByRole("group", { name: /impact counts/i })).toBeInTheDocument();
  });
});
