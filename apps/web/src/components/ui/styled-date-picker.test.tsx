import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { StyledDatePicker } from "./styled-date-picker";

afterEach(() => cleanup());

// v0.8.1 step 1 (SPEC_V0.8.1.md §2.2) — the ONE place a real flatpickr
// instance is mounted and driven in the test suite. Every other consumer
// (AgendaView etc.) mocks this component entirely, so its own correctness
// only needs proving once, here.
describe("StyledDatePicker", () => {
  it("renders the given value as a friendly-formatted date", () => {
    render(<StyledDatePicker value="2026-09-14" onChange={vi.fn()} aria-label="Choose a date" />);
    expect(screen.getByLabelText("Choose a date")).toHaveValue("Sep 14, 2026");
  });

  it("is read-only — cannot be typed into directly", () => {
    render(<StyledDatePicker value="2026-09-14" onChange={vi.fn()} aria-label="Choose a date" />);
    expect(screen.getByLabelText("Choose a date")).toHaveAttribute("readonly");
  });

  it("opening the calendar and picking a day calls onChange with the ISO date", async () => {
    const onChange = vi.fn();
    const user = userEvent.setup();
    render(<StyledDatePicker value="2026-09-14" onChange={onChange} aria-label="Choose a date" />);

    await user.click(screen.getByLabelText("Choose a date"));
    const day20 = await screen.findByText("20", { selector: ".flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)" });
    await user.click(day20);

    expect(onChange).toHaveBeenCalledWith("2026-09-20");
  });

  it("minDate disables every date before it in the calendar", async () => {
    const user = userEvent.setup();
    render(<StyledDatePicker value="2026-09-14" onChange={vi.fn()} minDate="2026-09-14" aria-label="Choose a date" />);

    await user.click(screen.getByLabelText("Choose a date"));
    const day10 = await screen.findByText("10", { selector: ".flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)" });
    expect(day10).toHaveClass("flatpickr-disabled");
  });

  it("does not disable minDate itself or dates after it", async () => {
    const user = userEvent.setup();
    render(<StyledDatePicker value="2026-09-14" onChange={vi.fn()} minDate="2026-09-14" aria-label="Choose a date" />);

    await user.click(screen.getByLabelText("Choose a date"));
    const day14 = await screen.findByText("14", { selector: ".flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)" });
    const day20 = await screen.findByText("20", { selector: ".flatpickr-day:not(.prevMonthDay):not(.nextMonthDay)" });
    expect(day14).not.toHaveClass("flatpickr-disabled");
    expect(day20).not.toHaveClass("flatpickr-disabled");
  });

  it("an external value change (e.g. a Next-day button, not the calendar) moves the picker without a fresh instance", async () => {
    const { rerender } = render(<StyledDatePicker value="2026-09-14" onChange={vi.fn()} aria-label="Choose a date" />);
    rerender(<StyledDatePicker value="2026-09-20" onChange={vi.fn()} aria-label="Choose a date" />);
    await waitFor(() => expect(screen.getByLabelText("Choose a date")).toHaveValue("Sep 20, 2026"));
  });

  // v0.8.1 step 2 (SPEC_V0.8.1.md §2.6) — a blank form field (e.g. a new
  // holiday not yet dated) passes value="" rather than some arbitrary
  // default date; the widget must start empty, not crash or show a
  // garbage date, and clear itself if the value is reset back to "".
  it("an empty value renders blank, with the given placeholder, instead of an arbitrary date", () => {
    render(<StyledDatePicker value="" onChange={vi.fn()} placeholder="Select a date…" aria-label="Choose a date" />);
    expect(screen.getByLabelText("Choose a date")).toHaveValue("");
    expect(screen.getByLabelText("Choose a date")).toHaveAttribute("placeholder", "Select a date…");
  });

  it("clears back to blank when value is reset to '' after a date was picked", async () => {
    const { rerender } = render(<StyledDatePicker value="2026-09-14" onChange={vi.fn()} aria-label="Choose a date" />);
    rerender(<StyledDatePicker value="" onChange={vi.fn()} aria-label="Choose a date" />);
    await waitFor(() => expect(screen.getByLabelText("Choose a date")).toHaveValue(""));
  });
});
