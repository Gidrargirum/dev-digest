import { describe, expect, it } from "vitest";
import { parseFileRef } from "./helpers";

describe("parseFileRef", () => {
  it("keeps the first line of a range and omits a missing line", () => {
    expect(parseFileRef("src/api/users.ts:12-18")).toEqual({
      path: "src/api/users.ts",
      line: 12,
    });
    expect(parseFileRef("package.json")).toEqual({ path: "package.json", line: null });
  });
});
