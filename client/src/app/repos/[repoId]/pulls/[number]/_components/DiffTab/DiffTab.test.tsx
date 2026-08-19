import React from "react";
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile, ReviewRecord } from "@devdigest/shared";
import shellMessages from "../../../../../../../../messages/en/shell.json";

vi.mock("@/lib/hooks/reviews", () => ({
  usePrComments: () => ({ data: [] }),
  useCreatePrComment: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { DiffTab } from "./DiffTab";
import type { DiffMode } from "./constants";

afterEach(cleanup);

const CORE_FILE: PrFile = {
  path: "server/src/modules/pulls/service.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -10,3 +10,3 @@\n context\n+const secret = 'x';\n context",
};

const REVIEWS: ReviewRecord[] = [
  {
    id: "r1",
    pr_id: "pr1",
    agent_id: "a1",
    run_id: "run1",
    agent_name: "Agent 1",
    kind: "review",
    verdict: "comment",
    summary: "s",
    score: 80,
    model: null,
    grounding: null,
    created_at: "2026-01-01T00:00:00Z",
    findings: [
      {
        id: "f1",
        severity: "CRITICAL",
        category: "security",
        title: "Hardcoded secret",
        file: CORE_FILE.path,
        start_line: 11,
        end_line: 11,
        rationale: "r",
        suggestion: null,
        confidence: 0.9,
        kind: "finding",
        trifecta_components: null,
        evidence: null,
        review_id: "r1",
        accepted_at: null,
        dismissed_at: null,
      },
    ],
  },
];

/** Mirrors how page.tsx owns `diffMode` in the URL and passes it down as a
 *  controlled prop — DiffTab itself holds no mode state. */
function Harness({ files, reviews }: { files: PrFile[]; reviews: ReviewRecord[] }) {
  const [diffMode, setDiffMode] = React.useState<DiffMode>("normal");
  const onOpenFinding = vi.fn();
  return (
    <DiffTab
      prId="pr1"
      filesCount={files.length}
      files={files}
      reviews={reviews}
      diffMode={diffMode}
      onSetDiffMode={setDiffMode}
      onOpenFinding={onOpenFinding}
    />
  );
}

function renderHarness(files: PrFile[], reviews: ReviewRecord[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <Harness files={files} reviews={reviews} />
    </NextIntlClientProvider>,
  );
}

describe("DiffTab — Smart Diff switch", () => {
  it("shows no findings in Normal mode, then reveals them after switching to Smart Diff", () => {
    renderHarness([CORE_FILE], REVIEWS);

    // Normal is the default — regression for requirement 1 and flow 05.
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open finding/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Smart Diff" }));

    expect(screen.getByRole("button", { name: /open finding: hardcoded secret/i })).toBeInTheDocument();
  });

  it("shows the affected-files count in the header once Smart Diff is on", () => {
    renderHarness([CORE_FILE], REVIEWS);
    fireEvent.click(screen.getByRole("button", { name: "Smart Diff" }));

    expect(screen.getByText(/1 files touched/)).toBeInTheDocument();
  });
});
