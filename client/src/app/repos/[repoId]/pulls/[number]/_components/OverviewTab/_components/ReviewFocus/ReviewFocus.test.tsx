import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../../../../../../../../messages/en/prReview.json";
import { ReviewFocus } from "./ReviewFocus";

afterEach(cleanup);

describe("ReviewFocus", () => {
  it("renders grounded refs and opens a range at its first line", async () => {
    const onOpenFile = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <ReviewFocus
          items={[{ label: "Check authorization", file_refs: ["src/auth.ts:12-18"] }]}
          onOpenFile={onOpenFile}
        />
      </NextIntlClientProvider>,
    );

    expect(screen.getByText("Review focus — read these first")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "src/auth.ts:12-18" }));
    expect(onOpenFile).toHaveBeenCalledWith("src/auth.ts", 12);
  });
});
