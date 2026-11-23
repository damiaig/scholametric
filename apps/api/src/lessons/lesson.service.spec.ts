import { LessonService } from "./lesson.service";

// v0.9 Item B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — isDateInTheFuture
// is a pure function of (dateStr, now); it never touches the constructor's
// real dependencies, so a minimally-constructed instance is enough to call
// it directly (cast to access the private method, same reasoning the
// method's own doc comment gives for keeping it private/injectable).
function makeService(): LessonService {
  return new LessonService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

function isDateInTheFuture(dateStr: string, now: Date): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (makeService() as any).isDateInTheFuture(dateStr, now);
}

describe("LessonService#isDateInTheFuture — school-local (Africa/Lagos) today", () => {
  it("23:30Z (= 00:30 WAT the next day): today's own date is no longer 'the future'", () => {
    const now = new Date("2026-11-12T23:30:00Z");
    // School-local today is 2026-11-13 by now; that same date is NOT future.
    expect(isDateInTheFuture("2026-11-13", now)).toBe(false);
    // The day that just ended (UTC-today) genuinely IS in the past now.
    expect(isDateInTheFuture("2026-11-12", now)).toBe(false);
    // Tomorrow, school-local, is still the future.
    expect(isDateInTheFuture("2026-11-14", now)).toBe(true);
  });

  it("22:59Z / 23:00Z is the exact school-local midnight boundary (WAT = UTC+1)", () => {
    // 22:59Z = 23:59 WAT — still 2026-11-12 school-local, so 11-13 is future.
    expect(isDateInTheFuture("2026-11-13", new Date("2026-11-12T22:59:00Z"))).toBe(true);
    // 23:00Z = 00:00 WAT — already 2026-11-13 school-local, so 11-13 is NOT future anymore.
    expect(isDateInTheFuture("2026-11-13", new Date("2026-11-12T23:00:00Z"))).toBe(false);
  });

  it("is identical regardless of the PROCESS's own timezone (TZ=UTC, Europe/Paris, Pacific/Kiritimati)", () => {
    const now = new Date("2026-11-12T23:30:00Z");
    const original = process.env.TZ;
    try {
      const results = ["UTC", "Europe/Paris", "Pacific/Kiritimati"].map((tz) => {
        process.env.TZ = tz;
        return isDateInTheFuture("2026-11-13", now);
      });
      expect(results).toEqual([false, false, false]);
    } finally {
      process.env.TZ = original;
    }
  });
});
