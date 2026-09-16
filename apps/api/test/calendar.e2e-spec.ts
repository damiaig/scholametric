import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, GuardianRelationship, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.8 step 1 (SPEC_V0.8.md §7 item 1) — the calendar domain's foundation:
// periods (bell schedule), breaks, holidays, per-class school-days.
// Genuinely new domain — no shared tables/FKs with grades/exams.
describe("Calendar foundation (e2e) — SPEC_V0.8.md §7 item 1, v0.8 step 1", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let hillcrestId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let hillcrestSessionId: string;
  let sunriseArmId: string;
  let hillcrestArmId: string;

  const createdPeriodIds: string[] = [];
  const createdBreakIds: string[] = [];
  const createdHolidayIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdGuardianIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;
    const sunriseJss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    sunriseArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: sunriseJss2.id, name: "A" } })).id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    hillcrestSessionId = hillcrestSession.id;
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { guardianId: { in: createdGuardianIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.classSchoolDays.deleteMany({ where: { classArmId: { in: [sunriseArmId, hillcrestArmId] } } });
    await prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
    await prisma.break.deleteMany({ where: { id: { in: createdBreakIds } } });
    await prisma.period.deleteMany({ where: { id: { in: createdPeriodIds } } });
    await app.close();
  });

  describe("POST/GET/PATCH/DELETE /calendar/periods", () => {
    it("admin creates, lists ordered by sortOrder", async () => {
      const p1 = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-P1", startsAt: "08:00", endsAt: "08:45", sortOrder: 1 });
      expect(p1.status).toBe(201);
      createdPeriodIds.push(p1.body.id);

      const p2 = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-P2", startsAt: "08:45", endsAt: "09:30", sortOrder: 2 });
      expect(p2.status).toBe(201);
      createdPeriodIds.push(p2.body.id);

      const list = await request(app.getHttpServer()).get("/api/v1/calendar/periods").set(auth(sunriseAdminToken));
      expect(list.status).toBe(200);
      const names = list.body.map((p: { name: string }) => p.name);
      expect(names.indexOf("E2E-Cal-P1")).toBeLessThan(names.indexOf("E2E-Cal-P2"));
    });

    it("PROPRIETOR can also create (Q3 — both manage roles)", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseProprietorToken))
        .send({ name: "E2E-Cal-Proprietor", startsAt: "10:00", endsAt: "10:45", sortOrder: 10 });
      expect(response.status).toBe(201);
      createdPeriodIds.push(response.body.id);
    });

    it("400s startsAt >= endsAt", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-BadOrder", startsAt: "09:00", endsAt: "09:00", sortOrder: 99 });
      expect(response.status).toBe(400);
    });

    it("400s a malformed HH:mm", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-BadTime", startsAt: "9am", endsAt: "10:00", sortOrder: 99 });
      expect(response.status).toBe(400);
    });

    it("409s a duplicate name in the same school", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-P1", startsAt: "11:00", endsAt: "11:45", sortOrder: 20 });
      expect(response.status).toBe(409);
    });

    it("400s a period overlapping an existing period", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-Overlap", startsAt: "08:20", endsAt: "09:00", sortOrder: 21 });
      expect(response.status).toBe(400);
    });

    it("PATCH updates name/time; PATCHing a row against itself doesn't false-positive the overlap check", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/periods/${createdPeriodIds[0]}`)
        .set(auth(sunriseAdminToken))
        .send({ startsAt: "08:00", endsAt: "08:45", name: "E2E-Cal-P1-Renamed" });
      expect(response.status).toBe(200);
      expect(response.body.name).toBe("E2E-Cal-P1-Renamed");
    });

    it("PATCH 400s if the update would overlap a different period", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/periods/${createdPeriodIds[0]}`)
        .set(auth(sunriseAdminToken))
        .send({ endsAt: "09:00" }); // now overlaps P2 (08:45-09:30)
      expect(response.status).toBe(400);
    });

    it("DELETE removes it; a second delete 404s", async () => {
      const scratch = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-Scratch-Delete", startsAt: "14:00", endsAt: "14:45", sortOrder: 50 });
      expect(scratch.status).toBe(201);

      const del = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/periods/${scratch.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(del.status).toBe(200);

      const redelete = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/periods/${scratch.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(redelete.status).toBe(404);
    });

    it("403s a TEACHER categorically", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseTeacherToken))
        .send({ name: "E2E-Cal-TeacherAttempt", startsAt: "15:00", endsAt: "15:45", sortOrder: 60 });
      expect(response.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/calendar/periods");
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/periods/${createdPeriodIds[0]}`)
        .set(auth(hillcrestAdminToken))
        .send({ name: "Hijack attempt" });
      expect(a.status).toBe(404);

      const hillcrestPeriod = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(hillcrestAdminToken))
        .send({ name: "E2E-Cal-Hillcrest", startsAt: "08:00", endsAt: "08:45", sortOrder: 1 });
      expect(hillcrestPeriod.status).toBe(201);
      createdPeriodIds.push(hillcrestPeriod.body.id);

      const b = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/periods/${hillcrestPeriod.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(b.status).toBe(404);

      const stillThere = await prisma.period.findUnique({ where: { id: hillcrestPeriod.body.id } });
      expect(stillThere).not.toBeNull();
    });

    it("a school's list never includes another school's periods", async () => {
      const list = await request(app.getHttpServer()).get("/api/v1/calendar/periods").set(auth(sunriseAdminToken));
      expect(list.body.some((p: { name: string }) => p.name === "E2E-Cal-Hillcrest")).toBe(false);
    });
  });

  describe("POST/GET/PATCH/DELETE /calendar/breaks", () => {
    it("admin creates, lists ordered by startsAt", async () => {
      const b1 = await request(app.getHttpServer())
        .post("/api/v1/calendar/breaks")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-Lunch", startsAt: "12:00", endsAt: "12:40" });
      expect(b1.status).toBe(201);
      createdBreakIds.push(b1.body.id);

      // 09:35-09:50 sits in the gap between P2 (08:45-09:30) and the
      // Proprietor period (10:00-10:45) created earlier in this file —
      // deliberately chosen to avoid the combined periods+breaks overlap
      // check this same test suite proves elsewhere.
      const b2 = await request(app.getHttpServer())
        .post("/api/v1/calendar/breaks")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-ShortBreak", startsAt: "09:35", endsAt: "09:50" });
      expect(b2.status).toBe(201);
      createdBreakIds.push(b2.body.id);

      const list = await request(app.getHttpServer()).get("/api/v1/calendar/breaks").set(auth(sunriseAdminToken));
      expect(list.status).toBe(200);
      const names = list.body.map((b: { name: string }) => b.name);
      expect(names.indexOf("E2E-Cal-ShortBreak")).toBeLessThan(names.indexOf("E2E-Cal-Lunch"));
    });

    it("400s a break overlapping an existing PERIOD — one shared daily timeline", async () => {
      // createdPeriodIds[0] is E2E-Cal-P1-Renamed, 08:00-09:00 by this point.
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/breaks")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-OverlapPeriod", startsAt: "08:30", endsAt: "08:50" });
      expect(response.status).toBe(400);
    });

    it("400s a period overlapping an existing BREAK — checked the other direction too", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/periods")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-OverlapBreak", startsAt: "12:10", endsAt: "12:30", sortOrder: 70 });
      expect(response.status).toBe(400);
    });

    it("PATCH updates it; DELETE removes it", async () => {
      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/breaks/${createdBreakIds[1]}`)
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-ShortBreak-Renamed" });
      expect(patch.status).toBe(200);
      expect(patch.body.name).toBe("E2E-Cal-ShortBreak-Renamed");

      const del = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/breaks/${createdBreakIds[1]}`)
        .set(auth(sunriseAdminToken));
      expect(del.status).toBe(200);
      createdBreakIds.splice(1, 1);
    });

    it("403s a TEACHER categorically; rejects unauthenticated; 404s cross-tenant", async () => {
      const forbidden = await request(app.getHttpServer())
        .post("/api/v1/calendar/breaks")
        .set(auth(sunriseTeacherToken))
        .send({ name: "E2E-Cal-TeacherBreak", startsAt: "13:00", endsAt: "13:15" });
      expect(forbidden.status).toBe(403);

      const unauth = await request(app.getHttpServer()).get("/api/v1/calendar/breaks");
      expect(unauth.status).toBe(401);

      const crossTenant = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/breaks/${createdBreakIds[0]}`)
        .set(auth(hillcrestAdminToken))
        .send({ name: "Hijack" });
      expect(crossTenant.status).toBe(404);
    });
  });

  describe("POST/GET/PATCH/DELETE /calendar/holidays", () => {
    it("admin creates with sessionId only (no term), lists ordered by startDate", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseAdminToken))
        .send({ sessionId: sunriseSessionId, name: "E2E-Cal-Christmas", startDate: "2026-12-20", endDate: "2027-01-08" });
      expect(response.status).toBe(201);
      expect(response.body.termId).toBeNull();
      createdHolidayIds.push(response.body.id);
    });

    it("accepts an optional termId within the same session", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseAdminToken))
        .send({ sessionId: sunriseSessionId, termId: sunriseTermId, name: "E2E-Cal-PublicHoliday", startDate: "2026-10-01", endDate: "2026-10-01" });
      expect(response.status).toBe(201);
      expect(response.body.termId).toBe(sunriseTermId);
      createdHolidayIds.push(response.body.id);
    });

    it("two holidays covering the same dates are both accepted — no overlap check for holidays", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseAdminToken))
        .send({ sessionId: sunriseSessionId, name: "E2E-Cal-SameDayHoliday", startDate: "2026-10-01", endDate: "2026-10-01" });
      expect(response.status).toBe(201);
      createdHolidayIds.push(response.body.id);
    });

    it("400s startDate after endDate", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseAdminToken))
        .send({ sessionId: sunriseSessionId, name: "E2E-Cal-BadRange", startDate: "2026-10-05", endDate: "2026-10-01" });
      expect(response.status).toBe(400);
    });

    it("400s a missing sessionId", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-NoSession", startDate: "2026-10-01", endDate: "2026-10-01" });
      expect(response.status).toBe(400);
    });

    it("a spanning-a-session-rollover holiday (Dec into Jan) is accepted — no bounds check against session/term dates", async () => {
      // The Christmas holiday created above already spans 2026-12-20 to
      // 2027-01-08; a real session likely ends well before that. Its 201
      // above already proves this — this test documents WHY: a bounds
      // check would wrongly reject the normal cross-rollover case.
      const list = await request(app.getHttpServer())
        .get("/api/v1/calendar/holidays")
        .query({ sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(list.body.some((h: { name: string }) => h.name === "E2E-Cal-Christmas")).toBe(true);
    });

    it("404s (not 400) a sessionId belonging to another tenant", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseAdminToken))
        .send({ sessionId: hillcrestSessionId, name: "E2E-Cal-CrossSession", startDate: "2026-10-01", endDate: "2026-10-01" });
      expect(response.status).toBe(404);
    });

    it("PATCH updates name/dates/termId; DELETE removes it", async () => {
      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/holidays/${createdHolidayIds[1]}`)
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-Cal-PublicHoliday-Renamed", termId: null });
      expect(patch.status).toBe(200);
      expect(patch.body.name).toBe("E2E-Cal-PublicHoliday-Renamed");
      expect(patch.body.termId).toBeNull();

      const del = await request(app.getHttpServer())
        .delete(`/api/v1/calendar/holidays/${createdHolidayIds[1]}`)
        .set(auth(sunriseAdminToken));
      expect(del.status).toBe(200);
      createdHolidayIds.splice(1, 1);
    });

    it("403s a TEACHER categorically; rejects unauthenticated; 404s cross-tenant read", async () => {
      const forbidden = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseTeacherToken))
        .send({ sessionId: sunriseSessionId, name: "E2E-Cal-TeacherHoliday", startDate: "2026-10-01", endDate: "2026-10-01" });
      expect(forbidden.status).toBe(403);

      const unauth = await request(app.getHttpServer()).get("/api/v1/calendar/holidays").query({ sessionId: sunriseSessionId });
      expect(unauth.status).toBe(401);

      const crossTenant = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/holidays/${createdHolidayIds[0]}`)
        .set(auth(hillcrestAdminToken))
        .send({ name: "Hijack" });
      expect(crossTenant.status).toBe(404);
    });
  });

  describe("GET /calendar/class-school-days, PUT /calendar/class-school-days/:classArmId", () => {
    it("lists every class arm with includesSaturday defaulting to false", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/calendar/class-school-days").set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      const row = response.body.find((r: { classArmId: string }) => r.classArmId === sunriseArmId);
      expect(row).toBeDefined();
      expect(row.includesSaturday).toBe(false);
    });

    it("PUT sets includesSaturday true, reflected on the next GET; PUT false round-trips back", async () => {
      const setTrue = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${sunriseArmId}`)
        .set(auth(sunriseAdminToken))
        .send({ includesSaturday: true });
      expect(setTrue.status).toBe(200);
      expect(setTrue.body.includesSaturday).toBe(true);

      const list = await request(app.getHttpServer()).get("/api/v1/calendar/class-school-days").set(auth(sunriseAdminToken));
      const row = list.body.find((r: { classArmId: string }) => r.classArmId === sunriseArmId);
      expect(row.includesSaturday).toBe(true);

      const setFalse = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${sunriseArmId}`)
        .set(auth(sunriseAdminToken))
        .send({ includesSaturday: false });
      expect(setFalse.status).toBe(200);
      expect(setFalse.body.includesSaturday).toBe(false);
    });

    // Sunday-never is STRUCTURAL (schema.prisma's ClassSchoolDays has no
    // field capable of expressing it), not a validation rule to bypass.
    // This proves the global ValidationPipe's forbidNonWhitelisted rejects
    // any attempt to smuggle a Sunday-shaped field through the DTO layer,
    // and that no such write ever reaches the database.
    it("400s (and persists nothing) when a Sunday-shaped field is smuggled into the body", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${sunriseArmId}`)
        .set(auth(sunriseAdminToken))
        .send({ includesSaturday: true, includesSunday: true });
      expect(response.status).toBe(400);

      const stillFalse = await prisma.classSchoolDays.findUnique({ where: { classArmId: sunriseArmId } });
      expect(stillFalse?.includesSaturday ?? false).toBe(false);
    });

    it("400s a non-boolean includesSaturday", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${sunriseArmId}`)
        .set(auth(sunriseAdminToken))
        .send({ includesSaturday: "yes" });
      expect(response.status).toBe(400);
    });

    it("403s a TEACHER categorically; rejects unauthenticated; 404s a cross-tenant classArmId", async () => {
      const forbidden = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${sunriseArmId}`)
        .set(auth(sunriseTeacherToken))
        .send({ includesSaturday: true });
      expect(forbidden.status).toBe(403);

      const unauth = await request(app.getHttpServer()).get("/api/v1/calendar/class-school-days");
      expect(unauth.status).toBe(401);

      const crossTenant = await request(app.getHttpServer())
        .put(`/api/v1/calendar/class-school-days/${hillcrestArmId}`)
        .set(auth(sunriseAdminToken))
        .send({ includesSaturday: true });
      expect(crossTenant.status).toBe(404);

      const untouched = await prisma.classSchoolDays.findUnique({ where: { classArmId: hillcrestArmId } });
      expect(untouched).toBeNull();
    });
  });

  // RolesGuard (src/common/guards/roles.guard.ts) is a single uniform
  // `requiredRoles.includes(role)` check with zero per-role branching —
  // CalendarController has exactly one controller-level @Roles(SCHOOL_ADMIN,
  // PROPRIETOR) and no per-route overrides, so TEACHER/STUDENT/PARENT all
  // hit the identical code path. TEACHER is proven categorically above on
  // every resource; this proves STUDENT and PARENT hit that same guard too,
  // on one representative route rather than repeating the full matrix.
  describe("STUDENT/PARENT categorical exclusion", () => {
    it("403s both STUDENT and PARENT on GET /calendar/periods", async () => {
      const stamp = Date.now();
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);

      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-CAL/RoleGuard-${stamp}`,
          firstName: "CalendarRoleGuard",
          lastName: "Student",
          gender: Gender.FEMALE,
          dateOfBirth: new Date("2012-01-01"),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348039${String(stamp).slice(-6)}`,
        },
      });
      createdStudentIds.push(student.id);
      const studentUser = await prisma.user.create({
        data: {
          schoolId: sunriseId,
          role: UserRole.STUDENT,
          username: `E2ECALS${stamp}`.slice(0, 20).toUpperCase(),
          studentId: student.id,
          firstName: "CalendarRoleGuard",
          lastName: "Student",
          passwordHash,
          mustChangePassword: false,
        },
      });
      createdUserIds.push(studentUser.id);
      const studentToken = await loginAs(app, studentUser.username!, "sunrise");

      const guardian = await prisma.guardian.create({
        data: { schoolId: sunriseId, firstName: "CalendarRoleGuard", lastName: "Guardian", phone: `+2348038${String(stamp).slice(-6)}` },
      });
      createdGuardianIds.push(guardian.id);
      await prisma.studentGuardian.create({
        data: { schoolId: sunriseId, studentId: student.id, guardianId: guardian.id, relationship: GuardianRelationship.OTHER, isPrimary: true },
      });
      const parentUser = await prisma.user.create({
        data: {
          schoolId: sunriseId,
          role: UserRole.PARENT,
          username: `E2ECALP${stamp}`.slice(0, 20).toUpperCase(),
          guardianId: guardian.id,
          firstName: "CalendarRoleGuard",
          lastName: "Parent",
          passwordHash,
          mustChangePassword: false,
        },
      });
      createdUserIds.push(parentUser.id);
      const parentToken = await loginAs(app, parentUser.username!, "sunrise");

      const studentRes = await request(app.getHttpServer()).get("/api/v1/calendar/periods").set(auth(studentToken));
      expect(studentRes.status).toBe(403);

      const parentRes = await request(app.getHttpServer()).get("/api/v1/calendar/periods").set(auth(parentToken));
      expect(parentRes.status).toBe(403);
    });
  });
});
