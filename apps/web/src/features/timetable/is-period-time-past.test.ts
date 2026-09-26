import { describe, it, expect } from "vitest";
import { isPeriodTimePast } from "@scholametric/shared";

// v0.8.1 step 3 (SPEC_V0.8.1.md §2.8) — the ONE rule shared by AbsencesPage
// (hides Replace/Edit replacement) and the API's own replace-endpoint
// guard, so it can't drift between the two. Built on Date.UTC deliberately
// (see the function's own doc comment) — these cases stay in UTC too.
describe("isPeriodTimePast", () => {
  it("is false when the period ends after 'now'", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 8, 0)); // 08:00 UTC
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(false);
  });

  it("is true when the period ended before 'now'", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 9, 0)); // 09:00 UTC
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(true);
  });

  it("is true for any period on an earlier calendar date, regardless of time-of-day", () => {
    const now = new Date(Date.UTC(2026, 8, 15, 0, 1)); // just past midnight the next day
    expect(isPeriodTimePast("2026-09-14", "23:59", now)).toBe(true);
  });

  it("is false for any period on a later calendar date, regardless of time-of-day", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 23, 59));
    expect(isPeriodTimePast("2026-09-15", "00:01", now)).toBe(false);
  });

  it("boundary: is false at the exact instant the period ends (only strictly-before counts as past)", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 8, 45));
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(false);
  });

  it("boundary: is true one millisecond after the period ends", () => {
    const now = new Date(Date.UTC(2026, 8, 14, 8, 45, 0, 1));
    expect(isPeriodTimePast("2026-09-14", "08:45", now)).toBe(true);
  });
});
