import { describe, it, expect, afterEach, beforeEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ConventionSkillDraft } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/conventions.json";
import { ApiError } from "@/lib/api";

const push = vi.fn();
const createMutateAsync = vi.fn();
const draftQuery = vi.fn();

let draft: ConventionSkillDraft | undefined;
let draftLoading = false;
let creating = false;

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
}));

vi.mock("@/lib/hooks/conventions", () => ({
  useConventionSkillDraft: (repoId: string, ids: string[], enabled: boolean) => {
    draftQuery(repoId, ids, enabled);
    return { data: draft, isLoading: draftLoading };
  },
  useCreateConventionSkill: () => ({ mutateAsync: createMutateAsync, isPending: creating }),
}));

import { CreateSkillModal } from "./CreateSkillModal";

const DRAFT: ConventionSkillDraft = {
  name: "acme-conventions",
  description: "House rules extracted from acme/devdigest.",
  body: "## Conventions — name hooks use<Thing>.",
  evidence_files: ["src/lib/hooks/core.ts"],
  convention_ids: ["cv1", "cv2"],
};

const onClose = vi.fn();

function renderModal(conventionIds = ["cv1", "cv2"]) {
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
  createMutateAsync.mockResolvedValue({ id: "sk9" });
  draft = DRAFT;
  draftLoading = false;
  creating = false;
});
afterEach(cleanup);

describe("CreateSkillModal", () => {
  it("prefills the form from the draft and reports the merged count", () => {
    renderModal();
    expect(screen.getByDisplayValue(DRAFT.name)).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.description)).toBeInTheDocument();
    expect(screen.getByDisplayValue(DRAFT.body)).toBeInTheDocument();
    expect(
      screen.getByText(/Merged from 2 accepted conventions in acme\/devdigest/),
    ).toBeInTheDocument();
  });

  it("shows skeletons and blocks Create while the draft is loading", () => {
    draft = undefined;
    draftLoading = true;
    renderModal();
    expect(screen.queryByDisplayValue(DRAFT.name)).not.toBeInTheDocument();
    expect(screen.getByText("Assembling the draft…")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });

  it("gives the Enabled switch an accessible name", () => {
    renderModal();
    const toggle = screen.getByRole("switch", { name: "Enabled" });
    expect(toggle).toHaveAttribute("aria-checked", "true");
    fireEvent.click(toggle);
    expect(screen.getByRole("switch", { name: "Enabled" })).toHaveAttribute(
      "aria-checked",
      "false",
    );
  });

  it("creates the skill from the edited values, then closes and navigates", async () => {
    renderModal();
    fireEvent.change(screen.getByDisplayValue(DRAFT.name), {
      target: { value: "acme-house-rules" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    await waitFor(() => expect(createMutateAsync).toHaveBeenCalledTimes(1));
    expect(createMutateAsync).toHaveBeenCalledWith({
      repoId: "r1",
      name: "acme-house-rules",
      description: DRAFT.description,
      type: "convention",
      body: DRAFT.body,
      enabled: true,
      convention_ids: ["cv1", "cv2"],
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
    expect(push).toHaveBeenCalledWith("/skills/sk9?tab=config");
  });

  it("keeps the modal open and shows an inline error when the POST fails", async () => {
    createMutateAsync.mockRejectedValue(new ApiError("Skill name already taken", 409));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Skill name already taken");
    expect(onClose).not.toHaveBeenCalled();
    expect(push).not.toHaveBeenCalled();
    // The typed draft is still on screen — nothing was reset.
    expect(screen.getByDisplayValue(DRAFT.name)).toBeInTheDocument();
  });

  it("falls back to a generic message when the failure is not an ApiError", async () => {
    createMutateAsync.mockRejectedValue(new Error("boom"));
    renderModal();
    fireEvent.click(screen.getByRole("button", { name: "Create skill" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not create the skill");
  });

  it("freezes the convention ids for the modal's lifetime", () => {
    const { rerender } = renderModal(["cv1", "cv2"]);
    expect(draftQuery).toHaveBeenLastCalledWith("r1", ["cv1", "cv2"], true);

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
    expect(draftQuery).toHaveBeenLastCalledWith("r1", ["cv1", "cv2"], true);
    expect(
      screen.getByText(/Merged from 2 accepted conventions in acme\/devdigest/),
    ).toBeInTheDocument();
  });

  it("blocks Create while the name or body is empty", () => {
    draft = { ...DRAFT, name: "" };
    renderModal();
    expect(screen.getByRole("button", { name: "Create skill" })).toBeDisabled();
  });
});
