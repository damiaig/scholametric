// A date genuinely in the future relative to whenever the suite actually
// runs, computed from a real Date() at call time — never a hardcoded
// literal, which eventually collides with "today" as real time passes
// (exactly what broke MyHomeworkPage.test.tsx / HomeworkClassPage.test.tsx's
// own "2026-11-02" fixtures once the calendar caught up to it). Mirrors the
// backend's identical apps/api/test/utils/future-date.ts futureWeekday —
// same "prefer a genuinely-true relative date over faking the clock"
// convention this codebase already uses on both sides.
export function futureWeekday(targetDayOfWeek: number, weeksAhead = 4): string {
  const date = new Date();
  const daysUntilTarget = (targetDayOfWeek - date.getDay() + 7) % 7;
  date.setDate(date.getDate() + daysUntilTarget + weeksAhead * 7);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function futureMonday(weeksAhead = 4): string {
  return futureWeekday(1, weeksAhead);
}
