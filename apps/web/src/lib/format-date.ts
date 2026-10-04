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
