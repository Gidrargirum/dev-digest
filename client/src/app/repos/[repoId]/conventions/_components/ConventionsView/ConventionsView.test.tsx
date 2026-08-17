import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, act } from "@testing-library/react";
import { renderToStaticMarkup } from "react-dom/server";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionCandidate, ConventionScan, ConventionsPage } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ApiError } from "@/lib/api";
import { sortCandidates } from "./helpers";

const extractMutate = vi.fn();
const patchMutate = vi.fn();
const patchMutateAsync = vi.fn();
const refetch = vi.fn();
let page: ConventionsPage | undefined;
let isLoading = false;
let loadError: unknown = null;

vi.mock("next/navigation", () => ({
  useParams: () => ({ repoId: "r1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  usePathname: () => "/repos/r1/conventions",
  useSearchParams: () => new URLSearchParams(),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventions: () => ({
    data: page,
    isLoading,
    isError: loadError !== null,
    error: loadError,
    refetch,
  }),
  useExtractConventions: () => ({ mutate: extractMutate, isPending: false }),
  usePatchConvention: () => ({
    mutate: patchMutate,
    mutateAsync: patchMutateAsync,
    isPending: false,
  }),
  useConventionSkillDraft: () => ({ data: undefined, isLoading: true }),
  useCreateConventionSkill: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repos: [{ id: "r1", full_name: "acme/devdigest" }] }),
}));

import { ConventionsView } from "./ConventionsView";

function candidate(over: Partial<ConventionCandidate> = {}): ConventionCandidate {
  return {
    id: "cv1",
    category: "naming",
    rule: "Name hooks use<Thing>.",
    evidence_path: "src/lib/hooks/core.ts",
    evidence_line: 4,
    evidence_end_line: 9,
    evidence_snippet: "export function useRepos() {}",
    confidence: 0.7,
    model_confidence: null,
    support: 9,
    violations: 1,
    origin: "model",
    status: "pending",
    skill_id: null,
    ...over,
  };
}

const SCAN: ConventionScan = {
  id: "sc1",
  repo_id: "r1",
  status: "done",
  sample_files: 42,
  candidates_raw: 12,
  candidates_kept: 6,
  model: "gpt-x",
  cost_usd: 0.02,
  error: null,
  created_at: new Date().toISOString(),
  finished_at: new Date().toISOString(),
};

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <ConventionsView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  extractMutate.mockClear();
  patchMutate.mockClear();
  refetch.mockClear();
  patchMutateAsync.mockReset();
  patchMutateAsync.mockResolvedValue(undefined);
  page = undefined;
  isLoading = false;
  loadError = null;
});
afterEach(cleanup);

