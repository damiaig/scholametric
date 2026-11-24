import { describe, it, expect } from "vitest";
import { isPeriodTimePast, schoolNowParts, schoolToday } from "@scholametric/shared";

// v0.9 Item B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — run under
// Vitest/jsdom, deliberately duplicated (not shared test code) in
// apps/api/src/calendar/school-time.spec.ts under Jest/Node: proves
// Intl's IANA timezone data for Africa/Lagos is actually present and
// behaves identically in BOTH runtimes this code ships in, not just
// wherever it happened to be written.
describe("schoolToday / schoolNowParts / isPeriodTimePast — school-local (Africa/Lagos)", () => {
  it("schoolToday(2026-11-12T23:30:00Z) === '2026-11-13' (proves ICU tzdata is present)", () => {
    expect(schoolToday(new Date("2026-11-12T23:30:00Z"))).toBe("2026-11-13");
  });

  it("22:59Z / 23:00Z boundary: still 2026-11-12 school-local either side", () => {
    expect(schoolToday(new Date("2026-11-12T22:59:00Z"))).toBe("2026-11-12");
    expect(schoolToday(new Date("2026-11-12T23:00:00Z"))).toBe("2026-11-13");
  });

  it("schoolNowParts splits the same instant into date + HH:mm correctly", () => {
    expect(schoolNowParts(new Date("2026-11-12T23:30:00Z"))).toEqual({
      date: "2026-11-13",
      hours: 0,
      minutes: 30,
    });
  });

  it("hours is 0 at school-local midnight, never 24", () => {
    expect(schoolNowParts(new Date("2026-11-12T23:30:00Z")).hours).toBe(0);
  });

  it("isPeriodTimePast compares school-local wall-clock, not a UTC-misinterpreted instant", () => {
    const periodDate = "2026-11-12";
    const endsAt = "14:00";
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T12:59:00Z"))).toBe(false); // 13:59 WAT
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T13:00:00Z"))).toBe(false); // 14:00 WAT exactly
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T13:01:00Z"))).toBe(true); // 14:01 WAT
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T13:30:00Z"))).toBe(true);
  });
});
