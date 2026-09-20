import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { AgendaDayCard } from "./AgendaDayCard";

const BASE_PERIOD_ENTRY = {
  status: null,
  exceptionId: null,
  note: null,
  replacementTeacherUserId: null,
  replacementTeacherName: null,
  replacementSubjectId: null,
  replacementSubjectName: null,
  activityLabel: null,
};

const SCHOOL_DAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [
    { ...BASE_PERIOD_ENTRY, periodId: "p1", periodName: "Period 1", startsAt: "08:00", endsAt: "08:45", subjectId: "sub1", subjectName: "Mathematics", teacherUserId: "t1", teacherName: "Bola Ogundare", classArmId: "arm1", className: "JSS 2 A" },
    { ...BASE_PERIOD_ENTRY, periodId: "p2", periodName: "Period 2", startsAt: "09:00", endsAt: "09:45", subjectId: null, subjectName: null, teacherUserId: null, teacherName: null, classArmId: null, className: null },
  ],
  breaks: [{ breakId: "b1", name: "Lunch", startsAt: "08:45", endsAt: "09:00" }],
};

const CANCELLED_DAY: ResolvedTimetableDay = {
  ...SCHOOL_DAY,
  periods: [
    { ...SCHOOL_DAY.periods[0], status: "CANCELLED", exceptionId: "exc1", note: "Down with malaria" },
  ],
  breaks: [],
};

const REPLACED_DAY: ResolvedTimetableDay = {
  ...SCHOOL_DAY,
  periods: [
    {
      ...SCHOOL_DAY.periods[0],
      status: "REPLACED",
      exceptionId: "exc1",
      replacementTeacherUserId: "t2",
      replacementTeacherName: "Ahmed Suleiman",
      activityLabel: "Prep/Study period",
    },
  ],
  breaks: [],
};

const HOLIDAY_DAY: ResolvedTimetableDay = {
  date: "2026-09-16",
  dayOfWeek: "WEDNESDAY",
  isSchoolDay: false,
  nonSchoolReason: "HOLIDAY",
  holidayName: "Founders Day",
  periods: [],
  breaks: [],
};

const WEEKEND_DAY: ResolvedTimetableDay = {
  date: "2026-09-20",
  dayOfWeek: "SUNDAY",
  isSchoolDay: false,
  nonSchoolReason: "WEEKEND",
  holidayName: null,
  periods: [],
  breaks: [],
};

afterEach(() => cleanup());

describe("AgendaDayCard", () => {
  it("renders periods and breaks merged in time order", () => {
    render(<AgendaDayCard day={SCHOOL_DAY} />);
    const items = screen.getAllByRole("listitem").map((li) => li.textContent);
    expect(items[0]).toContain("Mathematics");
    expect(items[1]).toContain("Lunch");
    expect(items[2]).toContain("Free period");
  });

  it("shows the weekday header by default, or 'Today' in compact mode", () => {
    render(<AgendaDayCard day={SCHOOL_DAY} />);
    expect(screen.getByText("Monday")).toBeInTheDocument();
    cleanup();
    render(<AgendaDayCard day={SCHOOL_DAY} compact />);
    expect(screen.getByText("Today")).toBeInTheDocument();
  });

  it("a cancelled period shows 'Cancelled — teacher absent', struck-through original", () => {
    render(<AgendaDayCard day={CANCELLED_DAY} />);
    expect(screen.getByText("Cancelled — teacher absent")).toBeInTheDocument();
    expect(screen.getByText(/Mathematics · Bola Ogundare/)).toBeInTheDocument();
  });

  it("a replaced period shows the replacement, with the original struck through as 'was'", () => {
    render(<AgendaDayCard day={REPLACED_DAY} />);
    expect(screen.getByText("Prep/Study period")).toBeInTheDocument();
    expect(screen.getByText("Ahmed Suleiman")).toBeInTheDocument();
    expect(screen.getByText(/was Mathematics · Bola Ogundare/)).toBeInTheDocument();
  });

  it("a holiday shows the holiday name, no periods", () => {
    render(<AgendaDayCard day={HOLIDAY_DAY} />);
    expect(screen.getByText(/No school — Founders Day/)).toBeInTheDocument();
  });

  it("a weekend shows a generic label", () => {
    render(<AgendaDayCard day={WEEKEND_DAY} />);
    expect(screen.getByText(/No school — Weekend/)).toBeInTheDocument();
  });

  it("shows the class name only when showClass is set", () => {
    render(<AgendaDayCard day={SCHOOL_DAY} />);
    expect(screen.queryByText(/JSS 2 A/)).not.toBeInTheDocument();
    cleanup();
    render(<AgendaDayCard day={SCHOOL_DAY} showClass />);
    expect(screen.getByText(/JSS 2 A/)).toBeInTheDocument();
  });
});
