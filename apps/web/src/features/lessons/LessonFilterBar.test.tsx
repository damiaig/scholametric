import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { LessonFilterBar } from "./LessonFilterBar";

// StyledDatePicker's own correctness is proven once in
// styled-date-picker.test.tsx — mocked here down to a plain native
// input, the same convention LessonFormDialog.test.tsx already
// established (real flatpickr is readOnly and can't be typed into
// directly in jsdom).
vi.mock("../../components/ui/styled-date-picker", () => ({
  StyledDatePicker: ({ id, value, onChange, placeholder }: { id?: string; value: string; onChange: (value: string) => void; placeholder?: string }) => (
    <input id={id} value={value} placeholder={placeholder} onChange={(event) => onChange(event.target.value)} />
  ),
}));

afterEach(() => cleanup());

const SUBJECTS = [
  { id: "sub1", name: "Mathematics" },
  { id: "sub2", name: "English" },
];

describe("LessonFilterBar", () => {
  it("renders All + each subject when there is more than one", () => {
    render(<LessonFilterBar subjects={SUBJECTS} selectedSubjectId="" onSubjectChange={vi.fn()} weekAnchor="" onWeekAnchorChange={vi.fn()} onReset={vi.fn()} />);

    const select = screen.getByRole("combobox", { name: "Subject" }) as HTMLSelectElement;
    expect([...select.options].map((option) => option.text)).toEqual(["All", "Mathematics", "English"]);
  });

  it("hides the subject control entirely when there is one option or none", () => {
    render(<LessonFilterBar subjects={[SUBJECTS[0]]} selectedSubjectId="" onSubjectChange={vi.fn()} weekAnchor="" onWeekAnchorChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "Subject" })).not.toBeInTheDocument();

    cleanup();
    render(<LessonFilterBar subjects={[]} selectedSubjectId="" onSubjectChange={vi.fn()} weekAnchor="" onWeekAnchorChange={vi.fn()} onReset={vi.fn()} />);
    expect(screen.queryByRole("combobox", { name: "Subject" })).not.toBeInTheDocument();
  });

  it("selecting a subject calls onSubjectChange with that subject's id", async () => {
    const onSubjectChange = vi.fn();
    const user = userEvent.setup();
    render(<LessonFilterBar subjects={SUBJECTS} selectedSubjectId="" onSubjectChange={onSubjectChange} weekAnchor="" onWeekAnchorChange={vi.fn()} onReset={vi.fn()} />);

    await user.selectOptions(screen.getByRole("combobox", { name: "Subject" }), "sub2");
    expect(onSubjectChange).toHaveBeenCalledWith("sub2");
  });

  // The real StyledDatePicker's input is read-only — a date is picked via
  // the calendar UI, which fires onChange ONCE with a complete ISO date,
  // never per-keystroke. fireEvent.change mirrors that single-shot
  // interaction faithfully (user.type against the mocked plain input
  // would instead fire once per character).
  it("picking a week date calls onWeekAnchorChange", () => {
    const onWeekAnchorChange = vi.fn();
    render(<LessonFilterBar subjects={SUBJECTS} selectedSubjectId="" onSubjectChange={vi.fn()} weekAnchor="" onWeekAnchorChange={onWeekAnchorChange} onReset={vi.fn()} />);

    fireEvent.change(screen.getByLabelText("Week"), { target: { value: "2026-10-19" } });
    expect(onWeekAnchorChange).toHaveBeenCalledWith("2026-10-19");
  });

  it("'Show all' calls onReset", async () => {
    const onReset = vi.fn();
    const user = userEvent.setup();
    render(<LessonFilterBar subjects={SUBJECTS} selectedSubjectId="sub1" onSubjectChange={vi.fn()} weekAnchor="2026-10-19" onWeekAnchorChange={vi.fn()} onReset={onReset} />);

    await user.click(screen.getByRole("button", { name: "Show all" }));
    expect(onReset).toHaveBeenCalledTimes(1);
  });
});
