export function formatDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

// v0.8.3 step 3 (SPEC_V0.8.3.md §2.5, Item 5) — date AND time, for
// full ISO timestamps (markedAt, uploadedAt) where the time of day
// matters, unlike formatDate's date-only fields (dueDate, etc.).
export function formatDateTime(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }
  return date.toLocaleString(undefined, { year: "numeric", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

// A plain YYYY-MM-DD string parsed as a LOCAL date at midnight — NOT
// `new Date(value)`, which parses as UTC midnight and can format/compare
// one day off in a negative-offset timezone. Mirrors the parsing
// HomeworkDueDateList's own (now-removed) formatDueDateHeading used.
function parseLocalDate(value: string): Date {
  const [year, month, day] = value.split("-").map(Number);
  return new Date(year, month - 1, day);
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
export function formatDueDateRelative(dueDate: string, today: Date = new Date()): string {
  const due = parseLocalDate(dueDate);
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((due.getTime() - todayMidnight.getTime()) / (24 * 60 * 60 * 1000));

  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Yesterday";
  return new Intl.DateTimeFormat("en-GB", { weekday: "long", day: "numeric", month: "long" }).format(due);
}
