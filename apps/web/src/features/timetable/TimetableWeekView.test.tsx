import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Period, ResolvedTimetableDay } from "@scholametric/shared";
import { TimetableWeekView } from "./TimetableWeekView";

const PERIOD_1: Period = { id: "p1", schoolId: "s1", name: "Period 1", startsAt: "08:00", endsAt: "08:45", sortOrder: 1, createdAt: "t", updatedAt: "t" };

const SCHOOL_DAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [{ periodId: "p1", periodName: "Period 1", startsAt: "08:00", endsAt: "08:45", subjectId: "sub1", subjectName: "Mathematics", teacherUserId: "t1", teacherName: "Bola Ogundare", classArmId: "arm1", className: "JSS 2 A" }],
  breaks: [{ breakId: "b1", name: "Lunch", startsAt: "12:00", endsAt: "12:40" }],
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

describe("TimetableWeekView", () => {
  it("renders a school day's subject/teacher, and school-wide breaks", () => {
    render(<TimetableWeekView days={[SCHOOL_DAY]} periods={[PERIOD_1]} />);
    expect(screen.getByText("Mathematics")).toBeInTheDocument();
    expect(screen.getByText("Bola Ogundare")).toBeInTheDocument();
    expect(screen.getByText(/Lunch \(12:00-12:40\)/)).toBeInTheDocument();
  });

  it("does not show the class name unless showClass is set", () => {
    render(<TimetableWeekView days={[SCHOOL_DAY]} periods={[PERIOD_1]} />);
    expect(screen.queryByText(/JSS 2 A/)).not.toBeInTheDocument();
  });

  it("shows the class name when showClass is set (the teacher's cross-class view)", () => {
    render(<TimetableWeekView days={[SCHOOL_DAY]} periods={[PERIOD_1]} showClass />);
    expect(screen.getByText(/JSS 2 A/)).toBeInTheDocument();
  });

  it("a holiday day shows the holiday name, no periods", () => {
    render(<TimetableWeekView days={[HOLIDAY_DAY]} periods={[PERIOD_1]} />);
    expect(screen.getByText("Founders Day")).toBeInTheDocument();
  });

  it("a weekend day shows a generic Weekend label", () => {
    render(<TimetableWeekView days={[WEEKEND_DAY]} periods={[PERIOD_1]} />);
    expect(screen.getByText("Weekend")).toBeInTheDocument();
  });

  it("shows an empty state when there are no periods at all", () => {
    render(<TimetableWeekView days={[SCHOOL_DAY]} periods={[]} />);
    expect(screen.getByText("No periods have been set up yet.")).toBeInTheDocument();
  });
});
