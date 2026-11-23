import { schoolToday } from "@scholametric/shared";

// v0.8.1 step 3 — a date genuinely in the future relative to whenever the
// suite actually runs, computed from a real Date() at call time. The e2e
// fixtures this replaces (teacher-absences.e2e-spec.ts,
// timetable-coverage.e2e-spec.ts) used to hardcode a specific "2026-09-14"
// string; once real time passed that date, the new can't-replace-a-past-
// period guard rejected their own replace calls. weeksAhead gives margin
// so the suite doesn't run into this same edge again soon.
// v0.8.3 Item 4 rework — generalized from Monday-only to any weekday
// (0=Sunday..6=Saturday), needed for the due-date-is-a-teaching-day
// rule's own negative tests (a genuine future Sunday/Saturday/Wednesday,
// not a hardcoded literal). futureMonday is now a thin wrapper — zero
// behavior change for its existing callers.
// v0.9 Item B (docs/SPEC_V0.9.md §3) — anchored on schoolToday() (the
// SAME school-local "today" the backend's own date rules now use)
// instead of the system-local Date(); all arithmetic from there is done
// by parsing that date string as UTC midnight, the safe,
// timezone-independent "weekday/offset of a known date string" pattern
// calendar.service.ts's own weekdayOf uses — never the process's own
// local clock again, so this stays correct no matter what TZ the suite
// runs under.
function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

export function futureWeekday(targetDayOfWeek: number, weeksAhead = 4): string {
  const todayStr = schoolToday();
  const daysUntilTarget = (targetDayOfWeek - weekdayOf(todayStr) + 7) % 7;
  return addDays(todayStr, daysUntilTarget + weeksAhead * 7);
}

export function futureMonday(weeksAhead = 4): string {
  return futureWeekday(1, weeksAhead);
}

// v0.8.4 step 1 (SPEC_V0.8.4.md §3) — the lesson-date rule's own negative/
// positive tests need a genuine PAST date (lessons are logged on or
// before today, never the future — the inversion of homework's due-date
// rule), so this is futureWeekday's direct sibling: same signature shape,
// subtracting instead of adding. weeksAgo gives the same kind of margin
// futureWeekday's own weeksAhead does, so the computed date stays safely
// inside the seeded current session even as real time passes.
export function pastWeekday(targetDayOfWeek: number, weeksAgo = 4): string {
  const todayStr = schoolToday();
  const daysSinceTarget = (weekdayOf(todayStr) - targetDayOfWeek + 7) % 7;
  return addDays(todayStr, -(daysSinceTarget + weeksAgo * 7));
}
