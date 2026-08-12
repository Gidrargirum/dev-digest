import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { FindingRecord } from "@devdigest/shared";
import { FindingsBreakdownBadges } from "./FindingsBreakdownBadges";
import { countBySeverity, sortBySeverity, totalFindings } from "./helpers";

afterEach(cleanup);

function finding(severity: string, over: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: `f-${severity}-${over.id ?? Math.random()}`,
    review_id: "r1",
    severity: severity as FindingRecord["severity"],
    category: "bug",
    title: `${severity} finding`,
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "because",
    confidence: 0.9,
    accepted_at: null,
    dismissed_at: null,
    ...over,
  };
}

describe("FindingsBreakdownBadges", () => {
  it("renders a counter per non-empty severity only", () => {
    render(<FindingsBreakdownBadges counts={{ critical: 2, warning: 0, suggestion: 3 }} />);
    expect(screen.getByLabelText("Critical: 2")).toBeInTheDocument();
    expect(screen.getByLabelText("Suggestion: 3")).toBeInTheDocument();
    expect(screen.queryByLabelText(/^Warning/)).not.toBeInTheDocument();
  });

  it("renders an em dash when everything is zero or missing", () => {
    render(<FindingsBreakdownBadges counts={{ critical: 0, warning: 0, suggestion: 0 }} />);
    expect(screen.getByText("—")).toBeInTheDocument();
    cleanup();
    render(<FindingsBreakdownBadges counts={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});

describe("findings-breakdown helpers", () => {
  it("countBySeverity ignores dismissed findings", () => {
    const counts = countBySeverity([
      finding("CRITICAL"),
      finding("CRITICAL", { dismissed_at: "2026-08-01T00:00:00.000Z" }),
      finding("WARNING"),
      finding("SUGGESTION"),
    ]);
    expect(counts).toEqual({ critical: 1, warning: 1, suggestion: 1 });
    expect(totalFindings(counts)).toBe(3);
    expect(totalFindings(null)).toBe(0);
  });

  it("sortBySeverity puts critical first and drops dismissed", () => {
    const sorted = sortBySeverity([
      finding("SUGGESTION"),
      finding("CRITICAL"),
      finding("WARNING", { dismissed_at: "2026-08-01T00:00:00.000Z" }),
      finding("WARNING"),
    ]);
    expect(sorted.map((f) => f.severity)).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });
});
