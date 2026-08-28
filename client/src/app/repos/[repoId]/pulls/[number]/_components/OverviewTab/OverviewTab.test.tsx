import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrBriefRecord, PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

// Mutable so each test picks the hook's answer — a hardcoded `null` here would
// mean the branch this component actually gained (rendering the card) is never
// exercised.
let intent: PrIntentRecord | null = null;
let brief: PrBriefRecord | null = null;
const runReview = vi.hoisted(() => ({ mutate: vi.fn(), isPending: false }));

vi.mock("@/lib/hooks/reviews", () => ({
  usePrIntent: () => ({ data: intent }),
  useRunReview: () => runReview,
}));

// The PR Brief card fetches its own data — with no Brief cached the card shows
// its "no Brief yet" nudge and none of the three Brief-derived blocks render.
vi.mock("@/lib/hooks/brief", () => ({
  usePrBrief: () => ({ data: { brief }, isLoading: false, isError: false, refetch: vi.fn() }),
  useRegenerateBrief: () => ({ mutate: vi.fn(), isPending: false }),
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
  brief = null;
  runReview.mutate.mockReset();
  runReview.isPending = false;
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

  it("composes a loaded Brief, Risk Areas, and Review Focus before the description", async () => {
    const onOpenFile = vi.fn();
    intent = {
      pr_id: "pr1",
      intent: "Adds guarded writes.",
      in_scope: ["Write route"],
      out_of_scope: ["Database redesign"],
      confidence: "high",
      sources: ["pr_title"],
      head_sha: "head-1",
      computed_at: "2026-08-28T00:00:00.000Z",
    };
    brief = {
      pr_id: "pr1",
      head_sha: "head-1",
      run_id: null,
      generated_at: "2026-08-28T00:00:00.000Z",
      what: "Adds a guarded write endpoint.",
      why: "Writes need authorization.",
      risk_level: "high",
      risks: [
        {
          kind: "security",
          title: "Authorization boundary",
          explanation: "Check who may write.",
          severity: "high",
          file_refs: ["src/write.ts:2"],
        },
      ],
      review_focus: [
        { label: "Read the route first", file_refs: ["src/focus.ts:8"] },
      ],
    };

    renderWithIntl(
      <OverviewTab
        prId="pr1"
        prBody="PR description"
        headSha="head-1"
        onOpenFile={onOpenFile}
      />,
    );

    const briefText = screen.getByText("Adds a guarded write endpoint.");
    const intentHeading = screen.getByText("Intent");
    const focusHeading = screen.getByText("Review focus — read these first");
    const description = screen.getByText("Description");
    expect(briefText.compareDocumentPosition(intentHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(screen.getByText("Authorization boundary")).toBeInTheDocument();
    expect(focusHeading.compareDocumentPosition(description)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    fireEvent.click(screen.getByRole("button", { name: "src/focus.ts:8" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/focus.ts", 8);
  });
});
