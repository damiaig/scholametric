import { schoolToday } from "@scholametric/shared";
import { formatDate as formatDisplayDate } from "../../lib/format-date";

// v0.9 Item B Step B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — every
// "today" in this file is now school-local (Africa/Lagos) via
// schoolToday(), not the browser's own local/UTC clock. Once an instant
// has been turned into a "YYYY-MM-DD" string, all further arithmetic
// (weekday-of, add N days) is done by parsing that string as UTC midnight
// — the same safe, timezone-independent pattern used server-side
// (apps/api/test/utils/future-date.ts, calendar.service.ts's weekdayOf) —
// never local Date getters/setters again, so none of this can disagree
// with the process's own timezone or a DST transition.
function addDays(dateStr: string, days: number): string {
  const date = new Date(`${dateStr}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function weekdayOf(dateStr: string): number {
  return new Date(`${dateStr}T00:00:00Z`).getUTCDay();
}

// v0.8 walk-found fix — this week's Monday-Saturday range, as "YYYY-MM-DD"
// strings, computed client-side (the API never defaults the range itself —
// both from/to are always explicit query params, same as every other
// date-scoping param in this codebase). Sunday is deliberately never
// requested at all — the Weekday enum has no SUNDAY slot, and the
// Full-week grid never shows a Sunday column, so there's nothing to gain
// from fetching it. Saturday IS still requested even for classes/teachers
// without a Saturday timetable — TimetableWeekView's caller decides
// whether to render that day (see filterWeekDays), reusing the same
// isSchoolDay/nonSchoolReason signal the response already carries rather
// than a second lookup.
export function getCurrentWeekRange(today: Date = new Date()): { from: string; to: string } {
  const todayStr = schoolToday(today);
  const day = weekdayOf(todayStr); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = addDays(todayStr, mondayOffset);
  const saturday = addDays(monday, 5);
  return { from: monday, to: saturday };
}

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — "today" plus the next `days - 1`
// calendar days, as "YYYY-MM-DD" strings. Same reuse-not-rebuild shape as
// getCurrentWeekRange above: this reuses the exact same resolved-schedule
// endpoints (GET /me/timetable etc.), just with a different [from, to] —
// no new resolution logic. Every day in the window gets a full agenda
// card, including non-school days (holiday/weekend) — nothing here is
// collapsed or skipped.
export function getAgendaRange(today: Date = new Date(), days = 7): { from: string; to: string } {
  const todayStr = schoolToday(today);
  return { from: todayStr, to: addDays(todayStr, days - 1) };
}

// v0.8 walk-found fix — the seam getCurrentWeekRange()/getAgendaRange()
// already exposed (an optional `today` override) is exactly what week
// navigation needs: shift the anchor date by whole weeks, then feed it
// back into the same two functions unchanged. No new range-computation
// logic, no backend change — from/to are still always explicit, still
// always a valid ≤31-day span regardless of how far the offset goes.
// v0.9 Step B amendment — pure elapsed-time (epoch ms) arithmetic, not
// local-Date getDate()/setDate(): a week is always exactly 7*24h here,
// never reinterpreted through a DST transition in whatever timezone the
// browser/test process happens to be in. The result is still just an
// instant fed to schoolToday() by the two functions above, which is where
// the actual calendar date gets resolved.
export function addWeeks(date: Date, weeks: number): Date {
  return new Date(date.getTime() + weeks * 7 * 24 * 60 * 60 * 1000);
}

// Shared by all three role pages: at offset 0, show the tab's own default
// label ("This week" / "Today & upcoming"); once navigated, show the
// resolved from–to dates instead (already in the response — no extra
// computation) so it's clear exactly which window is on screen.
export function describeWeekOffset(weekOffset: number, defaultLabel: string, range: { from: string; to: string } | undefined): string {
  if (weekOffset === 0) {
    return defaultLabel;
  }
  if (!range) {
    return "…";
  }
  return `${formatDisplayDate(range.from)} – ${formatDisplayDate(range.to)}`;
}

// v0.8.1 step 1 — the Agenda tab's navigated state is the actual target
// date itself (a "YYYY-MM-DD" string), not an offset: a date-picker lets
// the user jump to any day, not just a multiple of a nav step, so
// weekOffset's integer-offset shape doesn't fit here. These three helpers
// are that string-based day-nav's whole surface, mirroring the existing
// injectable-`today`-parameter pattern (getCurrentWeekRange/getAgendaRange)
// so tests never need fake timers.
export function todayDateString(today: Date = new Date()): string {
  return schoolToday(today);
}

export function isToday(dateString: string, today: Date = new Date()): boolean {
  return dateString === todayDateString(today);
}

export function addDaysToDateString(dateString: string, days: number): string {
  return addDays(dateString, days);
}
