import { schoolToday } from "@scholametric/shared";

// A date genuinely in the future relative to whenever the suite actually
// runs, computed from a real Date() at call time — never a hardcoded
// literal, which eventually collides with "today" as real time passes
// (exactly what broke MyHomeworkPage.test.tsx / HomeworkClassPage.test.tsx's
// own "2026-11-02" fixtures once the calendar caught up to it). Mirrors the
// backend's identical apps/api/test/utils/future-date.ts futureWeekday —
// same "prefer a genuinely-true relative date over faking the clock"
// convention this codebase already uses on both sides.
//
// v0.9 Item B Step B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — anchored
// on schoolToday() (the SAME school-local "today" the app itself uses)
// instead of the browser/test process's own local Date(); all arithmetic
// from there parses that date string as UTC midnight — the safe,
// timezone-independent "weekday/offset of a known date string" pattern —
// never local Date getters/setters again.
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
