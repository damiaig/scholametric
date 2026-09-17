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
