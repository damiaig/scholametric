import type { ResolvedTimetableDay } from "@scholametric/shared";

// v0.8 walk-found fix — MyTimetablePage/TeacherTimetablePage used to fetch
// the master period list via GET /calendar/periods (SCHOOL_ADMIN/PROPRIETOR
// only, and deliberately staying that way) purely to drive the week grid's
// rows — a 403 for every other role. Step 3's resolveClassSchedule/
// resolveTeacherSchedule already pair EVERY Period with its slot-or-null
// for each SCHOOL day (see calendar.service.ts — periods.map(...) runs
// unconditionally on a school day; only a holiday/weekend short-circuits
// to periods: []), so the first school day in an already-fetched
// timetable response is a complete, correctly-ordered period list on its
// own. No admin call needed, and none added here.
export interface WeekViewPeriod {
  id: string;
  name: string;
  startsAt: string;
  endsAt: string;
}

// Returns [] only if EVERY day in the requested range is a holiday/
// weekend (e.g. an entire week/agenda window falling inside a school
// break) — TimetableWeekView's own empty state ("No periods have been
// set up yet") already renders gracefully for an empty array, so this
// degenerate case fails soft, not hard.
export function deriveWeekPeriods(days: ResolvedTimetableDay[]): WeekViewPeriod[] {
  const schoolDay = days.find((day) => day.isSchoolDay);
  if (!schoolDay) {
    return [];
  }
  return schoolDay.periods.map((entry) => ({
    id: entry.periodId,
    name: entry.periodName,
    startsAt: entry.startsAt,
    endsAt: entry.endsAt,
  }));
}
