import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ContextDoc } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

const setContextMutate = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useRepos: () => ({ data: [{ id: "r1", full_name: "acme/devdigest", clone_path: "/tmp/acme" }] }),
}));

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({ data: [] }),
  useAgentSkills: () => ({ data: [] }),
}));

vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => ({
    data: [
      { path: "specs/a.md", name: "a.md", source: "specs", size_bytes: 1024, tokens: 100, used_by_agents: 0 },
      { path: "specs/b.md", name: "b.md", source: "specs", size_bytes: 2048, tokens: 250, used_by_agents: 1 },
    ] satisfies ContextDoc[],
    isLoading: false,
  }),
  useContextDocContent: (_repoId: unknown, path: string | null | undefined) => ({
    data: path ? { path, content: `# ${path}\n\nBody of ${path}.` } : undefined,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useAgentContext: () => ({ data: [], isLoading: false }),
  useSetAgentContext: () => ({ mutate: setContextMutate, isPending: false, isSuccess: false }),
  useInheritedSkillContexts: () => [],
}));

import { ContextTab } from "./ContextTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ agents: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ContextTab", () => {
  it("attaches a document via its checkbox, updating the count and the token estimate", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);

    expect(screen.getByText("0 of 2 attached")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);

    expect(screen.getByText("1 of 2 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 100 tokens")).toBeInTheDocument();

    fireEvent.click(checkboxes[1]!);
    expect(screen.getByText("2 of 2 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 350 tokens")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save context"));
    expect(setContextMutate).toHaveBeenCalledWith(
      { agentId: "ag1", repoId: "r1", paths: ["specs/a.md", "specs/b.md"] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows each document's token count", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);
    expect(screen.getByText("100t")).toBeInTheDocument();
    expect(screen.getByText("250t")).toBeInTheDocument();
  });

  it("reorders with the drag handle's arrow keys and saves the new order", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    // Move the first row (a.md) down past b.md.
    const handleA = screen.getByLabelText(/Reorder a\.md/);
    fireEvent.keyDown(handleA, { key: "ArrowDown" });

    fireEvent.click(screen.getByText("Save context"));
    expect(setContextMutate).toHaveBeenLastCalledWith(
      { agentId: "ag1", repoId: "r1", paths: ["specs/b.md", "specs/a.md"] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("opens the preview panel for a document and closes it", () => {
    renderWithIntl(<ContextTab agent={AGENT} />);

    fireEvent.click(screen.getAllByText("Preview")[0]!);
    expect(screen.getByLabelText("Document preview")).toBeInTheDocument();
    expect(screen.getByText("Body of specs/a.md.")).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("Close preview"));
    expect(screen.queryByLabelText("Document preview")).not.toBeInTheDocument();
  });
});
