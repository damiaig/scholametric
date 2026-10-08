import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyledFileInput } from "./styled-file-input";

afterEach(() => {
  cleanup();
});

// v0.8.3 step 5 (SPEC_V0.8.3.md §2.8, Item 8) — the one shared file-input
// skin. A real <input type="file"> underneath (hidden via sr-only, not
// display:none/removed) — existing consumers' document.querySelector +
// userEvent.upload keep working against the real node unchanged.
describe("StyledFileInput", () => {
  it("renders the button label and 'No file chosen' before any selection", () => {
    render(<StyledFileInput buttonLabel="Attach a file" onFileSelected={vi.fn()} />);

    expect(screen.getByRole("button", { name: "Attach a file" })).toBeInTheDocument();
    expect(screen.getByText("No file chosen")).toBeInTheDocument();
  });

  it("selecting a file fires onFileSelected with that exact File, and shows its name", async () => {
    const onFileSelected = vi.fn();
    render(<StyledFileInput buttonLabel="Attach a file" onFileSelected={onFileSelected} />);

    const file = new File(["hello"], "worksheet.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const user = userEvent.setup();
    await user.upload(input, file);

    expect(onFileSelected).toHaveBeenCalledWith(file);
    expect(screen.getByText("worksheet.pdf")).toBeInTheDocument();
    expect(screen.queryByText("No file chosen")).not.toBeInTheDocument();
  });

  it("the native input resets its value after each pick, so the same file can be re-selected", async () => {
    const onFileSelected = vi.fn();
    render(<StyledFileInput buttonLabel="Attach a file" onFileSelected={onFileSelected} />);

    const file = new File(["hello"], "worksheet.pdf", { type: "application/pdf" });
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const user = userEvent.setup();

    await user.upload(input, file);
    expect(input.value).toBe("");
    await user.upload(input, file);

    expect(onFileSelected).toHaveBeenCalledTimes(2);
  });

  it("disabled disables both the button and the underlying input", () => {
    render(<StyledFileInput buttonLabel="Attach a file" onFileSelected={vi.fn()} disabled />);

    expect(screen.getByRole("button", { name: "Attach a file" })).toBeDisabled();
    expect(document.querySelector('input[type="file"]')).toBeDisabled();
  });
});
