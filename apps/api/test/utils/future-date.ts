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
export function futureWeekday(targetDayOfWeek: number, weeksAhead = 4): string {
  const date = new Date();
  const daysUntilTarget = (targetDayOfWeek - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilTarget + weeksAhead * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function futureMonday(weeksAhead = 4): string {
  return futureWeekday(1, weeksAhead);
}
