import { describe, it, expect } from "vitest";
import { formatDueDateRelative } from "./format-date";

// v0.8.3 UX Round 2 Step B (SPEC_V0.8.3_ux_round2.md §Step B, Item 6).
// `today` is injected throughout — see the function's own doc comment
// for why this is a pure-function test, not a component/fake-timer one.
describe("formatDueDateRelative", () => {
  it("is 'Today' when dueDate equals today", () => {
    expect(formatDueDateRelative("2026-09-14", new Date(2026, 8, 14))).toBe("Today");
  });

  it("is 'Tomorrow' when dueDate is one day ahead", () => {
    expect(formatDueDateRelative("2026-09-15", new Date(2026, 8, 14))).toBe("Tomorrow");
  });

  it("is 'Yesterday' when dueDate is one day behind", () => {
    expect(formatDueDateRelative("2026-09-13", new Date(2026, 8, 14))).toBe("Yesterday");
  });

  it("falls back to the weekday-day-month format outside ±1 day", () => {
    expect(formatDueDateRelative("2026-09-17", new Date(2026, 8, 14))).toBe("Thursday 17 September");
    expect(formatDueDateRelative("2026-09-10", new Date(2026, 8, 14))).toBe("Thursday 10 September");
  });

  it("rolls over a month boundary correctly for Tomorrow/Yesterday", () => {
    expect(formatDueDateRelative("2026-10-01", new Date(2026, 8, 30))).toBe("Tomorrow");
    expect(formatDueDateRelative("2026-09-30", new Date(2026, 9, 1))).toBe("Yesterday");
  });

  it("defaults `today` to the real current date when omitted", () => {
    // Local date components, NOT toISOString() — a UTC-based string can
    // land on the wrong calendar day in a negative-offset timezone,
    // exactly the hazard parseLocalDate (and this function) guard against.
    const now = new Date();
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
    expect(formatDueDateRelative(todayStr)).toBe("Today");
  });
});
