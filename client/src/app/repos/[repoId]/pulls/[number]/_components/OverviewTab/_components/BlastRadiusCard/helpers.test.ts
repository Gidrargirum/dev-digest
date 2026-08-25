import { describe, it, expect } from "vitest";
import type { BlastRadius } from "@devdigest/shared";
import { buildBlastChart } from "./helpers";
import { GRAPH_MAX_NODES } from "./constants";

function blastFixture(overrides: Partial<BlastRadius> = {}): BlastRadius {
  return {
    changed_symbols: [{ name: 'rate"Limit()', file: "src/lib/rate.ts", kind: "function" }],
    downstream: [
      {
        symbol: 'rate"Limit()',
        callers: [{ name: "handle", file: 'src/routes/"checkout".ts', line: 10 }],
        endpoints_affected: ["POST /checkout"],
        crons_affected: [],
        callers_truncated: false,
      },
    ],
    summary: "1 symbol · 1 caller · 1 endpoint",
    ...overrides,
  };
}

describe("buildBlastChart", () => {
  it("is deterministic and starts with the flowchart keyword", () => {
    const blast = blastFixture();

    const first = buildBlastChart(blast);
    const second = buildBlastChart(blast);

    expect(first.chart.startsWith("flowchart")).toBe(true);
    expect(first).toEqual(second);
  });

  it("escapes double quotes in node labels", () => {
    const blast = blastFixture();

    const { chart } = buildBlastChart(blast);

    expect(chart).toContain('s0["rate&quot;Limit()"]');
    expect(chart).toContain('f0["src/routes/&quot;checkout&quot;.ts"]');
    expect(chart).not.toContain('rate"Limit()'); // raw, unescaped quote must not survive
  });

  it("connects symbol -> caller file -> endpoint", () => {
    const blast = blastFixture();

    const { chart } = buildBlastChart(blast);

    // s0 = symbol, f0 = caller file, e0 = endpoint (registration order).
    expect(chart).toContain("s0 --> f0");
    expect(chart).toContain("f0 --> e0");
  });

  it("truncates to GRAPH_MAX_NODES, prioritizing symbols over files/endpoints/crons", () => {
    const downstream = Array.from({ length: GRAPH_MAX_NODES + 20 }, (_, i) => ({
      symbol: `symbol${i}`,
      callers: [{ name: `caller${i}`, file: `src/file${i}.ts`, line: 1 }],
      endpoints_affected: [`GET /path${i}`],
      crons_affected: [],
      callers_truncated: false,
    }));
    const blast = blastFixture({ downstream });

    const { totalNodes, shownNodes, chart } = buildBlastChart(blast);

    expect(totalNodes).toBe((GRAPH_MAX_NODES + 20) * 3); // symbol + file + endpoint per entry
    expect(shownNodes).toBe(GRAPH_MAX_NODES);
    // Every symbol node id up to the cap must be declared — symbols are kept
    // before any file/endpoint node once the cap forces a choice.
    expect(chart).toContain('s0["symbol0"]');
  });
});
