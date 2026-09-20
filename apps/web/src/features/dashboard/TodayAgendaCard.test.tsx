import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { TodayAgendaCard } from "./TodayAgendaCard";

const TODAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [
    {
      periodId: "p1",
      periodName: "Period 1",
      startsAt: "08:00",
      endsAt: "08:45",
      subjectId: "sub1",
      subjectName: "Mathematics",
      teacherUserId: "t1",
      teacherName: "Bola Ogundare",
      classArmId: "arm1",
      className: "JSS 2 A",
      status: null,
      exceptionId: null,
      note: null,
      replacementTeacherUserId: null,
      replacementTeacherName: null,
      replacementSubjectId: null,
      replacementSubjectName: null,
      activityLabel: null,
    },
  ],
  breaks: [],
};

function renderCard(props: Partial<Parameters<typeof TodayAgendaCard>[0]> = {}) {
  return render(
    <MemoryRouter>
      <TodayAgendaCard data={{ days: [TODAY] }} isLoading={false} isError={false} error={null} onRetry={vi.fn()} linkHref="/me/timetable" {...props} />
    </MemoryRouter>,
  );
}

afterEach(() => cleanup());

describe("TodayAgendaCard", () => {
  it("renders today's periods and a link to the full agenda", () => {
    renderCard();
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Full agenda →" })).toHaveAttribute("href", "/me/timetable");
  });

  it("shows a loading state", () => {
    renderCard({ data: undefined, isLoading: true });
    expect(screen.getByText("Loading…")).toBeInTheDocument();
  });

  it("shows an error state with retry", () => {
    const onRetry = vi.fn();
    renderCard({ data: undefined, isError: true, error: new Error("boom"), onRetry });
    expect(screen.getByText("Couldn't load today's schedule.")).toBeInTheDocument();
    screen.getByRole("button", { name: "Try again" }).click();
    expect(onRetry).toHaveBeenCalled();
  });
});
