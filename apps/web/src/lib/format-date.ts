import { SCHOOL_TIME_ZONE, schoolToday } from "@scholametric/shared";

// v0.9 Step B review follow-up (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) —
// a value at EXACTLY UTC midnight is how a Prisma `@db.Date` column
// serializes (a plain "YYYY-MM-DD" string parses to the same instant),
// and represents a pure CALENDAR DATE with no real time-of-day — display
// it with timeZone "UTC" so it never shifts a day under any process
// timezone. Any other instant is a genuine timestamptz moment (markedAt,
// createdAt, a remark's writtenAt, …) and must resolve in SCHOOL_TIME_ZONE
// (Africa/Lagos), never the browser's own timezone — a real event's date
// is what day it was AT THE SCHOOL, not wherever the viewer's browser
// happens to be. (A genuine instant landing on exactly UTC midnight is
// astronomically unlikely, so this check never misclassifies one.)
function isMidnightUTC(date: Date): boolean {
  return date.getUTCHours() === 0 && date.getUTCMinutes() === 0 && date.getUTCSeconds() === 0 && date.getUTCMilliseconds() === 0;
}

export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  const timeZone = isMidnightUTC(date) ? "UTC" : SCHOOL_TIME_ZONE;
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone });
}

// v0.8.3 step 3 (SPEC_V0.8.3.md §2.5, Item 5) — date AND time, for
// full ISO timestamps (markedAt, uploadedAt) where the time of day
// matters, unlike formatDate's date-only fields (dueDate, etc.). Always
// a real instant (never a bare calendar date) — always resolved in
// SCHOOL_TIME_ZONE (Africa/Lagos), never the browser's own timezone, same
// reasoning as formatDate's instant branch above.
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZone: SCHOOL_TIME_ZONE,
  });
}

// A plain "YYYY-MM-DD" string parsed as UTC midnight, giving back the
// epoch-ms for that exact calendar date — NOT a local-Date conversion
// (`new Date(year, month, day)`), which depends on whatever timezone the
// browser/test process happens to be in. `dueDate` is a date-only string
// with no instant of its own, so this never goes through schoolToday()
// (which takes an instant and resolves it against Africa/Lagos) — both
// sides of the diff below are date strings, parsed the same way.
function utcMidnight(dateStr: string): number {
  const [year, month, day] = dateStr.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

// v0.8.3 UX Round 2 Step B (SPEC_V0.8.3_ux_round2.md §Step B, Item 6) —
// "Today"/"Tomorrow"/"Yesterday" within 1 day of `today`, else the same
// weekday-day-month format HomeworkDueDateList's own due-date headings
// already used ("Monday 12 October") — now also applied to
// HomeworkClassPage's teacher-facing due-date line, unifying what were
// two different non-relative formats ("Oct 12, 2026" vs "Monday 12
// October") into one. `today` is injectable with a real default,
// matching this codebase's own convention (isPeriodTimePast's `now`,
// getAgendaRange's `today`) — tested as a pure function, not via a
// component prop.
//
// v0.9 Item B Step B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — `today`
// is first resolved to school-local (Africa/Lagos) via schoolToday(),
// THEN the day-count diff is done entirely on the two resulting date
// strings via utcMidnight() above — never a local-Date conversion of
// either one.
export function formatDueDateRelative(dueDate: string, today: Date = new Date()): string {
  const todayStr = schoolToday(today);
  const diffDays = Math.round((utcMidnight(dueDate) - utcMidnight(todayStr)) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" }).format(utcMidnight(dueDate));
}
