import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeekNavigation } from "./WeekNavigation";

afterEach(() => cleanup());

describe("WeekNavigation", () => {
  it("renders the label and calls onNext/onToday", async () => {
    const user = userEvent.setup();
    const onNext = vi.fn();
    const onToday = vi.fn();
    render(<WeekNavigation label="This week" onNext={onNext} onToday={onToday} />);

    expect(screen.getByText("This week")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(onNext).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("This week"));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  // v0.8 walk-found fix — Previous is removed permanently (the calendar is
  // timetable-only, so the past never has anything new), not just hidden.
  it("has no Previous week button at all", () => {
    render(<WeekNavigation label="This week" onNext={vi.fn()} onToday={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "Previous week" })).not.toBeInTheDocument();
  });

  it("the reset button is findable by a stable accessible name regardless of its dynamic label text", async () => {
    const user = userEvent.setup();
    const onToday = vi.fn();
    render(<WeekNavigation label="Sep 21, 2026 – Sep 27, 2026" onNext={vi.fn()} onToday={onToday} />);

    await user.click(screen.getByRole("button", { name: "Reset to today" }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("shows whatever label the caller passes (e.g. a resolved date range once navigated)", () => {
    render(<WeekNavigation label="Sep 28 – Oct 4, 2026" onNext={vi.fn()} onToday={vi.fn()} />);
    expect(screen.getByText("Sep 28 – Oct 4, 2026")).toBeInTheDocument();
  });
});
