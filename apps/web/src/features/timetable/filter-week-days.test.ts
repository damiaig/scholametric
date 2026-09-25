import { describe, it, expect } from "vitest";
import type { ResolvedTimetableDay } from "@scholametric/shared";
import { filterWeekDays } from "./filter-week-days";

const MONDAY: ResolvedTimetableDay = {
  date: "2026-09-14",
  dayOfWeek: "MONDAY",
  isSchoolDay: true,
  nonSchoolReason: null,
  holidayName: null,
  periods: [],
  breaks: [],
};

function saturday(overrides: Partial<ResolvedTimetableDay>): ResolvedTimetableDay {
  return { date: "2026-09-19", dayOfWeek: "SATURDAY", isSchoolDay: true, nonSchoolReason: null, holidayName: null, periods: [], breaks: [], ...overrides };
}

const TAUGHT_PERIOD = {
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
} as const;

const FREE_PERIOD = { ...TAUGHT_PERIOD, subjectId: null, subjectName: null, teacherUserId: null, teacherName: null };

describe("filterWeekDays", () => {
  it("never drops a weekday, in either mode", () => {
    expect(filterWeekDays([MONDAY], "class")).toEqual([MONDAY]);
    expect(filterWeekDays([MONDAY], "teacher")).toEqual([MONDAY]);
  });

  describe("class mode (student/parent view)", () => {
    it("drops a WEEKEND-excluded Saturday (class doesn't have Saturday enabled)", () => {
      const sat = saturday({ isSchoolDay: false, nonSchoolReason: "WEEKEND" });
      expect(filterWeekDays([MONDAY, sat], "class")).toEqual([MONDAY]);
    });

    it("keeps a HOLIDAY Saturday (this class DOES have Saturday enabled — the holiday is a known, accepted cosmetic edge if Saturday were also disabled)", () => {
      const sat = saturday({ isSchoolDay: false, nonSchoolReason: "HOLIDAY", holidayName: "Founders Day" });
      expect(filterWeekDays([MONDAY, sat], "class")).toEqual([MONDAY, sat]);
    });

    it("keeps a normal school-day Saturday", () => {
      const sat = saturday({ periods: [TAUGHT_PERIOD] });
      expect(filterWeekDays([MONDAY, sat], "class")).toEqual([MONDAY, sat]);
    });
  });

  describe("teacher mode (cross-class view)", () => {
    it("drops an all-free Saturday (isSchoolDay is always true for a teacher, but nothing is actually taught)", () => {
      const sat = saturday({ periods: [FREE_PERIOD] });
      expect(filterWeekDays([MONDAY, sat], "teacher")).toEqual([MONDAY]);
    });

    it("drops a Saturday with zero periods at all", () => {
      const sat = saturday({ periods: [] });
      expect(filterWeekDays([MONDAY, sat], "teacher")).toEqual([MONDAY]);
    });

    it("keeps a Saturday where the teacher actually teaches something", () => {
      const sat = saturday({ periods: [FREE_PERIOD, TAUGHT_PERIOD] });
      expect(filterWeekDays([MONDAY, sat], "teacher")).toEqual([MONDAY, sat]);
    });
  });
});
