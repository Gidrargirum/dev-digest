import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, ConventionSkillDraftSet } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ApiError } from "@/lib/api";

const push = vi.fn();
const createMutateAsync = vi.fn();
const draftQuery = vi.fn();

let draftSet: ConventionSkillDraftSet | undefined;
let draftLoading = false;
let creating = false;
let agents: Agent[] | undefined;
let agentsLoading = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDrafts: (repoId: string, ids: string[], enabled: boolean) => {
    draftQuery(repoId, ids, enabled);
    return { data: draftSet, isLoading: draftLoading };
  },
  useCreateConventionSkills: () => ({ mutateAsync: createMutateAsync, isPending: creating }),
}));

vi.mock("@/lib/hooks/agents", () => ({
  useAgents: () => ({ data: agents, isLoading: agentsLoading }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

// Two categories, each with a distinct draft — matches the ≥2 accepted
// candidates per category rule that earns its own skill on the backend.
const DRAFT_SET: ConventionSkillDraftSet = {
  drafts: [
    {
      name: "acme-naming-conventions",
      description: "Naming rules extracted from acme/devdigest.",
      body: "## Conventions — name hooks use<Thing>.",
      evidence_files: ["src/lib/hooks/core.ts"],
      convention_ids: ["cv1", "cv2"],
      category: "naming",
    },
    {
      name: "acme-structure-conventions",
      description: "Structure rules extracted from acme/devdigest.",
      body: "## Conventions — colocate styles.ts.",
      evidence_files: ["src/components/Card.tsx"],
      convention_ids: ["cv3", "cv4"],
      category: "structure",
    },
  ],
};

const AGENTS: Agent[] = [
  {
    id: "a1",
    name: "API Contract Reviewer",
    description: "",
    provider: "anthropic",
    model: "claude",
    system_prompt: "",
    enabled: true,
    version: 1,
    strategy: "single-pass",
    ci_fail_on: "critical",
    repo_intel: true,
  } as Agent,
];

const onClose = vi.fn();

function renderModal(conventionIds = ["cv1", "cv2", "cv3", "cv4"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
      <CreateSkillModal
        repoId="r1"
        repoLabel="acme/devdigest"
        conventionIds={conventionIds}
        onClose={onClose}
      />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => {
  push.mockClear();
  onClose.mockClear();
  draftQuery.mockClear();
  createMutateAsync.mockReset();
  createMutateAsync.mockResolvedValue({ skills: [{ id: "sk9" }, { id: "sk10" }] });
  draftSet = DRAFT_SET;
  draftLoading = false;
  creating = false;
  agents = AGENTS;
  agentsLoading = false;
});
afterEach(cleanup);

describe("CreateSkillModal", () => {
  it("shows one section per category draft, submits an edited body, an agent pick and the merged POST", async () => {
    renderModal();

    // Two sections rendered, each prefilled with its own draft's name.
    expect(screen.getByDisplayValue("acme-naming-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("acme-structure-conventions")).toBeInTheDocument();

    // Edit the second draft's body only.
    const bodies = screen.getAllByDisplayValue(/## Conventions/);
    expect(bodies).toHaveLength(2);
    fireEvent.change(bodies[1]!, { target: { value: "## Conventions — edited body." } });

    // Pick an agent to attach.
    fireEvent.click(screen.getByRole("checkbox", { name: "API Contract Reviewer" }));

    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      repoId: "r1",
      drafts: [
        {
          name: "acme-naming-conventions",
          description: DRAFT_SET.drafts[0]!.description,
          type: "convention",
          body: DRAFT_SET.drafts[0]!.body,
          enabled: true,
          convention_ids: ["cv1", "cv2"],
        },
        {
          name: "acme-structure-conventions",
          description: DRAFT_SET.drafts[1]!.description,
          type: "convention",
          body: "## Conventions — edited body.",
          enabled: true,
          convention_ids: ["cv3", "cv4"],
        },
      ],
      agent_ids: ["a1"],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    // More than one skill created → the skills list, not a single config tab.
    expect(push).toHaveBeenCalledWith("/skills");
  });

  it("keeps the modal open and shows an inline error when the POST fails", async () => {
    createMutateAsync.mockRejectedValue(new ApiError("Skill name already taken", 409));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Skill name already taken");
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // The typed drafts are still on screen — nothing was reset.
    expect(screen.getByDisplayValue("acme-naming-conventions")).toBeInTheDocument();
    expect(screen.getByDisplayValue("acme-structure-conventions")).toBeInTheDocument();
  });

  it("shows skeletons and blocks Create while the draft set is loading", () => {
    draftSet = undefined;
    draftLoading = true;
    renderModal();
    expect(screen.queryByDisplayValue("acme-naming-conventions")).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("navigates to the single skill's config tab when exactly one skill is created", async () => {
    draftSet = { drafts: [DRAFT_SET.drafts[0]!] };
    createMutateAsync.mockResolvedValue({ skills: [{ id: "sk9" }] });
    renderModal(["cv1", "cv2"]);

    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/skills/sk9?tab=config");
  });

  it("does not block submit while agents are still loading, and omits agent_ids when none are picked", async () => {
    agents = undefined;
    agentsLoading = true;
    renderModal();

    expect(screen.getByRole("button", { name: "Create skill" })).not.toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    const call = createMutateAsync.mock.calls[0]![0];
    expect(call.agent_ids).toBeUndefined();
  });

  it("freezes the convention ids for the modal's lifetime", () => {
    const { rerender } = renderModal(["cv1", "cv2", "cv3", "cv4"]);
    expect(draftQuery).toHaveBeenLastCalledWith("r1", ["cv1", "cv2", "cv3", "cv4"], true);

    // A background poll changes the accepted set while the modal is open.
    rerender(
      <NextIntlClientProvider locale="en" messages={{ conventions: messages }}>
        <CreateSkillModal
          repoId="r1"
          repoLabel="acme/devdigest"
          conventionIds={["cv1"]}
          onClose={onClose}
        />
      </NextIntlClientProvider>,
    );
    expect(draftQuery).toHaveBeenLastCalledWith("r1", ["cv1", "cv2", "cv3", "cv4"], true);
  });

  it("blocks Create while any draft's name or body is empty", () => {
    draftSet = { drafts: [{ ...DRAFT_SET.drafts[0]!, name: "" }, DRAFT_SET.drafts[1]!] };
    renderModal();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });
});
