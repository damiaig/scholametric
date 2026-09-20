import { describe, it, expect } from "vitest";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { deriveWeekPeriods } from "./derive-week-periods";

const SCHOOL_DAY: ResolvedTimetableDay = {
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
    // A free period (no slot that day) — still a real row, subjectName null.
    {
      periodId: "p2",
      periodName: "Period 2",
      startsAt: "08:45",
      endsAt: "09:30",
      subjectId: null,
      subjectName: null,
      teacherUserId: null,
      teacherName: null,
      classArmId: null,
      className: null,
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

describe("deriveWeekPeriods", () => {
  it("derives the full period list — including free periods — from the first school day", () => {
    expect(deriveWeekPeriods([HOLIDAY_DAY, SCHOOL_DAY, WEEKEND_DAY])).toEqual([
      { id: "p1", name: "Period 1", startsAt: "08:00", endsAt: "08:45" },
      { id: "p2", name: "Period 2", startsAt: "08:45", endsAt: "09:30" },
    ]);
  });

  it("returns [] when every day in the range is a holiday/weekend — no school day to derive from", () => {
    expect(deriveWeekPeriods([HOLIDAY_DAY, WEEKEND_DAY])).toEqual([]);
  });

  it("returns [] for an empty days array", () => {
    expect(deriveWeekPeriods([])).toEqual([]);
  });
});
