import { HomeworkService } from "./homework.service";

// v0.9 Item B (docs/SPEC_V0.9.md §3, docs/DECISIONS.md) — isDueDatePast is
// a pure function of (dueDate, now), same reasoning as
// lesson.service.spec.ts's isDateInTheFuture tests.
function makeService(): HomeworkService {
  return new HomeworkService(
    undefined as never,
    undefined as never,
    undefined as never,
    undefined as never,
  );
}

function isDueDatePast(dueDate: string, now: Date): boolean {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (makeService() as any).isDueDatePast(dueDate, now);
}

describe("HomeworkService#isDueDatePast — school-local (Africa/Lagos) today", () => {
  it("23:30Z (= 00:30 WAT the next day): a homework due TODAY (school-local) is still visible", () => {
    const now = new Date("2026-11-12T23:30:00Z");
    expect(isDueDatePast("2026-11-13", now)).toBe(false);
    // Due yesterday (school-local) IS past now.
    expect(isDueDatePast("2026-11-12", now)).toBe(true);
  });

  it("22:59Z / 23:00Z is the exact school-local midnight boundary (WAT = UTC+1)", () => {
    // 22:59Z = 23:59 WAT — still 2026-11-12 school-local, due date not past yet.
    expect(isDueDatePast("2026-11-12", new Date("2026-11-12T22:59:00Z"))).toBe(false);
    // 23:00Z = 00:00 WAT — already 2026-11-13 school-local, due date 11-12 IS past now.
    expect(isDueDatePast("2026-11-12", new Date("2026-11-12T23:00:00Z"))).toBe(true);
  });

  it("is identical regardless of the PROCESS's own timezone (TZ=UTC, Europe/Paris, Pacific/Kiritimati)", () => {
    const now = new Date("2026-11-12T23:30:00Z");
    const original = process.env.TZ;
    try {
      const results = ["UTC", "Europe/Paris", "Pacific/Kiritimati"].map((tz) => {
        process.env.TZ = tz;
        return isDueDatePast("2026-11-12", now);
      });
      expect(results).toEqual([true, true, true]);
    } finally {
      process.env.TZ = original;
    }
  });
});
