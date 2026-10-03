import { PrismaService } from "../../src/prisma/prisma.service";

const WEEKDAY_BY_JS_INDEX = ["SUNDAY", "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;

const DO_NOT_FAKE = [
  "hrtime",
  "nextTick",
  "performance",
  "queueMicrotask",
  "requestAnimationFrame",
  "cancelAnimationFrame",
  "requestIdleCallback",
  "cancelIdleCallback",
  "setImmediate",
  "clearImmediate",
  "setInterval",
  "clearInterval",
  "setTimeout",
  "clearTimeout",
] as const;

// v0.8.3 step 1 (SPEC_V0.8.3.md §2.4) — createHomework's new create-day
// rule reads the server's real wall clock, so every homework e2e file's
// createHomework() calls need "today" pinned to a known day instead of
// depending on which real weekday the suite happens to run on (notably:
// never a flaky-on-Sundays suite).
//
// MUST be called before any loginAs() in the file's beforeAll — not after.
// Date is faked (every other timer/socket fn stays real), which also
// changes what Date.now() returns while jsonwebtoken computes a token's
// iat/exp during login. Pinning first means every token this file ever
// mints is issued AND later verified against the exact same frozen
// instant (fake timers never auto-advance), so nothing expires out from
// under a request. Pinning AFTER login instead would mint tokens under
// the real clock, then jump the frozen "now" away from it — making
// already-issued tokens look expired on the very next request.
export function pinClockToDate(date: string): () => void {
  jest.useFakeTimers({ doNotFake: [...DO_NOT_FAKE] });
  jest.setSystemTime(new Date(`${date}T10:00:00Z`));
  return () => jest.useRealTimers();
}

// The create-day rule's one positive fixture: a TimetableSlot proving the
// given teacher teaches the given class on `date`'s weekday. Call any time
// after pinClockToDate (fixture rows are plain Prisma writes, unaffected
// by which clock — real or faked — is active when they're created).
export async function seedCreateDaySlot(
  prisma: PrismaService,
  params: { schoolId: string; classArmId: string; sessionId: string; subjectId: string; teacherUserId: string; date: string },
): Promise<() => Promise<void>> {
  const weekday = WEEKDAY_BY_JS_INDEX[new Date(`${params.date}T00:00:00Z`).getUTCDay()];
  if (weekday === "SUNDAY") {
    throw new Error("seedCreateDaySlot: date must not be a Sunday — no TimetableSlot can ever exist for one.");
  }

  const period = await prisma.period.create({
    data: { schoolId: params.schoolId, name: "E2E-HW-CreateDayPeriod", startsAt: "08:00", endsAt: "08:45", sortOrder: 1 },
  });
  const slot = await prisma.timetableSlot.create({
    data: {
      schoolId: params.schoolId,
      classArmId: params.classArmId,
      sessionId: params.sessionId,
      dayOfWeek: weekday,
      periodId: period.id,
      subjectId: params.subjectId,
      teacherUserId: params.teacherUserId,
    },
  });

  return async () => {
    await prisma.timetableSlot.deleteMany({ where: { id: slot.id } });
    await prisma.period.deleteMany({ where: { id: period.id } });
  };
}
