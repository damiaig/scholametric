// v0.8 step 3 — this week's Monday-Sunday range, as "YYYY-MM-DD" strings,
// computed client-side (the API never defaults the range itself — both
// from/to are always explicit query params, same as every other
// date-scoping param in this codebase). Sunday is included even though
// it's always non-school-day: the resolved response still reports it, and
// a 7-day grid reads more naturally than a 6-day one with a gap.
export function getCurrentWeekRange(today: Date = new Date()): { from: string; to: string } {
  const day = today.getDay(); // 0 = Sunday
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const monday = new Date(today);
  monday.setDate(today.getDate() + mondayOffset);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { from: formatDate(monday), to: formatDate(sunday) };
}

function formatDate(date: Date): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — "today" plus the next `days - 1`
// calendar days, as "YYYY-MM-DD" strings. Same reuse-not-rebuild shape as
// getCurrentWeekRange above: this reuses the exact same resolved-schedule
// endpoints (GET /me/timetable etc.), just with a different [from, to] —
// no new resolution logic. Every day in the window gets a full agenda
// card, including non-school days (holiday/weekend) — nothing here is
// collapsed or skipped.
export function getAgendaRange(today: Date = new Date(), days = 7): { from: string; to: string } {
  const end = new Date(today);
  end.setDate(today.getDate() + (days - 1));
  return { from: formatDate(today), to: formatDate(end) };
}
