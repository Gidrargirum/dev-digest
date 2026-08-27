import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";

let params = new URLSearchParams();

vi.mock("next/navigation", () => ({
  useSearchParams: () => params,
}));

import { useDiffTarget } from "./diff-target";

describe("useDiffTarget", () => {
  it("returns null when no ?file= is present", () => {
    params = new URLSearchParams("tab=diff");
    const { result } = renderHook(() => useDiffTarget());
    expect(result.current).toBeNull();
  });

  it("reads ?file= and a numeric ?line= into a normalized target", () => {
    params = new URLSearchParams("file=src/a.ts&line=42");
    const { result } = renderHook(() => useDiffTarget());
    expect(result.current).toEqual({ path: "src/a.ts", line: 42 });
  });

  it("normalizes a missing or non-numeric ?line= to null, never NaN", () => {
    params = new URLSearchParams("file=src/a.ts");
    expect(renderHook(() => useDiffTarget()).result.current).toEqual({
      path: "src/a.ts",
      line: null,
    });

    params = new URLSearchParams("file=src/a.ts&line=oops");
    const { result } = renderHook(() => useDiffTarget());
    expect(result.current).toEqual({ path: "src/a.ts", line: null });
    expect(Number.isNaN((result.current as { line: number | null }).line)).toBe(false);
  });
});
