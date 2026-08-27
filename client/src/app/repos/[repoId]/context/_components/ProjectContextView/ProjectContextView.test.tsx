import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ContextDoc, ContextFolder } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/context.json";

let docs: ContextDoc[] | undefined;
let folders: ContextFolder[] | undefined;
let docsLoading = false;
let cloned = true;

vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({
    repos: [{ id: "r1", full_name: "acme/devdigest", clone_path: cloned ? "/tmp/acme" : null }],
    reposLoaded: true,
  }),
}));

vi.mock("@/lib/hooks/context", () => {
  const query = (data: unknown) => ({ data, isLoading: false, isError: false, error: null, refetch: vi.fn() });
  const mutation = () => ({ mutateAsync: vi.fn(), isPending: false });
  return {
    useContextDocs: () => ({ data: docs, isLoading: docsLoading, isError: false, error: null, refetch: vi.fn() }),
    useContextFolders: () => query(folders ?? []),
    useContextDocContent: (_repoId: string | null | undefined, path: string | null | undefined) =>
      path ? query({ path, content: `# ${path}\n\nContent of ${path}.` }) : query(undefined),
    useContextCoverage: () => query({ attached_agents: 1, total_agents: 4, percent: 25 }),
    useCreateContextDoc: mutation,
    useCreateContextFolder: mutation,
    useUploadContextDoc: mutation,
    useSaveContextDoc: mutation,
  };
});

vi.mock("@/components/app-shell", () => ({
  AppShell: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

import { ProjectContextView } from "./ProjectContextView";

function doc(over: Partial<ContextDoc> = {}): ContextDoc {
  return {
    path: ".devdigest/specs/foo.md",
    name: "foo.md",
    source: "specs",
    size_bytes: 2048,
    tokens: 512,
    used_by_agents: 2,
    ...over,
  };
}

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ context: messages }}>
      <ProjectContextView repoId="r1" />
    </NextIntlClientProvider>,
  );
}

afterEach(() => {
  cleanup();
  docs = undefined;
  folders = undefined;
  docsLoading = false;
  cloned = true;
});

describe("ProjectContextView", () => {
  it("selects a document from the tree and opens its Preview with content", () => {
    docs = [doc(), doc({ path: ".devdigest/docs/bar.md", name: "bar.md", source: "docs" })];
    renderView();

    // Preview starts empty.
    expect(screen.getByText("Select a document to preview it.")).toBeInTheDocument();

    fireEvent.click(screen.getByText("bar.md"));

    expect(screen.queryByText("Select a document to preview it.")).not.toBeInTheDocument();
    expect(screen.getByText("Content of .devdigest/docs/bar.md.")).toBeInTheDocument();
  });

  it("shows the not-cloned empty state when the repo has no clone yet", () => {
    cloned = false;
    docs = [];
    renderView();
    expect(screen.getByText("Repository not cloned yet")).toBeInTheDocument();
    expect(
      screen.getByText(/This repository hasn't been cloned yet/),
    ).toBeInTheDocument();
  });

  it("shows the no-docs empty state for a cloned repo with an empty catalog", () => {
    cloned = true;
    docs = [];
    renderView();
    expect(screen.getByText("No documents found")).toBeInTheDocument();
    expect(screen.getByText(/No \.md files under/)).toBeInTheDocument();
  });
});
