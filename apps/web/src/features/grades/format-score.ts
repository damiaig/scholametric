// Shared display helper for the overview/review/student-results surfaces —
// whole numbers render bare, anything else keeps 2 decimal places
// (matches the raw-score entry grid's own precision).
export function formatScore(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(2);
}
