import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrIntentRecord } from "@devdigest/shared";
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
