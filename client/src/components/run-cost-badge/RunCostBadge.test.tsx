import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge", () => {
  it("renders an em dash when cost is null", () => {
    render(<RunCostBadge costUsd={null} variant="compact" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });

  it("renders a compact cost", () => {
    render(<RunCostBadge costUsd={0.014} variant="compact" />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("renders cost + tokens in the detailed variant", () => {
    render(<RunCostBadge costUsd={0.014} tokensIn={8200} tokensOut={1300} variant="detailed" />);
    expect(screen.getByText("$0.014 · 8.2K→1.3K")).toBeInTheDocument();
  });

  it("renders a bare em dash in the detailed variant when cost is null", () => {
    render(<RunCostBadge costUsd={null} tokensIn={8200} tokensOut={1300} variant="detailed" />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
