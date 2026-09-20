import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

interface ResolvedPeriod {
  periodId: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherUserId: string | null;
  teacherName: string | null;
  classArmId: string | null;
  className: string | null;
  status: string | null;
  exceptionId: string | null;
  note: string | null;
  replacementTeacherUserId: string | null;
  replacementTeacherName: string | null;
  replacementSubjectId: string | null;
  replacementSubjectName: string | null;
  activityLabel: string | null;
}

interface ResolvedDay {
  date: string;
  isSchoolDay: boolean;
  periods: ResolvedPeriod[];
}

// v0.8 step 5 (SPEC_V0.8.md §7 item 5) — the one backend touch: a teacher
// assigned as a REPLACEMENT sees the covered period in their OWN
// /me/teaching-timetable, without widening what they can see beyond
// "their own slots" ∪ "exceptions where they are the assigned cover"
// (both scoped by @CurrentUser().userId, never a request param). MONDAY
// 2026-09-14 is the same verified week every other v0.8 e2e file uses.
describe("Covering-teacher visibility (e2e) — SPEC_V0.8.md §7 item 5, v0.8 step 5", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let mathTeacherToken: string;
  let coverTeacherToken: string;
  let uninvolvedTeacherToken: string;
  let hillcrestTeacherToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let jss2AArmId: string;
  let mathTeacherId: string;
  let coverTeacherId: string;
  let mathSubjectId: string;
  let physicsSubjectId: string;

  let periodAId: string;
  let periodBId: string;
  let exceptionId: string;
  let createdSubjectAssignmentId: string;

  const createdSlotIds: string[] = [];
  const createdPeriodIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const MONDAY = "2026-09-14";
  const TUESDAY = "2026-09-15";

  function dayFor(body: { days: ResolvedDay[] }, date: string): ResolvedDay {
    const day = body.days.find((d) => d.date === date);
    if (!day) throw new Error(`no resolved day for ${date}`);
    return day;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    coverTeacherToken = await loginAs(app, "teacher3@sunrise.test", "sunrise");
    uninvolvedTeacherToken = await loginAs(app, "teacher4@sunrise.test", "sunrise");
    hillcrestTeacherToken = await loginAs(app, "teacher@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;

    mathTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;
    coverTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher3@sunrise.test" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;
    physicsSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Physics" } })).id;

    // coverTeacher needs a real subject-teacher assignment before they can
    // be given their own TUESDAY slot below (assertTeacherTeachesSubject).
    const assignment = await request(app.getHttpServer())
      .post("/api/v1/subject-assignments")
      .set(auth(sunriseAdminToken))
      .send({ subjectId: physicsSubjectId, classArmId: jss2AArmId, teacherUserId: coverTeacherId });
    if (assignment.status !== 201) {
      throw new Error(`subject assignment failed: ${assignment.status} ${JSON.stringify(assignment.body)}`);
    }
    createdSubjectAssignmentId = assignment.body.id;

    const periodA = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TC-PeriodA", startsAt: "07:00", endsAt: "07:45", sortOrder: 1 });
    if (periodA.status !== 201) {
      throw new Error(`periodA creation failed: ${periodA.status} ${JSON.stringify(periodA.body)}`);
    }
    periodAId = periodA.body.id;
    createdPeriodIds.push(periodAId);
    const periodB = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TC-PeriodB", startsAt: "07:45", endsAt: "08:30", sortOrder: 2 });
    if (periodB.status !== 201) {
      throw new Error(`periodB creation failed: ${periodB.status} ${JSON.stringify(periodB.body)}`);
    }
    periodBId = periodB.body.id;
    createdPeriodIds.push(periodBId);

    // mathTeacher's own MONDAY slot — the one about to be cancelled+covered.
    const slotA = await request(app.getHttpServer())
      .post("/api/v1/calendar/timetable-slots")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "MONDAY", periodId: periodAId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });
    if (slotA.status !== 201) {
      throw new Error(`slotA creation failed: ${slotA.status} ${JSON.stringify(slotA.body)}`);
    }
    createdSlotIds.push(slotA.body.id);

    // coverTeacher's own, UNRELATED TUESDAY slot — proves the merge is
    // additive (their normal teaching + their coverage assignment coexist)
    // rather than the coverage assignment replacing their own schedule.
    const slotB = await request(app.getHttpServer())
      .post("/api/v1/calendar/timetable-slots")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "TUESDAY", periodId: periodBId, subjectId: physicsSubjectId, teacherUserId: coverTeacherId });
    if (slotB.status !== 201) {
      throw new Error(`slotB creation failed: ${slotB.status} ${JSON.stringify(slotB.body)}`);
    }
    createdSlotIds.push(slotB.body.id);

    // mathTeacher marks themselves absent for MONDAY/periodA.
    const absence = await request(app.getHttpServer())
      .post("/api/v1/calendar/teacher-absences")
      .set(auth(mathTeacherToken))
      .send({ date: MONDAY, periodIds: [periodAId], note: "Down with malaria" });
    if (absence.status !== 201) {
      throw new Error(`absence creation failed: ${absence.status} ${JSON.stringify(absence.body)}`);
    }
    exceptionId = absence.body.periods[0].exceptionId;

    // admin assigns coverTeacher as the replacement, with an activity label.
    const replace = await request(app.getHttpServer())
      .patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`)
      .set(auth(sunriseAdminToken))
      .send({ replacementTeacherUserId: coverTeacherId, activityLabel: "Prep/Study period" });
    if (replace.status !== 200) {
      throw new Error(`replacement failed: ${replace.status} ${JSON.stringify(replace.body)}`);
    }
  });

  afterAll(async () => {
    // Every filter below is guarded against an undefined/empty value —
    // beforeAll can throw partway through (e.g. a conflict from a prior
    // run's leftover state) leaving some of these unset; an unguarded
    // `{ id: undefined }` or `{ id: { in: [] } }` is NOT "match nothing"
    // to Prisma, it's "no filter on this field," which turns deleteMany
    // into "delete every row in the table" — confirmed the hard way while
    // writing this file (wiped subject_teacher_assignments school-wide in
    // scholametric_test; recovered by the next run's reseed, no prod
    // impact, but never again without this guard).
    if (jss2AArmId) {
      await prisma.timetableException.deleteMany({ where: { classArmId: jss2AArmId } });
    }
    if (mathTeacherId) {
      await prisma.teacherAbsence.deleteMany({ where: { teacherUserId: mathTeacherId } });
    }
    if (createdSlotIds.length > 0) {
      await prisma.timetableSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
    }
    if (createdPeriodIds.length > 0) {
      await prisma.period.deleteMany({ where: { id: { in: createdPeriodIds } } });
    }
    if (createdSubjectAssignmentId) {
      await prisma.subjectTeacherAssignment.deleteMany({ where: { id: createdSubjectAssignmentId } });
    }
    await app.close();
  });

  it("the assigned cover sees the covered period: REPLACED, original subject/teacher preserved, note never shown, replacement fields are their own", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/me/teaching-timetable")
      .query({ from: MONDAY, to: MONDAY })
      .set(auth(coverTeacherToken));
    expect(response.status).toBe(200);

    const monday = dayFor(response.body, MONDAY);
    const periodA = monday.periods.find((p) => p.periodId === periodAId)!;
    expect(periodA.status).toBe("REPLACED");
    expect(periodA.classArmId).toBe(jss2AArmId);
    expect(periodA.subjectName).toBe("Mathematics"); // original preserved
    expect(periodA.teacherName).toBe("Bola Ogundare"); // original absent teacher preserved
    expect(periodA.note).toBeNull(); // never the covering teacher's business
    expect(periodA.replacementTeacherUserId).toBe(coverTeacherId);
    expect(periodA.replacementTeacherName).toBe("Ahmed Suleiman");
    expect(periodA.activityLabel).toBe("Prep/Study period");
  });

  it("the coverage assignment is additive — the cover's own unrelated TUESDAY slot is unaffected", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/me/teaching-timetable")
      .query({ from: TUESDAY, to: TUESDAY })
      .set(auth(coverTeacherToken));
    expect(response.status).toBe(200);

    const tuesday = dayFor(response.body, TUESDAY);
    const periodB = tuesday.periods.find((p) => p.periodId === periodBId)!;
    expect(periodB.status).toBeNull();
    expect(periodB.subjectName).toBe("Physics");
    expect(periodB.classArmId).toBe(jss2AArmId);
  });

  it("an uninvolved teacher sees nothing extra — no phantom class at the same date/period", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/me/teaching-timetable")
      .query({ from: MONDAY, to: MONDAY })
      .set(auth(uninvolvedTeacherToken));
    expect(response.status).toBe(200);

    const monday = dayFor(response.body, MONDAY);
    const periodA = monday.periods.find((p) => p.periodId === periodAId)!;
    expect(periodA.status).toBeNull();
    expect(periodA.subjectId).toBeNull();
    expect(periodA.classArmId).toBeNull();
  });

  it("the own-slots + tenant wall holds through the new coverage query path — a Hillcrest teacher's view excludes both the Sunrise slot AND the Sunrise coverage exception", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/me/teaching-timetable")
      .query({ from: MONDAY, to: MONDAY })
      .set(auth(hillcrestTeacherToken));
    expect(response.status).toBe(200);

    const allSubjectIds = response.body.days.flatMap((d: { periods: { subjectId: string | null }[] }) => d.periods.map((p) => p.subjectId));
    const allClassArmIds = response.body.days.flatMap((d: { periods: { classArmId: string | null }[] }) => d.periods.map((p) => p.classArmId));
    expect(allSubjectIds).not.toContain(mathSubjectId);
    expect(allClassArmIds).not.toContain(jss2AArmId);
  });
});
