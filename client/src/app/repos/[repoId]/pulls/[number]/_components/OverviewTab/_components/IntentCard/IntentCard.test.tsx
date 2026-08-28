import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
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
    confidence: "high",
    sources: ["pr_title", "pr_branch", "pr_files", "pr_body", "issue#42"],
    pr_id: "pr1",
    head_sha: "abc123",
    computed_at: new Date().toISOString(),
    ...over,
  };
}

describe("IntentCard", () => {
  it("renders the intent quote and both scope columns", () => {
    renderWithIntl(<IntentCard intent={intent()} />);

    expect(
      screen.getByText("“Add a dark mode toggle to the settings page”"),
    ).toBeInTheDocument();

    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Theme toggle in Settings")).toBeInTheDocument();
    expect(screen.getByText("Persist the choice to localStorage")).toBeInTheDocument();

    expect(screen.getByText("Out of scope")).toBeInTheDocument();
    expect(screen.getByText("Redesigning the whole settings page")).toBeInTheDocument();

    expect(screen.getByText("Confidence: high")).toBeInTheDocument();
  });

  it("omits the Risk Areas section when no Brief is passed", () => {
    renderWithIntl(<IntentCard intent={intent()} />);

    expect(screen.queryByText("Risk areas")).not.toBeInTheDocument();
    expect(screen.getByText("In scope")).toBeInTheDocument();
    expect(screen.getByText("Out of scope")).toBeInTheDocument();
  });

  it("expands Brief risks and opens a grounded file reference", async () => {
    const onOpenFile = vi.fn();
    renderWithIntl(
      <IntentCard
        intent={intent()}
        brief={{
          what: "Adds a guarded endpoint.",
          why: "Safer writes.",
          risk_level: "high",
          risks: [
            {
              kind: "security",
              title: "Authorization boundary",
              explanation: "The route changes who may write data.",
              severity: "high",
              file_refs: ["src/auth.ts:42"],
            },
          ],
          review_focus: [],
        }}
        onOpenFile={onOpenFile}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /authorization boundary/i }));
    expect(screen.getByText("The route changes who may write data.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "src/auth.ts:42" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/auth.ts", 42);
  });
});
