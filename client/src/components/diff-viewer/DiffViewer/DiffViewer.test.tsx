import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrFile } from "@/lib/types";
import shellMessages from "../../../../messages/en/shell.json";
import { DiffViewer } from "./DiffViewer";
import type { DiffAnnotationApi, DiffFindingMark } from "../annotations";

const originalScrollIntoView = Element.prototype.scrollIntoView;

function mockScrollIntoView() {
  const mock = vi.fn();
  Object.defineProperty(Element.prototype, "scrollIntoView", {
    configurable: true,
    writable: true,
    value: mock,
  });
  return mock;
}

afterEach(() => {
  vi.useRealTimers();
  cleanup();
  if (originalScrollIntoView) {
    Element.prototype.scrollIntoView = originalScrollIntoView;
  } else {
    Reflect.deleteProperty(Element.prototype, "scrollIntoView");
  }
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ shell: shellMessages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const FILE_WITH_PATCH: PrFile = {
  path: "src/config.ts",
  additions: 1,
  deletions: 0,
  patch: "@@ -10,3 +10,3 @@\n context\n+const secret = 'x';\n context",
};

const FILE_NO_PATCH: PrFile = {
  path: "src/other.ts",
  additions: 3,
  deletions: 1,
  patch: null,
};

function mark(overrides: Partial<DiffFindingMark> = {}): DiffFindingMark {
  return {
    id: "f1",
    startLine: 11,
    endLine: 11,
    severity: "CRITICAL",
    title: "Hardcoded secret",
    ...overrides,
  };
}

describe("DiffViewer — Smart Diff annotations (anti-corruption layer)", () => {
  it("renders no finding chip at all when `annotations` is undefined (regression: requirement 1)", () => {
    renderWithIntl(<DiffViewer files={[FILE_WITH_PATCH]} />);
    expect(screen.queryByText("Hardcoded secret")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /open finding/i })).not.toBeInTheDocument();
  });

  it("anchors a mark under its rendered line when the patch is non-empty, and calls onOpenFinding with only the id", () => {
    const onOpenFinding = vi.fn();
    const annotations: DiffAnnotationApi = {
      marksByPath: new Map([[FILE_WITH_PATCH.path, [mark()]]]),
      onOpenFinding,
      largeFileLines: 300,
    };
    renderWithIntl(<DiffViewer files={[FILE_WITH_PATCH]} annotations={annotations} />);

    const chip = screen.getByRole("button", { name: /open finding: hardcoded secret/i });
    expect(chip).toBeInTheDocument();
    fireEvent.click(chip);
    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    expect(onOpenFinding).toHaveBeenCalledWith("f1");
  });

  it("falls back to the unanchored-findings block when the file has no patch (seeded PR #482 shape)", () => {
    const onOpenFinding = vi.fn();
    const annotations: DiffAnnotationApi = {
      marksByPath: new Map([[FILE_NO_PATCH.path, [mark({ id: "f2", title: "Leaked key" })]]]),
      onOpenFinding,
      largeFileLines: 300,
    };
    renderWithIntl(<DiffViewer files={[FILE_NO_PATCH]} annotations={annotations} />);

    expect(screen.getByText("1 finding(s) not shown on a diff line")).toBeInTheDocument();
    const chip = screen.getByRole("button", { name: /open finding: leaked key/i });
    fireEvent.click(chip);
    expect(onOpenFinding).toHaveBeenCalledTimes(1);
    expect(onOpenFinding).toHaveBeenCalledWith("f2");
  });
});

describe("DiffViewer — PR Brief deep links", () => {
  it("expands a collapsed target file and scrolls its target line into view", async () => {
    vi.useFakeTimers();
    const scrollIntoView = mockScrollIntoView();
    const largeFile = { ...FILE_WITH_PATCH, additions: 400 };

    renderWithIntl(
      <DiffViewer files={[largeFile]} targetFile="src/config.ts" targetLine={11} />,
    );

    const targetText = screen.getByText("const secret = 'x';");
    expect(scrollIntoView).toHaveBeenCalled();
    const finalScrollTarget = scrollIntoView.mock.contexts.at(-1);
    const targetRow = targetText.closest('[aria-current="location"]');
    expect(finalScrollTarget).toBe(targetRow);

    act(() => vi.advanceTimersByTime(2500));
    expect(targetRow).not.toHaveAttribute("aria-current");
  });

  it("leaves the diff collapsed and does not scroll for an unknown target file", async () => {
    vi.useFakeTimers();
    const scrollIntoView = mockScrollIntoView();
    const largeFile = { ...FILE_WITH_PATCH, additions: 400 };

    renderWithIntl(
      <DiffViewer files={[largeFile]} targetFile="missing.ts" targetLine={11} />,
    );

    expect(screen.queryByText("const secret = 'x';")).not.toBeInTheDocument();
    act(() => vi.advanceTimersByTime(61));
    expect(scrollIntoView).not.toHaveBeenCalled();
  });
});
