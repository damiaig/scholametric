import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { WeekNavigation } from "./WeekNavigation";

afterEach(() => cleanup());

describe("WeekNavigation", () => {
  it("renders the label and calls onPrevious/onNext/onToday", async () => {
    const user = userEvent.setup();
    const onPrevious = vi.fn();
    const onNext = vi.fn();
    const onToday = vi.fn();
    render(<WeekNavigation label="This week" onPrevious={onPrevious} onNext={onNext} onToday={onToday} />);

    expect(screen.getByText("This week")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(onPrevious).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(onNext).toHaveBeenCalledTimes(1);

    await user.click(screen.getByText("This week"));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("the reset button is findable by a stable accessible name regardless of its dynamic label text", async () => {
    const user = userEvent.setup();
    const onToday = vi.fn();
    render(<WeekNavigation label="Sep 21, 2026 – Sep 27, 2026" onPrevious={vi.fn()} onNext={vi.fn()} onToday={onToday} />);

    await user.click(screen.getByRole("button", { name: "Reset to today" }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  it("shows whatever label the caller passes (e.g. a resolved date range once navigated)", () => {
    render(<WeekNavigation label="Sep 28 – Oct 4, 2026" onPrevious={vi.fn()} onNext={vi.fn()} onToday={vi.fn()} />);
    expect(screen.getByText("Sep 28 – Oct 4, 2026")).toBeInTheDocument();
  });
});
