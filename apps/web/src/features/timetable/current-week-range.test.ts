import { describe, it, expect } from "vitest";
import { addWeeks, describeWeekOffset, getAgendaRange, getCurrentWeekRange } from "./current-week-range";

describe("getAgendaRange", () => {
  it("returns today through today+6 days by default", () => {
    expect(getAgendaRange(new Date(2026, 8, 14))).toEqual({ from: "2026-09-14", to: "2026-09-20" });
  });

  it("respects a custom day count", () => {
    expect(getAgendaRange(new Date(2026, 8, 14), 1)).toEqual({ from: "2026-09-14", to: "2026-09-14" });
  });

  it("rolls over a month boundary correctly", () => {
    expect(getAgendaRange(new Date(2026, 8, 28))).toEqual({ from: "2026-09-28", to: "2026-10-04" });
  });
});

describe("addWeeks", () => {
  it("shifts forward by whole weeks", () => {
    expect(addWeeks(new Date(2026, 8, 14), 1).getDate()).toBe(21);
    const rolled = addWeeks(new Date(2026, 8, 28), 1); // Sep 28 + 7 days
    expect(rolled.getMonth()).toBe(9); // rolls into October
    expect(rolled.getDate()).toBe(5);
  });

  it("shifts backward for a negative offset", () => {
    const shifted = addWeeks(new Date(2026, 8, 14), -1);
    expect(shifted.getMonth()).toBe(8);
    expect(shifted.getDate()).toBe(7);
  });

  it("is a no-op at offset 0", () => {
    expect(addWeeks(new Date(2026, 8, 14), 0).getTime()).toBe(new Date(2026, 8, 14).getTime());
  });

  it("composes with getCurrentWeekRange/getAgendaRange to shift the whole navigable window", () => {
    const nextWeekAnchor = addWeeks(new Date(2026, 8, 14), 1); // Monday
    expect(getCurrentWeekRange(nextWeekAnchor)).toEqual({ from: "2026-09-21", to: "2026-09-27" });
    expect(getAgendaRange(nextWeekAnchor)).toEqual({ from: "2026-09-21", to: "2026-09-27" });
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
