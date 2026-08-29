import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import evalMessages from "../../../../../../../../messages/en/eval.json";
import { FindingCard } from "./FindingCard";

afterEach(cleanup);

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  it("keeps 'Turn into eval case' disabled until the finding is triaged, then fires it once accepted (AC-1–AC-4)", () => {
    const onTurnIntoEvalCase = vi.fn();
    const { rerender } = renderWithIntl(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
        <FindingCard f={FINDING} defaultExpanded onAction={() => {}} onTurnIntoEvalCase={onTurnIntoEvalCase} />
      </NextIntlClientProvider>,
    );

    // AC-1: the action is rendered alongside Accept/Dismiss.
    const turnBtn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(turnBtn).toBeInTheDocument();
    // AC-4: untriaged (neither accepted_at nor dismissed_at) keeps it disabled,
    // with an explanation.
    expect(turnBtn).toBeDisabled();
    expect(turnBtn).toHaveAttribute(
      "title",
      "Accept or dismiss this finding first — the eval case's expectation type is derived from that decision.",
    );

    // AC-2: an accepted finding enables the action and fires the handler.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
        <FindingCard
          f={{ ...FINDING, accepted_at: "2026-08-29T00:00:00Z" }}
          defaultExpanded
          onAction={() => {}}
          onTurnIntoEvalCase={onTurnIntoEvalCase}
        />
      </NextIntlClientProvider>,
    );
    const enabledBtn = screen.getByRole("button", { name: "Turn into eval case" });
    expect(enabledBtn).toBeEnabled();
    fireEvent.click(enabledBtn);
    expect(onTurnIntoEvalCase).toHaveBeenCalledTimes(1);

    // AC-3: a dismissed finding also enables the action.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages, eval: evalMessages }}>
        <FindingCard
          f={{ ...FINDING, dismissed_at: "2026-08-29T00:00:00Z" }}
          defaultExpanded
          onAction={() => {}}
          onTurnIntoEvalCase={onTurnIntoEvalCase}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: "Turn into eval case" })).toBeEnabled();
  });
});
