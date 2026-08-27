import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
import type { BriefRisk } from "@/lib/types";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { IntentCard } from "./IntentCard";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

function intent(over: Partial<PrIntentRecord> = {}): PrIntentRecord {
  return {
    intent: "Add a dark mode toggle to the settings page",
    in_scope: ["Theme toggle in Settings", "Persist the choice to localStorage"],
    out_of_scope: ["Redesigning the whole settings page"],
    risk_areas: ["Might conflict with system theme detection"],
    confidence: "high",
    sources: ["pr_title", "pr_branch", "pr_files", "pr_body", "issue#42"],
    pr_id: "pr1",
    head_sha: "abc123",
    computed_at: new Date().toISOString(),
    ...over,
  };
}

describe("IntentCard", () => {
  it("renders the intent quote, both scope columns and the risk-areas chips", () => {
    renderWithIntl(<IntentCard intent={intent()} />);

    expect(
      screen.getByText("“Add a dark mode toggle to the settings page”"),
    ).toBeInTheDocument();

    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Theme toggle in Settings")).toBeInTheDocument();
    expect(screen.getByText("Persist the choice to localStorage")).toBeInTheDocument();

    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Redesigning the whole settings page")).toBeInTheDocument();

    expect(screen.getByText("Risk areas")).toBeInTheDocument();
    expect(screen.getByText("Might conflict with system theme detection")).toBeInTheDocument();

    expect(screen.getByText("Confidence: high")).toBeInTheDocument();
  });

  it("omits the risk-areas section entirely when risk_areas is empty", () => {
    renderWithIntl(<IntentCard intent={intent({ risk_areas: [] })} />);

    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    // The rest of the card still renders.
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
  });
});

function risk(over: Partial<BriefRisk> = {}): BriefRisk {
  return { title: "Race on the token bucket", detail: null, path: "src/limiter.ts", line: 20, endpoint: null, ...over };
}

describe("IntentCard — risks[] from the Why + Risk Brief (AC-25)", () => {
  it("renders risks below Out of scope and above the confidence footer, each with its path:line reference", () => {
    renderWithIntl(
      <IntentCard
        intent={intent()}
        risks={[risk(), risk({ title: "Missing retry-after header", path: "src/headers.ts", line: 8 })]}
        risksTotal={2}
      />,
    );

    const risksHeading = screen.getByText("Risks");
    const outOfScope = screen.getByText("Out of scope");
    const confidence = screen.getByText("Confidence: high");

    // below Out of scope
    expect(outOfScope.compareDocumentPosition(risksHeading)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    // above the confidence footer
    expect(risksHeading.compareDocumentPosition(confidence)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );

    expect(screen.getByText("Race on the token bucket")).toBeInTheDocument();
    expect(screen.getByText("src/limiter.ts:20")).toBeInTheDocument();
  });

  it("shows only the title when path/line are null — no 'null:null', no dangling separator — and states the truncation count", () => {
    renderWithIntl(
      <IntentCard
        intent={intent()}
        risks={[risk({ title: "Unlocated risk", path: null, line: null })]}
        risksTotal={5}
      />,
    );

    expect(screen.getByText("Unlocated risk")).toBeInTheDocument();
    expect(screen.queryByText(/null/)).not.toBeInTheDocument();
    expect(screen.getByText("Showing 1 of 5")).toBeInTheDocument();
  });
});
