import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Skill, ContextDoc } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/skills.json";
import { ToastProvider } from "@/lib/toast";

const setContextMutate = vi.fn();

vi.mock("@/lib/hooks", () => ({
  useRepos: () => ({ data: [{ id: "r1", full_name: "acme/devdigest", clone_path: "/tmp/acme" }] }),
}));

vi.mock("@/lib/hooks/context", () => ({
  useContextDocs: () => ({
    data: [
      { path: "specs/a.md", name: "a.md", source: "specs", size_bytes: 1024, tokens: 80, used_by_agents: 0 },
      { path: "specs/b.md", name: "b.md", source: "specs", size_bytes: 2048, tokens: 220, used_by_agents: 1 },
    ] satisfies ContextDoc[],
    isLoading: false,
  }),
  useContextDocContent: (_repoId: unknown, path: string | null | undefined) => ({
    data: path ? { path, content: `# ${path}\n\nBody of ${path}.` } : undefined,
    isLoading: false,
    isError: false,
    error: null,
  }),
  useSkillContext: () => ({ data: [], isLoading: false }),
  useSetSkillContext: () => ({ mutate: setContextMutate, isPending: false, isSuccess: false }),
}));

import { ProjectContextSection } from "./ProjectContextSection";

afterEach(cleanup);

const SKILL: Skill = {
  id: "sk1",
  name: "sql-safety",
  description: "Flags raw SQL",
  type: "security",
  source: "manual",
  body: "",
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ skills: messages }}>
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("ProjectContextSection", () => {
  it("attaches a document, updating the attached count and the token estimate", () => {
    renderWithIntl(<ProjectContextSection skill={SKILL} />);

    expect(screen.getByText("0 of 2 attached")).toBeInTheDocument();
    expect(screen.queryByText(/tokens/)).not.toBeInTheDocument();

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);

    expect(screen.getByText("1 of 2 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 80 tokens")).toBeInTheDocument();

    fireEvent.click(checkboxes[1]!);
    expect(screen.getByText("2 of 2 attached")).toBeInTheDocument();
    expect(screen.getByText("≈ 300 tokens")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Save context"));
    expect(setContextMutate).toHaveBeenCalledWith(
      { skillId: "sk1", repoId: "r1", paths: ["specs/a.md", "specs/b.md"] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });

  it("shows each document's token count and previews a document", () => {
    renderWithIntl(<ProjectContextSection skill={SKILL} />);
    expect(screen.getByText("80t")).toBeInTheDocument();
    expect(screen.getByText("220t")).toBeInTheDocument();

    fireEvent.click(screen.getAllByText("Preview")[0]!);
    expect(screen.getByLabelText("Document preview")).toBeInTheDocument();
    expect(screen.getByText("Body of specs/a.md.")).toBeInTheDocument();
  });

  it("reorders via the drag handle's arrow keys", () => {
    renderWithIntl(<ProjectContextSection skill={SKILL} />);

    const checkboxes = screen.getAllByRole("checkbox");
    fireEvent.click(checkboxes[0]!);
    fireEvent.click(checkboxes[1]!);

    fireEvent.keyDown(screen.getByLabelText(/Reorder a\.md/), { key: "ArrowDown" });

    fireEvent.click(screen.getByText("Save context"));
    expect(setContextMutate).toHaveBeenLastCalledWith(
      { skillId: "sk1", repoId: "r1", paths: ["specs/b.md", "specs/a.md"] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
