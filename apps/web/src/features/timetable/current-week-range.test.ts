import { describe, it, expect } from "vitest";
import { addDaysToDateString, addWeeks, describeWeekOffset, getAgendaRange, getCurrentWeekRange, isToday, todayDateString } from "./current-week-range";

// v0.9 Item B Step B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — every
// `today` injected below is midday UTC (13:00 WAT), nowhere near the
// school-local midnight boundary, so it unambiguously represents the same
// calendar date in every timezone this suite might run under (including
// the non-UTC CI step, TZ=Pacific/Kiritimati and TZ=Pacific/Pago_Pago).
// Boundary-specific cases belong in school-time.spec.ts/school-time.test.ts,
// not here — this file is about week/day arithmetic, not the boundary
// itself.
const SEP_14_NOON_UTC = new Date(Date.UTC(2026, 8, 14, 12));
const SEP_17_NOON_UTC = new Date(Date.UTC(2026, 8, 17, 12));
const SEP_20_NOON_UTC = new Date(Date.UTC(2026, 8, 20, 12));
const SEP_28_NOON_UTC = new Date(Date.UTC(2026, 8, 28, 12));

describe("getAgendaRange", () => {
  it("returns today through today+6 days by default", () => {
    expect(getAgendaRange(SEP_14_NOON_UTC)).toEqual({ from: "2026-09-14", to: "2026-09-20" });
  });

  it("respects a custom day count", () => {
    expect(getAgendaRange(SEP_14_NOON_UTC, 1)).toEqual({ from: "2026-09-14", to: "2026-09-14" });
  });

  it("rolls over a month boundary correctly", () => {
    expect(getAgendaRange(SEP_28_NOON_UTC)).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });
});

describe("getCurrentWeekRange", () => {
  it("snaps to that week's Monday and caps at Saturday — no Sunday, regardless of which weekday 'today' is", () => {
    expect(getCurrentWeekRange(SEP_14_NOON_UTC)).toEqual({ from: "2026-09-14", to: "2026-09-19" }); // Monday itself
    expect(getCurrentWeekRange(SEP_17_NOON_UTC)).toEqual({ from: "2026-09-14", to: "2026-09-19" }); // Thursday
    expect(getCurrentWeekRange(SEP_20_NOON_UTC)).toEqual({ from: "2026-09-14", to: "2026-09-19" }); // Sunday — snaps BACK to that week's Monday, not forward
  });
});

// addWeeks returns an instant (epoch ms arithmetic, not local-Date
// getDate()/setDate() — see current-week-range.ts's own comment), so
// these assertions read it back via its UTC representation, never local
// getDate()/getMonth(): those are exactly as timezone-dependent as the
// local-Date arithmetic this function was rewritten to avoid, and would
// give a different (wrong) calendar day under TZ=Pacific/Kiritimati.
describe("addWeeks", () => {
  it("shifts forward by whole weeks", () => {
    expect(addWeeks(SEP_14_NOON_UTC, 1).toISOString()).toBe(new Date(Date.UTC(2026, 8, 21, 12)).toISOString());
    const rolled = addWeeks(SEP_28_NOON_UTC, 1); // Sep 28 + 7 days
    expect(rolled.toISOString()).toBe(new Date(Date.UTC(2026, 9, 5, 12)).toISOString()); // rolls into October
  });

  it("shifts backward for a negative offset", () => {
    const shifted = addWeeks(SEP_14_NOON_UTC, -1);
    expect(shifted.toISOString()).toBe(new Date(Date.UTC(2026, 8, 7, 12)).toISOString());
  });

  it("is a no-op at offset 0", () => {
    expect(addWeeks(SEP_14_NOON_UTC, 0).getTime()).toBe(SEP_14_NOON_UTC.getTime());
  });

  it("composes with getCurrentWeekRange/getAgendaRange to shift the whole navigable window", () => {
    const nextWeekAnchor = addWeeks(SEP_14_NOON_UTC, 1); // Monday
    expect(getCurrentWeekRange(nextWeekAnchor)).toEqual({ from: "2026-09-21", to: "2026-09-26" });
    expect(getAgendaRange(nextWeekAnchor)).toEqual({ from: "2026-09-21", to: "2026-09-27" });
  });
});

describe("todayDateString", () => {
  it("formats the given date as YYYY-MM-DD", () => {
    expect(todayDateString(SEP_14_NOON_UTC)).toBe("2026-09-14");
  });
});

describe("isToday", () => {
  it("is true when the date string matches the injected today", () => {
    expect(isToday("2026-09-14", SEP_14_NOON_UTC)).toBe(true);
  });

  it("is false for any other date", () => {
    expect(isToday("2026-09-15", SEP_14_NOON_UTC)).toBe(false);
  });
});

describe("addDaysToDateString", () => {
  it("shifts forward by whole days", () => {
    expect(addDaysToDateString("2026-09-14", 1)).toBe("2026-09-15");
  });

  it("shifts backward for a negative count", () => {
    expect(addDaysToDateString("2026-09-14", -1)).toBe("2026-09-13");
  });

  it("rolls over a month boundary correctly in both directions", () => {
    expect(addDaysToDateString("2026-09-30", 1)).toBe("2026-10-01");
    expect(addDaysToDateString("2026-10-01", -1)).toBe("2026-09-30");
  });

  it("is a no-op for a shift of 0", () => {
    expect(addDaysToDateString("2026-09-14", 0)).toBe("2026-09-14");
  });
});

describe("describeWeekOffset", () => {
  it("returns the default label at offset 0, regardless of the range", () => {
    expect(describeWeekOffset(0, "This week", { from: "2026-09-14", to: "2026-09-20" })).toBe("This week");
    expect(describeWeekOffset(0, "Today & upcoming", undefined)).toBe("Today & upcoming");
  });

  it("returns the resolved from–to dates once navigated", () => {
    expect(describeWeekOffset(1, "This week", { from: "2026-09-21", to: "2026-09-27" })).toBe("Sep 21, 2026 – Sep 27, 2026");
    expect(describeWeekOffset(-2, "This week", { from: "2026-08-31", to: "2026-09-06" })).toBe("Aug 31, 2026 – Sep 6, 2026");
  });

  it("falls back to a placeholder if navigated but the range hasn't loaded yet", () => {
    expect(describeWeekOffset(1, "This week", undefined)).toBe("…");
  });
});
