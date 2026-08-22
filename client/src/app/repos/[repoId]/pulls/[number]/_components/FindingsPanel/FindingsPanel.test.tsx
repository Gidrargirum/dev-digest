import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("@/lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

const FINDINGS: FindingRecord[] = [
  {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

const FINDINGS_WITH_LOW: FindingRecord[] = [
  ...FINDINGS,
  {
    id: "f2",
    severity: "SUGGESTION",
    category: "style",
    title: "Low-confidence nit",
    file: "src/other.ts",
    start_line: 3,
    end_line: 3,
    rationale: "Might be worth a look.",
    suggestion: null,
    confidence: 0.2,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
  },
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel — severity filter chips", () => {
  it("renders one chip per present severity, with its count, and none for absent ones", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS_WITH_LOW} prId="pr1" />);

    expect(screen.getByRole("button", { name: /Critical/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Suggestion/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Warning/ })).not.toBeInTheDocument();
  });

  it("filters the list to one severity, and clicking the active chip clears it", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS_WITH_LOW} prId="pr1" />);
    const critical = screen.getByRole("button", { name: /Critical/ });

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("Low-confidence nit")).not.toBeInTheDocument();

    fireEvent.click(critical);
    expect(critical).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText("Low-confidence nit")).toBeInTheDocument();
  });

  it("counts what the chip will actually show, so hideLow drops the chip it empties", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS_WITH_LOW} prId="pr1" />);
    expect(screen.getByRole("button", { name: /Suggestion/ })).toBeInTheDocument();

    // The only SUGGESTION is low-confidence, so hiding those leaves it with
    // nothing to filter to — a chip promising "1" that opens an empty list.
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByRole("button", { name: /Suggestion/ })).not.toBeInTheDocument();
  });

  it("clears an active severity filter when a deep link targets another severity", () => {
    Element.prototype.scrollIntoView = vi.fn();
    const { rerender } = renderWithIntl(
      <FindingsPanel findings={FINDINGS_WITH_LOW} prId="pr1" targetNonce={0} />,
    );

    fireEvent.click(screen.getByRole("button", { name: /Critical/ }));
    expect(screen.queryByText("Low-confidence nit")).not.toBeInTheDocument();

    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel
          findings={FINDINGS_WITH_LOW}
          prId="pr1"
          targetFindingId="f2"
          targetNonce={1}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Low-confidence nit")).toBeInTheDocument();
  });
});

describe("FindingsPanel — deep-link focus (?finding=<id>)", () => {
  beforeEach(() => {
    Element.prototype.scrollIntoView = vi.fn();
  });

  it("drops the hideLow filter, focuses the target card, and scrolls to it when targetNonce changes", () => {
    const { rerender } = renderWithIntl(
      <FindingsPanel findings={FINDINGS_WITH_LOW} prId="pr1" targetFindingId={null} targetNonce={0} />,
    );

    // Hide the low-confidence finding by hand first, like a user would.
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("Low-confidence nit")).not.toBeInTheDocument();

    // Deep link targets it: the toggle must come back off so the card exists.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsPanel
          findings={FINDINGS_WITH_LOW}
          prId="pr1"
          targetFindingId="f2"
          targetNonce={1}
        />
      </NextIntlClientProvider>,
    );

    const card = screen.getByText("Low-confidence nit").closest("[data-finding-id]") as HTMLElement;
    expect(card).toBeInTheDocument();
    expect(card).toHaveAttribute("data-finding-id", "f2");
    // "focused" changes the card's border/box-shadow away from the default.
    expect(card.style.boxShadow).not.toBe("none");
    expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
      behavior: "smooth",
      block: "center",
    });
  });
});
