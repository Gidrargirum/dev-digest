import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { HoverCard } from "./HoverCard";

afterEach(cleanup);

function setup() {
  const onRowClick = vi.fn();
  render(
    // The PR list row is itself clickable — the hover card sits inside it.
    <div onClick={onRowClick}>
      <HoverCard label="Show findings" panel={<div>panel body</div>}>
        <span>2 findings</span>
      </HoverCard>
    </div>,
  );
  return { trigger: screen.getByRole("button", { name: "Show findings" }), onRowClick };
}

describe("HoverCard", () => {
  it("opens on hover and closes when the pointer leaves", async () => {
    const { trigger } = setup();
    expect(screen.queryByRole("tooltip")).not.toBeInTheDocument();

    fireEvent.mouseEnter(trigger);
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument());
    expect(screen.getByText("panel body")).toBeInTheDocument();

    fireEvent.mouseLeave(trigger);
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("opens on keyboard focus and closes on Escape", async () => {
    const { trigger } = setup();
    fireEvent.focus(trigger);
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument());

    fireEvent.keyDown(trigger, { key: "Escape" });
    await waitFor(() => expect(screen.queryByRole("tooltip")).not.toBeInTheDocument());
  });

  it("does not let a click through to the row underneath", async () => {
    const { trigger, onRowClick } = setup();
    fireEvent.click(trigger);
    await waitFor(() => expect(screen.getByRole("tooltip")).toBeInTheDocument());
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
