import { isPeriodTimePast, schoolNowParts, schoolToday } from "@scholametric/shared";

// v0.9 Item B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — run in the API's
// own Jest/Node runtime, deliberately duplicated (not shared test code)
// in apps/web/src/lib/school-time.test.ts under Vitest/jsdom: proves
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

  it("isPeriodTimePast compares school-local wall-clock, not a UTC-misinterpreted instant", () => {
    // A period ending at 14:00 WAT (= 13:00 UTC) — the v0.8.1 bug kept this
    // "not past" until 15:00 WAT (one hour late, every day).
    const periodDate = "2026-11-12";
    const endsAt = "14:00";
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T12:59:00Z"))).toBe(false); // 13:59 WAT
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T13:00:00Z"))).toBe(false); // 14:00 WAT exactly
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T13:01:00Z"))).toBe(true); // 14:01 WAT
    // The exact hour the old bug got wrong: 14:30 WAT (13:30 UTC) must
    // already read as past, not still "pending" for another 30 minutes.
    expect(isPeriodTimePast(periodDate, endsAt, new Date("2026-11-12T13:30:00Z"))).toBe(true);
  });

  it("is identical regardless of the PROCESS's own timezone (TZ=UTC, Europe/Paris, Pacific/Kiritimati)", () => {
    const now = new Date("2026-11-12T23:30:00Z");
    const original = process.env.TZ;
    try {
      const results = ["UTC", "Europe/Paris", "Pacific/Kiritimati"].map((tz) => {
        process.env.TZ = tz;
        return [schoolToday(now), isPeriodTimePast("2026-11-12", "14:00", now)] as const;
      });
      expect(results).toEqual([
        ["2026-11-13", true],
        ["2026-11-13", true],
        ["2026-11-13", true],
      ]);
    } finally {
      process.env.TZ = original;
    }
  });
});
