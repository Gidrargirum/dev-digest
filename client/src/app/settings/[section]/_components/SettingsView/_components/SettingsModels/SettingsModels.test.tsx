import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../messages/en/settings.json";

const updateMutate = vi.fn();
let featureModels: Record<string, { provider: string; model: string }> = {};

vi.mock("@/lib/hooks", () => ({
  useSettings: () => ({ data: { feature_models: featureModels } }),
  useUpdateSettings: () => ({ mutate: updateMutate }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useProviderModels: () => ({ data: [{ id: "openai/gpt-5" }] }),
}));

import { SettingsModels } from "./SettingsModels";

beforeEach(() => {
  updateMutate.mockClear();
  featureModels = {};
});
afterEach(cleanup);

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ settings: messages }}>
      <SettingsModels />
    </NextIntlClientProvider>,
  );
}

const INHERIT = "Inherit from review agent";

/** The `review_intent` row, addressed by its accessible grouping rather than by
   walking FormField's wrapper nesting. */
function reviewIntentRow(): HTMLElement {
  return screen.getByRole("group", { name: "PR Review · Intent" });
}

/** The row's select trigger. The label tag and the closed select deliberately
   read the same string, so pick by what the element IS (not the tag) rather
   than by its position among the matches — the vendored trigger is a bare
   clickable <div> with no role of its own. */
function selectTrigger(row: HTMLElement): HTMLElement {
  const trigger = within(row)
    .getAllByText(INHERIT)
    .find((el) => !el.closest('[data-testid="feature-model-tag"]'));
  if (!trigger) throw new Error("no select trigger showing the inherit placeholder");
  return trigger;
}

describe("SettingsModels", () => {
  it("renders the review_intent row without crashing on an undefined default, showing the inherit placeholder instead of the usingDefault tag", () => {
    renderView();

    const row = reviewIntentRow();
    // Two distinct user-visible facts, asserted as such: the label carries the
    // inherit tag, and the closed select shows the inherit placeholder instead
    // of a blank value. Neither is the "default" tag used by features that do
    // have a registry default.
    expect(within(row).getByTestId("feature-model-tag")).toHaveTextContent(INHERIT);
    expect(selectTrigger(row)).toBeInTheDocument();
    expect(within(row).queryByText("default")).not.toBeInTheDocument();
  });

  it("saves a picked model for review_intent as a review_intent override in feature_models", () => {
    renderView();

    const row = reviewIntentRow();
    fireEvent.click(selectTrigger(row));

    const option = within(row).getByRole("button", { name: "openai/gpt-5" });
    fireEvent.click(option);

    expect(updateMutate).toHaveBeenCalledWith({
      feature_models: { review_intent: { provider: "openrouter", model: "openai/gpt-5" } },
    });
  });
});
