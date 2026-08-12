import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";

const push = vi.fn();
vi.mock("next/navigation", () => ({ useRouter: () => ({ push }) }));
vi.mock("@/lib/hooks/reviews", () => ({
  usePrReviews: () => ({ data: [], isPending: false, isError: false }),
}));

import { PRRow } from "./PRRow";
import { COLUMN_KEYS } from "../../constants";

afterEach(cleanup);

const PR: PrMeta = {
  id: "pr-1",
  number: 482,
  title: "Add rate limiting to public API endpoints",
  author: "marisa.koch",
  branch: "feat/rl",
  base: "main",
  head_sha: "a1b2c3d4",
  additions: 247,
  deletions: 38,
  files_count: 9,
  status: "needs_review",
  opened_at: null,
  updated_at: null,
  score: 61,
  cost_usd: 0.014,
  findings_breakdown: { critical: 2, warning: 0, suggestion: 2 },
};

function renderRow(pr: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <PRRow pr={pr} repoId="repo-1" />
    </NextIntlClientProvider>,
  );
}

describe("PRRow — FINDINGS column", () => {
  it("sits between SCORE and STATUS", () => {
    expect(COLUMN_KEYS.indexOf("findings")).toBe(COLUMN_KEYS.indexOf("score") + 1);
    expect(COLUMN_KEYS.indexOf("status")).toBe(COLUMN_KEYS.indexOf("findings") + 1);
  });

  it("shows only the severities that have findings", () => {
    renderRow(PR);
    expect(screen.getByLabelText("Critical: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Suggestion: 2")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Warning/)).not.toBeInTheDocument();
    // Counters are hoverable only when there is something to show.
    expect(screen.getByRole("button", { name: "Show findings" })).toBeInTheDocument();
  });

  it("renders a plain em dash with no hover trigger when the PR has no findings", () => {
    renderRow({ ...PR, findings_breakdown: null });
    expect(screen.queryByLabelText(/^(Critical|Warning|Suggestion)/)).not.toBeInTheDocument();
    expect(screen.getAllByText("—").length).toBeGreaterThan(0);
    expect(screen.queryByRole("button", { name: "Show findings" })).not.toBeInTheDocument();
  });
});
