import { describe, it, expect } from "vitest";
import { resolveTarget } from "./targeting";
import type { Line } from "./helpers";

const lines: Line[] = [
  { kind: "hunk", text: "@@ -10,3 +10,3 @@" },
  { kind: "ctx", text: "a", oldNo: 10, newNo: 10 },
  { kind: "add", text: "b", newNo: 11 },
  { kind: "ctx", text: "c", oldNo: 11, newNo: 12 },
];

describe("resolveTarget", () => {
  it("returns 'none' when there is no target or the path does not match this file", () => {
    expect(resolveTarget("src/a.ts", lines, undefined)).toBe("none");
    expect(
      resolveTarget("src/a.ts", lines, { path: "src/other.ts", line: 11 }),
    ).toBe("none");
  });

  it("anchors when the addressed line is a rendered diff line, and is unanchored otherwise", () => {
    expect(resolveTarget("src/a.ts", lines, { path: "src/a.ts", line: 11 })).toBe(
      "anchored",
    );
    // outside every rendered hunk
    expect(resolveTarget("src/a.ts", lines, { path: "src/a.ts", line: 999 })).toBe(
      "unanchored",
    );
    // file addressed but no specific line, or an empty patch (no lines at all)
    expect(resolveTarget("src/a.ts", lines, { path: "src/a.ts", line: null })).toBe(
      "unanchored",
    );
    expect(resolveTarget("src/a.ts", [], { path: "src/a.ts", line: 11 })).toBe(
      "unanchored",
    );
  });
});
