import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import type { Period, ResolvedTimetableDay } from "@scholametric/shared";
import { TimetableWeekView } from "./TimetableWeekView";

const PERIOD_1: Period = { id: "p1", schoolId: "s1", name: "Period 1", startsAt: "08:00", endsAt: "08:45", sortOrder: 1, createdAt: "t", updatedAt: "t" };

const BASE_PERIOD_ENTRY = {
  status: null,
  exceptionId: null,
  note: null,
  replacementTeacherUserId: null,
  replacementTeacherName: null,
  replacementSubjectId: null,
  replacementSubjectName: null,
  activityLabel: null,
} as const;

const SCHOOL_DAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [
    { ...BASE_PERIOD_ENTRY, periodId: "p1", periodName: "Period 1", startsAt: "08:00", endsAt: "08:45", subjectId: "sub1", subjectName: "Mathematics", teacherUserId: "t1", teacherName: "Bola Ogundare", classArmId: "arm1", className: "JSS 2 A" },
  ],
  breaks: [{ breakId: "b1", name: "Lunch", startsAt: "12:00", endsAt: "12:40" }],
};

const CANCELLED_DAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [
    {
      ...BASE_PERIOD_ENTRY,
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
      status: "CANCELLED",
      exceptionId: "exc1",
      note: "Down with malaria",
    },
  ],
  breaks: [],
};

const REPLACED_DAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [
    {
      ...BASE_PERIOD_ENTRY,
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

  it("a cancelled period shows 'Cancelled — teacher absent', with the original subject/teacher struck through", () => {
    render(<TimetableWeekView days={[CANCELLED_DAY]} periods={[PERIOD_1]} />);
    expect(screen.getByText("Cancelled — teacher absent")).toBeInTheDocument();
    expect(screen.getByText(/Mathematics · Bola Ogundare/)).toBeInTheDocument();
  });

  it("a replaced period shows the replacement teacher + activity, with the original struck through as 'was'", () => {
    render(<TimetableWeekView days={[REPLACED_DAY]} periods={[PERIOD_1]} />);
    expect(screen.getByText("Prep/Study period")).toBeInTheDocument();
    expect(screen.getByText("Ahmed Suleiman")).toBeInTheDocument();
    expect(screen.getByText(/was Mathematics · Bola Ogundare/)).toBeInTheDocument();
  });
});