describe("ConventionsView", () => {
  it("shows the no-scan empty state before the repo has ever been scanned", () => {
    page = { scan: null, candidates: [] };
    renderView();
    expect(screen.getByText("No scan yet — run one")).toBeInTheDocument();
  });

  it("shows a distinct empty state when a finished scan produced no candidates", () => {
    page = { scan: SCAN, candidates: [] };
    renderView();
    expect(screen.getByText("The scan finished without candidates")).toBeInTheDocument();
    expect(screen.getByText(/may not be indexed yet/)).toBeInTheDocument();
  });

  it("renders the repo heading and the sample-file subtitle once a scan exists", () => {
    page = { scan: SCAN, candidates: [candidate()] };
    renderView();
    expect(screen.getByText("Conventions in acme/devdigest")).toBeInTheDocument();
    expect(screen.getByText(/Detected from 42 sample files/)).toBeInTheDocument();
  });

  it("disables Create skill when nothing is accepted", () => {
    page = { scan: SCAN, candidates: [candidate()] };
    renderView();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
    expect(screen.getByText("0 of 1 accepted")).toBeInTheDocument();
  });

  it("enables Create skill once a candidate is accepted", () => {
    page = { scan: SCAN, candidates: [candidate({ status: "accepted" })] };
    renderView();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeEnabled();
    expect(screen.getByText("1 of 1 accepted")).toBeInTheDocument();
  });

  it("deselects every accepted candidate and stays disabled for the whole batch", async () => {
    const inFlight: (() => void)[] = [];
    patchMutateAsync.mockImplementation(
      () => new Promise<void>((resolve) => inFlight.push(() => resolve())),
    );
    page = {
      scan: SCAN,
      candidates: [
        candidate({ id: "a", status: "accepted" }),
        candidate({ id: "b", status: "accepted" }),
        candidate({ id: "c", status: "pending" }),
      ],
    };
    renderView();

    const button = screen.getByRole("button", { name: "Deselect all" });
    fireEvent.click(button);
    expect(patchMutateAsync).toHaveBeenCalledTimes(2);
    expect(patchMutateAsync).toHaveBeenCalledWith({
      id: "a",
      repoId: "r1",
      patch: { status: "pending" },
    });
    expect(patchMutateAsync).toHaveBeenCalledWith({
      id: "b",
      repoId: "r1",
      patch: { status: "pending" },
    });

    // Mid-flight: the button is disabled, so a second wave cannot start.
    expect(button).toBeDisabled();
    fireEvent.click(button);
    expect(patchMutateAsync).toHaveBeenCalledTimes(2);

    inFlight.forEach((resolve) => resolve());
    await waitFor(() => expect(button).toBeEnabled());
  });

  it("opens the create-skill modal from the toolbar", () => {
    page = { scan: SCAN, candidates: [candidate({ status: "accepted" })] };
    renderView();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(screen.getByRole("dialog")).toBeInTheDocument();
    expect(screen.getByText("Create skill from conventions")).toBeInTheDocument();
  });

  it("renders the error state and retries on demand", () => {
    loadError = new ApiError("conventions table is empty", 500);
    renderView();
    expect(screen.getByText("Conventions unavailable")).toBeInTheDocument();
    expect(screen.getByText("conventions table is empty")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /Retry|Try again/i }));
    expect(refetch).toHaveBeenCalled();
  });

  it("falls back to a generic message when the load failure is not an ApiError", () => {
    loadError = new Error("boom");
    renderView();
    expect(screen.getByText("Could not load conventions.")).toBeInTheDocument();
  });

  it("renders skeletons instead of the list while loading", () => {
    isLoading = true;
    renderView();
    expect(screen.queryByText("No scan yet — run one")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Create skill" })).not.toBeInTheDocument();
  });

  it("shows an alert banner when the last scan failed", () => {
    page = { scan: { ...SCAN, status: "failed", error: "clone missing" }, candidates: [] };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent("The last scan failed: clone missing");
  });

  it("names the failure even when the scan reported no error", () => {
    page = { scan: { ...SCAN, status: "failed", error: null }, candidates: [] };
    renderView();
    expect(screen.getByRole("alert")).toHaveTextContent(
      "The last scan failed: no error was reported",
    );
  });

  it("reads no clock during render, so the server markup is deterministic", () => {
    page = {
      scan: { ...SCAN, finished_at: new Date(Date.now() - 5 * 60_000).toISOString() },
      candidates: [candidate()],
    };
    const html = renderToStaticMarkup(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <ConventionsView repoId="r1" />
      </NextIntlClientProvider>,
    );
    // Pre-clock the scan is measured against itself — the same string the
    // client's first paint produces, so hydration cannot mismatch.
    expect(html).toContain("last scan just now");
  });

  it("ages the last-scan label on its own, without a refetch", () => {
    vi.useFakeTimers();
    try {
      page = {
        scan: { ...SCAN, finished_at: new Date(Date.now() - 5 * 60_000).toISOString() },
        candidates: [candidate()],
      };
      renderView();
      expect(screen.getByText(/last scan 5 minutes ago/)).toBeInTheDocument();
      act(() => vi.advanceTimersByTime(2 * 60_000));
      expect(screen.getByText(/last scan 7 minutes ago/)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("shows a progress line and a busy Re-scan button while a scan runs", () => {
    page = { scan: { ...SCAN, status: "running" }, candidates: [] };
    renderView();
    expect(screen.getByText(/Scan running/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Scanning…" })).toBeDisabled();
  });
});

describe("sortCandidates", () => {
  it("orders pending → accepted → rejected, confidence DESC within a group", () => {
    const list = [
      candidate({ id: "rej-hi", status: "rejected", confidence: 0.99 }),
      candidate({ id: "acc-lo", status: "accepted", confidence: 0.2 }),
      candidate({ id: "pen-lo", status: "pending", confidence: 0.3 }),
      candidate({ id: "acc-hi", status: "accepted", confidence: 0.8 }),
      candidate({ id: "pen-hi", status: "pending", confidence: 0.9 }),
    ];
    expect(sortCandidates(list).map((c) => c.id)).toEqual([
      "pen-hi",
      "pen-lo",
      "acc-hi",
      "acc-lo",
      "rej-hi",
    ]);
  });

  it("does not mutate its input", () => {
    const list = [candidate({ id: "a", confidence: 0.1 }), candidate({ id: "b", confidence: 0.9 })];
    sortCandidates(list);
    expect(list.map((c) => c.id)).toEqual(["a", "b"]);
  });
});
