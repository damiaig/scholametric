import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { AgendaView } from "./AgendaView";

// The real flatpickr widget is proven once, in styled-date-picker.test.tsx
// — everywhere else (here) mocks it down to its value/onChange contract so
// these tests aren't driving a real calendar through many files.
vi.mock("../../components/ui/styled-date-picker", () => ({
  StyledDatePicker: ({ value, onChange }: { value: string; onChange: (v: string) => void }) => (
    <button type="button" aria-label="Choose a date" onClick={() => onChange("2026-09-25")}>
      {value}
    </button>
  ),
}));

function makeDay(date: string, dayOfWeek: ResolvedTimetableDay["dayOfWeek"], overrides: Partial<ResolvedTimetableDay> = {}): ResolvedTimetableDay {
  return { date, dayOfWeek, isSchoolDay: true, nonSchoolReason: null, holidayName: null, periods: [], breaks: [], ...overrides };
}

const TODAY = new Date(2026, 8, 14); // Monday

afterEach(() => cleanup());

describe("AgendaView", () => {
  it("renders the single given day's card", () => {
    render(<AgendaView day={makeDay("2026-09-30", "WEDNESDAY")} onPrevDay={vi.fn()} onNextDay={vi.fn()} onPickDate={vi.fn()} onToday={vi.fn()} today={TODAY} />);
    expect(screen.getByText("Wednesday")).toBeInTheDocument();
    expect(screen.getByText("Nothing scheduled.")).toBeInTheDocument();
  });

  it("Next day and Previous day call their handlers", async () => {
    const onPrevDay = vi.fn();
    const onNextDay = vi.fn();
    const user = userEvent.setup();
    // navigated a day forward, so Previous is enabled
    render(<AgendaView day={makeDay("2026-09-15", "TUESDAY")} onPrevDay={onPrevDay} onNextDay={onNextDay} onPickDate={vi.fn()} onToday={vi.fn()} today={TODAY} />);

    await user.click(screen.getByRole("button", { name: "Previous day" }));
    expect(onPrevDay).toHaveBeenCalledTimes(1);

    await user.click(screen.getByRole("button", { name: "Next day" }));
    expect(onNextDay).toHaveBeenCalledTimes(1);
  });

  it("picking a date via the picker calls onPickDate", async () => {
    const onPickDate = vi.fn();
    const user = userEvent.setup();
    render(<AgendaView day={makeDay("2026-09-14", "MONDAY")} onPrevDay={vi.fn()} onNextDay={vi.fn()} onPickDate={onPickDate} onToday={vi.fn()} today={TODAY} />);

    await user.click(screen.getByLabelText("Choose a date"));
    expect(onPickDate).toHaveBeenCalledWith("2026-09-25");
  });

  // v0.8.1 step 1 (SPEC_V0.8.1.md §2.3) — the navigation floor: can't go
  // before today. Previous is disabled exactly on today; the Today
  // shortcut only shows once navigated away (nothing to jump back to
  // otherwise).
  it("disables Previous day and hides the Today shortcut when viewing today", () => {
    render(<AgendaView day={makeDay("2026-09-14", "MONDAY")} onPrevDay={vi.fn()} onNextDay={vi.fn()} onPickDate={vi.fn()} onToday={vi.fn()} today={TODAY} />);
    expect(screen.getByRole("button", { name: "Previous day" })).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Today" })).not.toBeInTheDocument();
  });

  it("enables Previous day and shows the Today shortcut once navigated to a different day", async () => {
    const onToday = vi.fn();
    const user = userEvent.setup();
    render(<AgendaView day={makeDay("2026-09-16", "WEDNESDAY")} onPrevDay={vi.fn()} onNextDay={vi.fn()} onPickDate={vi.fn()} onToday={onToday} today={TODAY} />);

    expect(screen.getByRole("button", { name: "Previous day" })).not.toBeDisabled();
    await user.click(screen.getByRole("button", { name: "Today" }));
    expect(onToday).toHaveBeenCalledTimes(1);
  });

  // v0.8.1 step 1 (SPEC_V0.8.1.md §2.5) — landing on a non-school day
  // renders the informative state, same as any other day; nothing here
  // skips it.
  it("a weekend day renders 'No school — Weekend', not skipped", () => {
    render(
      <AgendaView
        day={makeDay("2026-09-20", "SUNDAY", { isSchoolDay: false, nonSchoolReason: "WEEKEND" })}
        onPrevDay={vi.fn()}
        onNextDay={vi.fn()}
        onPickDate={vi.fn()}
        onToday={vi.fn()}
        today={TODAY}
      />,
    );
    expect(screen.getByText(/No school — Weekend/)).toBeInTheDocument();
  });
});
