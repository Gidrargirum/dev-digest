import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ApiError } from "@/lib/api";

const patchMutate = vi.fn();
let patchPending = false;

vi.mock("@/lib/hooks/conventions", () => ({
  usePatchConvention: () => ({ mutate: patchMutate, isPending: patchPending }),
}));

import { ConventionCard } from "./ConventionCard";

const CANDIDATE: ConventionCandidate = {
  id: "cv1",
  category: "error-handling",
  rule: "Wrap route handlers in the shared error boundary.",
  evidence_path: "src/routes/pulls.ts",
  evidence_line: 12,
  evidence_end_line: 24,
  evidence_snippet: "app.get('/pulls', withErrors(handler));",
  confidence: 0.82,
  model_confidence: 0.9,
  support: 14,
  violations: 2,
  origin: "model",
  status: "pending",
  skill_id: null,
};

function renderCard(candidate: ConventionCandidate = CANDIDATE) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionCard candidate={candidate} repoId="r1" />
    </NextIntlClientProvider>,
  );
}

/** The real `mutate` takes per-call callbacks; the card closes its editor in
 *  `onSuccess` only, so tests choose which branch fires. */
type MutateOptions = { onSuccess?: () => void; onError?: (e: unknown) => void };

beforeEach(() => {
  patchMutate.mockReset();
  patchPending = false;
});
afterEach(cleanup);

describe("ConventionCard", () => {
  it("renders the rule, evidence location, snippet, confidence and corroboration", () => {
    renderCard();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
    expect(screen.getByText("src/routes/pulls.ts:12-24")).toBeInTheDocument();
    expect(screen.getByText(CANDIDATE.evidence_snippet)).toBeInTheDocument();
    // Percentage as TEXT, not colour alone.
    expect(screen.getByText("82% confidence")).toBeInTheDocument();
    expect(screen.getByText("14 files follow · 2 violate")).toBeInTheDocument();
    expect(screen.getByText("error handling")).toBeInTheDocument();
  });

  it("collapses a single-line evidence range to path:line", () => {
    renderCard({ ...CANDIDATE, evidence_line: 12, evidence_end_line: 12 });
    expect(screen.getByText("src/routes/pulls.ts:12")).toBeInTheDocument();
    expect(screen.queryByText("src/routes/pulls.ts:12-12")).not.toBeInTheDocument();
  });

  it("patches status to accepted when Accept is clicked", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Accept" }));
    expect(patchMutate).toHaveBeenCalledWith({
      id: "cv1",
      repoId: "r1",
      patch: { status: "accepted" },
    });
  });

  it("patches status to rejected when Reject is clicked", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Reject" }));
    expect(patchMutate).toHaveBeenCalledWith({
      id: "cv1",
      repoId: "r1",
      patch: { status: "rejected" },
    });
  });

  it("toggles an accepted candidate back to pending", () => {
    renderCard({ ...CANDIDATE, status: "accepted" });
    fireEvent.click(screen.getByRole("button", { name: "Accepted" }));
    expect(patchMutate).toHaveBeenCalledWith({
      id: "cv1",
      repoId: "r1",
      patch: { status: "pending" },
    });
  });

  it("carries the triage state in aria-pressed and the label, not colour alone", () => {
    const { rerender } = renderCard();
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
    expect(screen.getByRole("button", { name: "Reject" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );

    rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionCard candidate={{ ...CANDIDATE, status: "accepted" }} repoId="r1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Accepted" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionCard candidate={{ ...CANDIDATE, status: "rejected" }} repoId="r1" />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Rejected" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: "Accept" })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("saves an edited rule inline and closes the editor on success", () => {
    patchMutate.mockImplementation((_vars: unknown, opts?: MutateOptions) => opts?.onSuccess?.());
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    const textarea = screen.getByRole("textbox");
    fireEvent.change(textarea, { target: { value: "Never swallow errors." } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(patchMutate).toHaveBeenCalledWith(
      { id: "cv1", repoId: "r1", patch: { rule: "Never swallow errors." } },
      expect.anything(),
    );
    // Editor closes and the (stale until refetch) rule is shown again.
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });

  it("keeps the edited text and the editor open when the patch fails", () => {
    patchMutate.mockImplementation((_vars: unknown, opts?: MutateOptions) =>
      opts?.onError?.(new ApiError("Rule too long", 400)),
    );
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.change(screen.getByRole("textbox"), {
      target: { value: "Never swallow errors." },
    });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByRole("textbox")).toHaveValue("Never swallow errors.");
    expect(screen.getByRole("alert")).toHaveTextContent("Rule too long");
  });

  it("falls back to a generic save error and disables Save while the patch is in flight", () => {
    patchMutate.mockImplementation((_vars: unknown, opts?: MutateOptions) =>
      opts?.onError?.(new Error("boom")),
    );
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(screen.getByRole("alert")).toHaveTextContent("Could not save the rule");

    cleanup();
    patchPending = true;
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    expect(screen.getByRole("button", { name: "Saving…" })).toBeDisabled();
  });

  it("only claims Copied once the clipboard write resolved", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Copy evidence location" }));
    expect(writeText).toHaveBeenCalledWith("src/routes/pulls.ts:12-24");
    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Copy evidence location" })).toHaveAttribute(
        "title",
        "Copied",
      ),
    );
  });

  it("does not claim Copied when the clipboard is unavailable", () => {
    Object.defineProperty(navigator, "clipboard", { value: undefined, configurable: true });
    renderCard();
    const button = screen.getByRole("button", { name: "Copy evidence location" });
    fireEvent.click(button);
    expect(button).toHaveAttribute("title", "Copy evidence location");
  });

  it("cancels an edit without patching", () => {
    renderCard();
    fireEvent.click(screen.getByRole("button", { name: "Edit rule" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(patchMutate).not.toHaveBeenCalled();
    expect(screen.getByText(CANDIDATE.rule)).toBeInTheDocument();
  });
});
