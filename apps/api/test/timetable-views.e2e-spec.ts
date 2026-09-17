import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, GuardianRelationship, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

interface ResolvedPeriod {
  periodId: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherName: string | null;
  classArmId: string | null;
}

interface ResolvedDay {
  date: string;
  dayOfWeek: string;
  isSchoolDay: boolean;
  nonSchoolReason: string | null;
  holidayName: string | null;
  periods: ResolvedPeriod[];
  breaks: { name: string }[];
}

// v0.8 step 3 (SPEC_V0.8.md §7 item 3) — on-read composition + the first
// non-admin read access to the calendar domain. The fixed week below
// (2026-09-14 Mon .. 2026-09-20 Sun) is a real, verified calendar week —
// every weekday appears exactly once, so holiday/weekend/Saturday
// exclusion can all be proven against concrete dates rather than
// "whatever today happens to be."
describe("Timetable views (e2e) — SPEC_V0.8.md §7 item 3, v0.8 step 3", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseMathTeacherToken: string;
  let sunriseEnglishTeacherToken: string;
  let hillcrestTeacherToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let mathTeacherId: string;
  let englishTeacherId: string;
  let mathSubjectId: string;
  let englishSubjectId: string;

  let periodAId: string;
  let periodBId: string;
  let holidayId: string;

  let studentAId: string;
  let studentToken: string;
  let guardianAId: string;
  let parentToken: string;
  let otherFamilyStudentId: string;

  const createdSlotIds: string[] = [];
  const createdPeriodIds: string[] = [];
  const createdHolidayIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const WEEK_FROM = "2026-09-14"; // Monday
  const WEEK_TO = "2026-09-20"; // Sunday
  const HOLIDAY_DATE = "2026-09-16"; // Wednesday, inside the week

  async function createSlot(token: string, body: Record<string, unknown>) {
    const response = await request(app.getHttpServer()).post("/api/v1/calendar/timetable-slots").set(auth(token)).send(body);
    if (response.status !== 201) {
      throw new Error(`slot creation failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    createdSlotIds.push(response.body.id);
    return response.body.id as string;
  }

  async function setSaturday(armId: string, includesSaturday: boolean) {
    const response = await request(app.getHttpServer())
      .put(`/api/v1/calendar/class-school-days/${armId}`)
      .set(auth(sunriseAdminToken))
      .send({ includesSaturday });
    if (response.status !== 200) {
      throw new Error(`set-Saturday failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  function dayFor(body: { days: ResolvedDay[] }, date: string): ResolvedDay {
    const day = body.days.find((d) => d.date === date);
    if (!day) throw new Error(`no resolved day for ${date}`);
    return day;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseMathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    sunriseEnglishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    hillcrestTeacherToken = await loginAs(app, "teacher@hillcrest.test", "hillcrest");

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

    const periodA = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TTV-PeriodA", startsAt: "07:00", endsAt: "07:45", sortOrder: 1 });
    periodAId = periodA.body.id;
    createdPeriodIds.push(periodAId);
    const periodB = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TTV-PeriodB", startsAt: "07:45", endsAt: "08:30", sortOrder: 2 });
    periodBId = periodB.body.id;
    createdPeriodIds.push(periodBId);

    const holiday = await request(app.getHttpServer())
      .post("/api/v1/calendar/holidays")
      .set(auth(sunriseAdminToken))
      .send({ sessionId: sunriseSessionId, name: "E2E-TTV-Holiday", startDate: HOLIDAY_DATE, endDate: HOLIDAY_DATE });
    holidayId = holiday.body.id;
    createdHolidayIds.push(holidayId);

    // jss2A: Saturday-enabled. MONDAY (Math), WEDNESDAY (Math, but this
    // whole date is the holiday above — proves holiday wins over an
    // existing template slot), SATURDAY (Math).
    await setSaturday(jss2AArmId, true);
    await createSlot(sunriseAdminToken, { classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "MONDAY", periodId: periodAId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });
    await createSlot(sunriseAdminToken, { classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "WEDNESDAY", periodId: periodBId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });
    await createSlot(sunriseAdminToken, { classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "SATURDAY", periodId: periodAId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });

    // jss1A: Saturday-disabled (the default) at the end of setup, but
    // temporarily enabled just long enough to create a Saturday slot —
    // Step 2 validates school-day-allowed at CREATION time; Step 3 checks
    // the CURRENT flag at READ time, so this slot surviving the flip back
    // to false is exactly what proves per-slot (not whole-day) filtering
    // for the teacher's cross-class view. TUESDAY (English) is a plain
    // weekday slot proving a class sees every subject, not just the
    // teacher who happens to also be the caller in another test.
    await createSlot(sunriseAdminToken, { classArmId: jss1AArmId, sessionId: sunriseSessionId, dayOfWeek: "TUESDAY", periodId: periodAId, subjectId: englishSubjectId, teacherUserId: englishTeacherId });
    await setSaturday(jss1AArmId, true);
    await createSlot(sunriseAdminToken, { classArmId: jss1AArmId, sessionId: sunriseSessionId, dayOfWeek: "SATURDAY", periodId: periodBId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });
    await setSaturday(jss1AArmId, false);

    // A student + linked parent, enrolled in jss2A for the CURRENT session.
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-TTV/StudentA",
        firstName: "TimetableView",
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348037000001",
      },
    });
    studentAId = student.id;
    createdStudentIds.push(studentAId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: studentAId, classArmId: jss2AArmId, sessionId: sunriseSessionId } });

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2ETTVSTUDENT", studentId: studentAId, firstName: "TimetableView", lastName: "Student", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, "E2ETTVSTUDENT", "sunrise");

    const guardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "TimetableView", lastName: "Guardian", phone: "+2348037000002" } });
    guardianAId = guardian.id;
    createdGuardianIds.push(guardianAId);
    await prisma.studentGuardian.create({ data: { schoolId: sunriseId, studentId: studentAId, guardianId: guardianAId, relationship: GuardianRelationship.OTHER, isPrimary: true } });
    const parentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: "E2ETTVPARENT", guardianId: guardianAId, firstName: "TimetableView", lastName: "Parent", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(parentUser.id);
    parentToken = await loginAs(app, "E2ETTVPARENT", "sunrise");

    // Any real, unrelated student — the "belongs to a different family" 404 proof.
    otherFamilyStudentId = (await prisma.student.findFirstOrThrow({ where: { schoolId: sunriseId, id: { not: studentAId } } })).id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { guardianId: { in: createdGuardianIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.timetableSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
    await prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
    await prisma.period.deleteMany({ where: { id: { in: createdPeriodIds } } });
    await prisma.classSchoolDays.deleteMany({ where: { classArmId: { in: [jss1AArmId, jss2AArmId] } } });
    await app.close();
  });

  describe("GET /me/timetable (STUDENT)", () => {
    it("resolves the student's own class: Monday slot shown, holiday excludes Wednesday (name populated), Sunday excluded, Saturday shown (class opted in)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/timetable")
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(studentToken));
      expect(response.status).toBe(200);
      expect(response.body.classArmId).toBe(jss2AArmId);
      expect(response.body.days).toHaveLength(7);

      const monday = dayFor(response.body, "2026-09-14");
      expect(monday.isSchoolDay).toBe(true);
      expect(monday.dayOfWeek).toBe("MONDAY");
      const mondayPeriodA = monday.periods.find((p) => p.periodId === periodAId)!;
      expect(mondayPeriodA.subjectName).toBe("Mathematics");
      expect(mondayPeriodA.teacherName).toBe("Bola Ogundare");

      const wednesday = dayFor(response.body, HOLIDAY_DATE);
      expect(wednesday.isSchoolDay).toBe(false);
      expect(wednesday.nonSchoolReason).toBe("HOLIDAY");
      expect(wednesday.holidayName).toBe("E2E-TTV-Holiday");
      expect(wednesday.periods).toHaveLength(0);

      const sunday = dayFor(response.body, "2026-09-20");
      expect(sunday.isSchoolDay).toBe(false);
      expect(sunday.nonSchoolReason).toBe("WEEKEND");
      expect(sunday.dayOfWeek).toBe("SUNDAY");

      const saturday = dayFor(response.body, "2026-09-19");
      expect(saturday.isSchoolDay).toBe(true); // jss2A opted in
      const saturdayPeriodA = saturday.periods.find((p) => p.periodId === periodAId)!;
      expect(saturdayPeriodA.subjectName).toBe("Mathematics");
    });

    it("breaks are returned on every school day (school-wide, unaffected by class)", async () => {
      const brk = await request(app.getHttpServer())
        .post("/api/v1/calendar/breaks")
        .set(auth(sunriseAdminToken))
        .send({ name: "E2E-TTV-Break", startsAt: "10:00", endsAt: "10:15" });
      expect(brk.status).toBe(201);
      try {
        const response = await request(app.getHttpServer())
          .get("/api/v1/me/timetable")
          .query({ from: WEEK_FROM, to: WEEK_FROM })
          .set(auth(studentToken));
        const monday = dayFor(response.body, "2026-09-14");
        expect(monday.breaks.some((b: { name: string }) => b.name === "E2E-TTV-Break")).toBe(true);
      } finally {
        await prisma.break.delete({ where: { id: brk.body.id } });
      }
    });

    it("has no classArmId parameter to request another class with; 404s with no current enrollment", async () => {
      // No such param exists on this route at all — nothing to fuzz. This
      // test documents that structurally, then proves the "no enrollment"
      // 404 with a second, unenrolled student account.
      const unenrolled = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: "E2E-TTV/Unenrolled",
          firstName: "Unenrolled",
          lastName: "Student",
          gender: Gender.MALE,
          dateOfBirth: new Date("2012-01-01"),
          guardianName: "E2E Guardian",
          guardianPhone: "+2348037000003",
        },
      });
      createdStudentIds.push(unenrolled.id);
      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
      const unenrolledUser = await prisma.user.create({
        data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2ETTVUNENROLLED", studentId: unenrolled.id, firstName: "Unenrolled", lastName: "Student", passwordHash, mustChangePassword: false },
      });
      createdUserIds.push(unenrolledUser.id);
      const unenrolledToken = await loginAs(app, "E2ETTVUNENROLLED", "sunrise");

      const response = await request(app.getHttpServer())
        .get("/api/v1/me/timetable")
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(unenrolledToken));
      expect(response.status).toBe(404);
    });

    it("400s from > to; 400s a range over 31 days", async () => {
      const backwards = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: WEEK_TO, to: WEEK_FROM }).set(auth(studentToken));
      expect(backwards.status).toBe(400);

      const tooLong = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: "2026-01-01", to: "2026-12-31" }).set(auth(studentToken));
      expect(tooLong.status).toBe(400);
    });

    it("403s a TEACHER; 403s a PARENT; rejects unauthenticated", async () => {
      const teacherAttempt = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: WEEK_FROM, to: WEEK_TO }).set(auth(sunriseMathTeacherToken));
      expect(teacherAttempt.status).toBe(403);
      const parentAttempt = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: WEEK_FROM, to: WEEK_TO }).set(auth(parentToken));
      expect(parentAttempt.status).toBe(403);
      const unauth = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: WEEK_FROM, to: WEEK_TO });
      expect(unauth.status).toBe(401);
    });
  });

  describe("GET /me/children/:childId/timetable (PARENT)", () => {
    it("resolves the linked child's own class, same shape as the student's own view", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentAId}/timetable`)
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(parentToken));
      expect(response.status).toBe(200);
      expect(response.body.classArmId).toBe(jss2AArmId);
      const monday = dayFor(response.body, "2026-09-14");
      expect(monday.periods.find((p) => p.periodId === periodAId)!.subjectName).toBe("Mathematics");
    });

    it("404s a real student belonging to a DIFFERENT family — the allow-list, not existence-checking", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${otherFamilyStudentId}/timetable`)
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(parentToken));
      expect(response.status).toBe(404);
    });

    it("404s a nonexistent childId identically", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/children/00000000-0000-0000-0000-000000000000/timetable")
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(parentToken));
      expect(response.status).toBe(404);
    });

    it("403s a STUDENT; 403s a TEACHER", async () => {
      const studentAttempt = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentAId}/timetable`)
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(studentToken));
      expect(studentAttempt.status).toBe(403);
      const teacherAttempt = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentAId}/timetable`)
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(sunriseMathTeacherToken));
      expect(teacherAttempt.status).toBe(403);
    });
  });

  describe("GET /me/teaching-timetable (TEACHER)", () => {
    it("shows only the caller's own slots, holiday-excluded Wednesday, and per-slot Saturday filtering across two classes with different policies", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/teaching-timetable")
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(sunriseMathTeacherToken));
      expect(response.status).toBe(200);
      expect(response.body.teacherUserId).toBe(mathTeacherId);

      const monday = dayFor(response.body, "2026-09-14");
      const mondayPeriodA = monday.periods.find((p) => p.periodId === periodAId)!;
      expect(mondayPeriodA.classArmId).toBe(jss2AArmId);
      expect(mondayPeriodA.subjectName).toBe("Mathematics");

      // TUESDAY's real slot belongs to englishTeacher, not mathTeacher —
      // must NOT appear here.
      const tuesday = dayFor(response.body, "2026-09-15");
      expect(tuesday.periods.every((p: { subjectId: string | null }) => p.subjectId === null)).toBe(true);

      const wednesday = dayFor(response.body, HOLIDAY_DATE);
      expect(wednesday.isSchoolDay).toBe(false);
      expect(wednesday.nonSchoolReason).toBe("HOLIDAY");

      // The mixed-Saturday-policy proof: jss2A (enabled) shows its slot at
      // periodA; jss1A (disabled) does NOT show its slot at periodB, even
      // though the row still exists in the DB — the whole Saturday is NOT
      // excluded (periodA still populated), only the disabled class's own
      // period is absent.
      const saturday = dayFor(response.body, "2026-09-19");
      expect(saturday.isSchoolDay).toBe(true);
      const saturdayPeriodA = saturday.periods.find((p) => p.periodId === periodAId)!;
      expect(saturdayPeriodA.classArmId).toBe(jss2AArmId);
      const saturdayPeriodB = saturday.periods.find((p) => p.periodId === periodBId)!;
      expect(saturdayPeriodB.subjectId).toBeNull();

      const sunday = dayFor(response.body, "2026-09-20");
      expect(sunday.isSchoolDay).toBe(false);
      expect(sunday.nonSchoolReason).toBe("WEEKEND");
    });

    it("a different teacher (englishTeacher) sees only their own Tuesday slot, not mathTeacher's Monday one", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/teaching-timetable")
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(sunriseEnglishTeacherToken));
      expect(response.status).toBe(200);

      const tuesday = dayFor(response.body, "2026-09-15");
      const tuesdayPeriodA = tuesday.periods.find((p) => p.periodId === periodAId)!;
      expect(tuesdayPeriodA.classArmId).toBe(jss1AArmId);
      expect(tuesdayPeriodA.subjectName).toBe("English Language");

      const monday = dayFor(response.body, "2026-09-14");
      expect(monday.periods.every((p: { subjectId: string | null }) => p.subjectId === null)).toBe(true);
    });

    it("tenant isolation: a Hillcrest teacher's view never includes any Sunrise slot", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/teaching-timetable")
        .query({ from: WEEK_FROM, to: WEEK_TO })
        .set(auth(hillcrestTeacherToken));
      expect(response.status).toBe(200);
      const allSubjectIds = response.body.days.flatMap((d: { periods: { subjectId: string | null }[] }) => d.periods.map((p) => p.subjectId));
      expect(allSubjectIds).not.toContain(mathSubjectId);
      expect(allSubjectIds).not.toContain(englishSubjectId);
    });

    it("403s a STUDENT; 403s a PARENT; rejects unauthenticated", async () => {
      const studentAttempt = await request(app.getHttpServer()).get("/api/v1/me/teaching-timetable").query({ from: WEEK_FROM, to: WEEK_TO }).set(auth(studentToken));
      expect(studentAttempt.status).toBe(403);
      const parentAttempt = await request(app.getHttpServer()).get("/api/v1/me/teaching-timetable").query({ from: WEEK_FROM, to: WEEK_TO }).set(auth(parentToken));
      expect(parentAttempt.status).toBe(403);
      const unauth = await request(app.getHttpServer()).get("/api/v1/me/teaching-timetable").query({ from: WEEK_FROM, to: WEEK_TO });
      expect(unauth.status).toBe(401);
    });
  });
});
