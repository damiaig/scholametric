import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.8 step 2 (SPEC_V0.8.md §7 item 2) — the repeating weekly timetable
// template. Still the calendar domain — no shared files with grades/exams.
// Reuses the seed's EXISTING subject_teacher_assignments (Mathematics/
// teacher@sunrise.test and English Language/teacher2@sunrise.test are both
// already assigned across JSS 1 A and JSS 2 A) rather than creating scratch
// assignments — teacher@sunrise.test teaching Mathematics in BOTH arms is
// exactly what the cross-class double-booking proof needs, for free.
describe("Timetable slots (e2e) — SPEC_V0.8.md §7 item 2, v0.8 step 2", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseMathTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let hillcrestId: string;
  let sunriseSessionId: string;
  let hillcrestSessionId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestTeacherId: string;
  let mathTeacherId: string;
  let englishTeacherId: string;
  let mathSubjectId: string;
  let englishSubjectId: string;
  let noAssignmentSubjectId: string;

  let periodAId: string;
  let periodBId: string;

  const createdSlotIds: string[] = [];
  const createdPeriodIds: string[] = [];
  const createdSubjectIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createSlot(overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post("/api/v1/calendar/timetable-slots")
      .set(auth(sunriseAdminToken))
      .send({
        classArmId: jss2AArmId,
        sessionId: sunriseSessionId,
        dayOfWeek: "MONDAY",
        periodId: periodAId,
        subjectId: mathSubjectId,
        teacherUserId: mathTeacherId,
        ...overrides,
      });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseMathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;

    mathTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;
    englishTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher2@sunrise.test" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;
    englishSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "English Language" } })).id;

    const noAssignmentSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: "E2E TTS No Assignment", code: "E2ETTSNA" },
    });
    noAssignmentSubjectId = noAssignmentSubject.id;
    createdSubjectIds.push(noAssignmentSubjectId);

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    hillcrestSessionId = hillcrestSession.id;
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "Mathematics" } })).id;
    hillcrestTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: hillcrestId, email: "teacher@hillcrest.test" } })).id;

    const periodA = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TTS-PeriodA", startsAt: "08:00", endsAt: "08:45", sortOrder: 1 });
    periodAId = periodA.body.id;
    createdPeriodIds.push(periodAId);

    const periodB = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TTS-PeriodB", startsAt: "08:45", endsAt: "09:30", sortOrder: 2 });
    periodBId = periodB.body.id;
    createdPeriodIds.push(periodBId);
  });

  afterAll(async () => {
    await prisma.timetableSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
    await prisma.timetableSlot.deleteMany({ where: { periodId: { in: createdPeriodIds } } });
    await prisma.period.deleteMany({ where: { id: { in: createdPeriodIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    // Any Saturday-toggle test below reverts it itself, but belt-and-braces.
    await prisma.classSchoolDays.deleteMany({ where: { classArmId: { in: [jss1AArmId, jss2AArmId] } } });
    await app.close();
  });

  describe("POST /calendar/timetable-slots", () => {
    it("admin creates a valid slot, denormalized for direct grid rendering", async () => {
      const response = await createSlot();
      expect(response.status).toBe(201);
      createdSlotIds.push(response.body.id);
      expect(response.body).toMatchObject({
        classArmId: jss2AArmId,
        sessionId: sunriseSessionId,
        dayOfWeek: "MONDAY",
        periodId: periodAId,
        periodName: "E2E-TTS-PeriodA",
        subjectId: mathSubjectId,
        subjectName: "Mathematics",
        teacherUserId: mathTeacherId,
        teacherName: "Bola Ogundare",
      });
    });

    it("PROPRIETOR can also create (Q3 — both manage roles)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/timetable-slots")
        .set(auth(sunriseProprietorToken))
        .send({
          classArmId: jss2AArmId,
          sessionId: sunriseSessionId,
          dayOfWeek: "TUESDAY",
          periodId: periodAId,
          subjectId: englishSubjectId,
          teacherUserId: englishTeacherId,
        });
      expect(response.status).toBe(201);
      createdSlotIds.push(response.body.id);
    });

    it("400s Sunday — structural, DTO-level @IsEnum rejection", async () => {
      const response = await createSlot({ dayOfWeek: "SUNDAY", periodId: periodBId });
      expect(response.status).toBe(400);
    });

    it("400s a class-slot collision — this class already has something at this day+period", async () => {
      const response = await createSlot({ subjectId: englishSubjectId, teacherUserId: englishTeacherId });
      expect(response.status).toBe(400);
    });

    it("400s a teacher double-booked across a DIFFERENT class at the same day+period", async () => {
      // jss1AArmId, same MONDAY + periodA the first test already claimed for
      // jss2AArmId — mathTeacherId is assigned to teach Mathematics in BOTH
      // arms (seeded), so this is a legitimate assignment, just double-booked.
      const response = await createSlot({ classArmId: jss1AArmId });
      expect(response.status).toBe(400);

      const stillOnlyOne = await prisma.timetableSlot.findMany({ where: { schoolId: sunriseId, dayOfWeek: "MONDAY", periodId: periodAId } });
      expect(stillOnlyOne).toHaveLength(1);
    });

    it("400s a teacher assigned to teach a DIFFERENT subject than the one given", async () => {
      const response = await createSlot({ classArmId: jss1AArmId, dayOfWeek: "WEDNESDAY", subjectId: englishSubjectId, teacherUserId: mathTeacherId });
      expect(response.status).toBe(400);
    });

    it("404s (not 400) a subject with no teacher assigned to this class at all", async () => {
      const response = await createSlot({ classArmId: jss1AArmId, dayOfWeek: "WEDNESDAY", subjectId: noAssignmentSubjectId, teacherUserId: mathTeacherId });
      expect(response.status).toBe(404);
    });

    it("400s a Saturday slot for a class whose includesSaturday is false; 201s once it's flipped true", async () => {
      const blocked = await createSlot({ classArmId: jss1AArmId, dayOfWeek: "SATURDAY", periodId: periodBId });
      expect(blocked.status).toBe(400);

      const flip = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${jss1AArmId}`)
        .set(auth(sunriseAdminToken))
        .send({ includesSaturday: true });
      expect(flip.status).toBe(200);

      const allowed = await createSlot({ classArmId: jss1AArmId, dayOfWeek: "SATURDAY", periodId: periodBId });
      expect(allowed.status).toBe(201);
      createdSlotIds.push(allowed.body.id);

      const revert = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${jss1AArmId}`)
        .set(auth(sunriseAdminToken))
        .send({ includesSaturday: false });
      expect(revert.status).toBe(200);
    });

    it("404s (not 403) cross-tenant ids on every field, both directions", async () => {
      const crossClassArm = await createSlot({ classArmId: hillcrestArmId, dayOfWeek: "THURSDAY" });
      expect(crossClassArm.status).toBe(404);

      const crossSession = await createSlot({ sessionId: hillcrestSessionId, dayOfWeek: "THURSDAY" });
      expect(crossSession.status).toBe(404);

      const hillcrestPeriod = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(hillcrestAdminToken))
        .send({ name: "E2E-TTS-Hillcrest-Period", startsAt: "08:00", endsAt: "08:45", sortOrder: 1 });
      const crossPeriod = await createSlot({ periodId: hillcrestPeriod.body.id, dayOfWeek: "THURSDAY" });
      expect(crossPeriod.status).toBe(404);
      await prisma.period.delete({ where: { id: hillcrestPeriod.body.id } });

      const crossSubject = await createSlot({ subjectId: hillcrestSubjectId, teacherUserId: mathTeacherId, dayOfWeek: "THURSDAY" });
      expect(crossSubject.status).toBe(404);

      const crossTeacher = await createSlot({ teacherUserId: hillcrestTeacherId, dayOfWeek: "THURSDAY" });
      expect(crossTeacher.status).toBe(404);
    });

    it("403s a TEACHER categorically; rejects unauthenticated requests", async () => {
      const forbidden = await request(app.getHttpServer())
        .post("/api/v1/calendar/timetable-slots")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "FRIDAY", periodId: periodBId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });
      expect(forbidden.status).toBe(403);

      const unauth = await request(app.getHttpServer()).get("/api/v1/calendar/timetable-slots").query({ classArmId: jss2AArmId, sessionId: sunriseSessionId });
      expect(unauth.status).toBe(401);
    });
  });

  describe("GET /calendar/timetable-slots", () => {
    it("lists slots ordered by period sortOrder then weekday", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/calendar/timetable-slots")
        .query({ classArmId: jss2AArmId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      const rows = response.body as { periodId: string; dayOfWeek: string }[];
      const mondayPeriodA = rows.findIndex((r) => r.periodId === periodAId && r.dayOfWeek === "MONDAY");
      const tuesdayPeriodA = rows.findIndex((r) => r.periodId === periodAId && r.dayOfWeek === "TUESDAY");
      expect(mondayPeriodA).toBeGreaterThanOrEqual(0);
      expect(tuesdayPeriodA).toBeGreaterThan(mondayPeriodA);
    });

    it("404s (not 403) cross-tenant classArmId/sessionId", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/calendar/timetable-slots")
        .query({ classArmId: hillcrestArmId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(404);
    });
  });

  describe("PATCH /calendar/timetable-slots/:id", () => {
    it("reassigns subject+teacher on a fixed grid cell", async () => {
      const created = await createSlot({ dayOfWeek: "FRIDAY", periodId: periodBId });
      expect(created.status).toBe(201);
      createdSlotIds.push(created.body.id);

      const patched = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(sunriseAdminToken))
        .send({ subjectId: englishSubjectId, teacherUserId: englishTeacherId });
      expect(patched.status).toBe(200);
      expect(patched.body.subjectName).toBe("English Language");
      expect(patched.body.teacherName).toBe("Ngozi Chukwuma");
      // day/period/class/session unchanged.
      expect(patched.body.dayOfWeek).toBe("FRIDAY");
      expect(patched.body.classArmId).toBe(jss2AArmId);
    });

    it("re-sending the same subject/teacher doesn't false-positive its own double-booking/collision checks", async () => {
      const created = await createSlot({ dayOfWeek: "THURSDAY", periodId: periodBId });
      expect(created.status).toBe(201);
      createdSlotIds.push(created.body.id);

      const patched = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(sunriseAdminToken))
        .send({ subjectId: mathSubjectId, teacherUserId: mathTeacherId });
      expect(patched.status).toBe(200);
    });

    it("400s reassigning to a teacher who doesn't teach the new subject", async () => {
      const created = await createSlot({ dayOfWeek: "TUESDAY", periodId: periodBId });
      expect(created.status).toBe(201);
      createdSlotIds.push(created.body.id);

      const patched = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(sunriseAdminToken))
        .send({ subjectId: englishSubjectId, teacherUserId: mathTeacherId });
      expect(patched.status).toBe(400);
    });

    it("403s a TEACHER categorically; 404s (not 403) cross-tenant", async () => {
      const created = await createSlot({ dayOfWeek: "WEDNESDAY", periodId: periodBId, classArmId: jss2AArmId });
      expect(created.status).toBe(201);
      createdSlotIds.push(created.body.id);

      const forbidden = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(sunriseMathTeacherToken))
        .send({ subjectId: englishSubjectId, teacherUserId: englishTeacherId });
      expect(forbidden.status).toBe(403);

      const crossTenant = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(hillcrestAdminToken))
        .send({ subjectId: englishSubjectId, teacherUserId: englishTeacherId });
      expect(crossTenant.status).toBe(404);
    });
  });

  describe("DELETE /calendar/timetable-slots/:id", () => {
    it("removes a slot; a second delete 404s", async () => {
      const created = await createSlot({ dayOfWeek: "TUESDAY", periodId: periodAId, classArmId: jss1AArmId });
      expect(created.status).toBe(201);

      const del = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(del.status).toBe(200);

      const redelete = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(redelete.status).toBe(404);
    });

    it("freeing a slot lets a previously-double-booked teacher take it", async () => {
      // jss2AArmId/MONDAY/periodA (mathTeacherId) still exists from the very
      // first test; jss1AArmId/MONDAY/periodA was blocked by it earlier.
      const stillBlocked = await createSlot({ classArmId: jss1AArmId });
      expect(stillBlocked.status).toBe(400);

      const existing = await prisma.timetableSlot.findFirstOrThrow({ where: { schoolId: sunriseId, classArmId: jss2AArmId, dayOfWeek: "MONDAY", periodId: periodAId } });
      const del = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/timetable-slots/${existing.id}`)
        .set(auth(sunriseAdminToken));
      expect(del.status).toBe(200);
      createdSlotIds.splice(createdSlotIds.indexOf(existing.id), 1);

      const nowAllowed = await createSlot({ classArmId: jss1AArmId });
      expect(nowAllowed.status).toBe(201);
      createdSlotIds.push(nowAllowed.body.id);
    });

    it("403s a TEACHER categorically; 404s (not 403) cross-tenant", async () => {
      const created = await createSlot({ dayOfWeek: "THURSDAY", periodId: periodAId, classArmId: jss1AArmId });
      expect(created.status).toBe(201);
      createdSlotIds.push(created.body.id);

      const forbidden = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(sunriseMathTeacherToken));
      expect(forbidden.status).toBe(403);

      const crossTenant = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/timetable-slots/${created.body.id}`)
        .set(auth(hillcrestAdminToken));
      expect(crossTenant.status).toBe(404);

      const stillThere = await prisma.timetableSlot.findUnique({ where: { id: created.body.id } });
      expect(stillThere).not.toBeNull();
    });
  });
});
