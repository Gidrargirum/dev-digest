import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord, PrFile, ReviewRecord } from "@devdigest/shared";
import shellMessages from "../../../../../../../../../../messages/en/shell.json";
import {
  classify,
  groupFiles,
  findingsByPath,
  isLargeFile,
  affectedFilesCount,
} from "./helpers";
import { SmartDiffView } from "./SmartDiffView";

function file(path: string, additions = 1, deletions = 0): PrFile {
  return { path, additions, deletions, patch: "@@ -1,1 +1,1 @@\n+x" };
}

describe("classify", () => {
  it("puts a lock file in boilerplate", () => {
    expect(classify("pnpm-lock.yaml")).toBe("boilerplate");
  });

  it("puts routes.ts in wiring", () => {
    expect(classify("server/src/modules/pulls/routes.ts")).toBe("wiring");
  });

  it("puts service.ts in core", () => {
    expect(classify("server/src/modules/pulls/service.ts")).toBe("core");
  });

  it("puts a barrel index.ts in boilerplate", () => {
    expect(classify("client/src/components/diff-viewer/index.ts")).toBe("boilerplate");
  });

  it("puts a *.test.ts file in boilerplate", () => {
    expect(classify("server/src/modules/pulls/service.test.ts")).toBe("boilerplate");
  });

  it("falls back to core for an unknown extension", () => {
    expect(classify("server/src/modules/pulls/schema.proto")).toBe("core");
  });
});

describe("groupFiles", () => {
  it("returns three empty groups, in order, for an empty file list", () => {
    const groups = groupFiles([]);
    expect(groups.map((g) => g.role)).toEqual(["core", "wiring", "boilerplate"]);
    expect(groups.every((g) => g.files.length === 0)).toBe(true);
  });

  it("classifies and sorts within each group by additions+deletions desc", () => {
    const groups = groupFiles([
      file("server/src/modules/pulls/service.ts", 5, 1),
      file("server/src/modules/pulls/repository.ts", 40, 10),
      file("server/src/modules/pulls/routes.ts", 3, 0),
      file("package-lock.json", 200, 0),
    ]);
    const core = groups.find((g) => g.role === "core")!;
    expect(core.files.map((f) => f.path)).toEqual([
      "server/src/modules/pulls/repository.ts",
      "server/src/modules/pulls/service.ts",
    ]);
    expect(groups.find((g) => g.role === "wiring")!.files).toHaveLength(1);
    expect(groups.find((g) => g.role === "boilerplate")!.files).toHaveLength(1);
  });
});

describe("findingsByPath", () => {
  it("indexes every finding across every review by file path", () => {
    const reviews: ReviewRecord[] = [
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
            file: "src/config.ts",
            start_line: 12,
            end_line: 12,
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
    const byPath = findingsByPath(reviews);
    expect(byPath.get("src/config.ts")).toEqual([
      {
        id: "f1",
        runId: "run1",
        startLine: 12,
        endLine: 12,
        severity: "CRITICAL",
        title: "Hardcoded secret",
      },
    ]);
    expect(byPath.get("nonexistent.ts")).toBeUndefined();
  });
});

describe("isLargeFile", () => {
  it("compares additions+deletions against the threshold", () => {
    expect(isLargeFile({ additions: 200, deletions: 150 }, 300)).toBe(true);
    expect(isLargeFile({ additions: 100, deletions: 50 }, 300)).toBe(false);
  });
});

describe("affectedFilesCount", () => {
  it("counts every file in the diff", () => {
    expect(affectedFilesCount([file("a.ts"), file("b.ts")])).toBe(2);
    expect(affectedFilesCount([])).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Component-level tests (RTL) — plans/smart-diff.md step 4, requirements 3/5.
// ---------------------------------------------------------------------------

afterEach(cleanup);

function finding(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 12,
    end_line: 12,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

function review(findings: FindingRecord[]): ReviewRecord {
  return {
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
    findings,
  };
}

function renderView(files: PrFile[], reviews: ReviewRecord[], onOpenFinding = vi.fn()) {
  render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      <SmartDiffView files={files} reviews={reviews} onOpenFinding={onOpenFinding} />
    </NextIntlClientProvider>,
  );
  return onOpenFinding;
}

describe("SmartDiffView (component)", () => {
  it("keeps Boilerplate collapsed on first render even when it has findings, but names the count in its header", () => {
    const files = [file("pnpm-lock.yaml", 300, 0)];
    const reviews = [
      review([finding({ id: "f-boiler", file: "pnpm-lock.yaml", start_line: 1, end_line: 1 })]),
    ];
    renderView(files, reviews);

    // Collapsed: the finding chip is not in the DOM at all.
    expect(screen.queryByRole("button", { name: /open finding/i })).not.toBeInTheDocument();
    // But the group header carries the count as text, not just a color cue.
    expect(screen.getByText("1 files · +300 −0 · 1 findings")).toBeInTheDocument();
  });

  it("shows a textual LARGE badge on a 400-line file", () => {
    const files = [file("src/big.ts", 250, 150)];
    renderView(files, []);
    expect(screen.getByText(/LARGE · 400 lines/i)).toBeInTheDocument();
  });

  it("clicking a finding calls onOpenFinding with only its id — no popup, no external link", () => {
    const coreFile: PrFile = {
      path: "server/src/modules/pulls/service.ts",
      additions: 1,
      deletions: 0,
      patch: "@@ -10,3 +10,3 @@\n context\n+const secret = 'x';\n context",
    };
    const reviews = [review([finding({ id: "f1", file: coreFile.path, start_line: 11, end_line: 11 })])];
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);

    const onOpenFinding = renderView([coreFile], reviews);

    const chip = screen.getByRole("button", { name: /open finding: hardcoded secret/i });
    fireEvent.click(chip);

    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
    expect(openSpy).not.toHaveBeenCalled();
    expect(screen.queryByRole("link")).not.toBeInTheDocument();

    openSpy.mockRestore();
  });
});
