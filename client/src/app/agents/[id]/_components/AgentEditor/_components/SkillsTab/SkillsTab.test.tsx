import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";
import { ToastProvider } from "@/lib/toast";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn() }),
}));

const setSkillsMutate = vi.fn();
const toggleAgentSkillMutate = vi.fn();

vi.mock("@/lib/hooks/skills", () => ({
  useSkills: () => ({
    data: [
      { id: "sk1", name: "sql-safety", description: "Flags raw SQL", type: "review", source: "local", body: "", enabled: true, version: 1 },
      { id: "sk2", name: "secrets-scan", description: "Flags secrets", type: "review", source: "local", body: "", enabled: true, version: 1 },
    ],
  }),
  useAgentSkills: () => ({
    data: [
      { agent_id: "ag1", skill_id: "sk1", order: 0, enabled: true },
    ],
    isLoading: false,
  }),
  useSetAgentSkills: () => ({ mutate: setSkillsMutate, isPending: false, isSuccess: false }),
  useToggleAgentSkill: () => ({ mutate: toggleAgentSkillMutate, isPending: false }),
}));

import { SkillsTab } from "./SkillsTab";

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

describe("SkillsTab", () => {
  it("renders the catalog and marks attached skills", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    expect(screen.getByText("Skills")).toBeInTheDocument();
    expect(screen.getByText("sql-safety")).toBeInTheDocument();
    expect(screen.getByText("secrets-scan")).toBeInTheDocument();
    expect(screen.getByText("1 of 2 enabled")).toBeInTheDocument();
  });

  it("attaches an unattached skill via its checkbox", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const checkboxes = screen.getAllByRole("checkbox");
    // second row (secrets-scan) starts unattached
    fireEvent.click(checkboxes[1]!);
    expect(screen.getByText("2 of 2 enabled")).toBeInTheDocument();
  });

  it("toggles a link's enabled state immediately", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    const linkToggle = screen.getByRole("switch");
    fireEvent.click(linkToggle);
    expect(toggleAgentSkillMutate).toHaveBeenCalledWith({ agentId: "ag1", skillId: "sk1", enabled: false });
  });

  it("saves the ordered id list on Save", () => {
    renderWithIntl(<SkillsTab agent={AGENT} />);
    fireEvent.click(screen.getByText("Save skills"));
    expect(setSkillsMutate).toHaveBeenCalledWith(
      { agentId: "ag1", skillIds: ["sk1"] },
      expect.objectContaining({ onSuccess: expect.any(Function) }),
    );
  });
});
