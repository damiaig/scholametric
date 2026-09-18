import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

interface ResolvedPeriod {
  periodId: string;
  subjectId: string | null;
  subjectName: string | null;
  teacherUserId: string | null;
  teacherName: string | null;
  classArmId: string | null;
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

// v0.8 step 4 (SPEC_V0.8.md §4) — teacher absence (auto-approved) +
// proprietor replacement, laid on top of Step 2's template and overlaid by
// Step 3's on-read composition. MONDAY 2026-09-14 is the same verified
// week Step 3's own e2e uses.
describe("Teacher absence + replacement (e2e) — SPEC_V0.8.md §4, v0.8 step 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let mathTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let mathTeacherId: string;
  let englishTeacherId: string;
  let coverTeacherId: string;
  let hillcrestTeacherId: string;
  let mathSubjectId: string;
  let englishSubjectId: string;

  let periodAId: string;
  let periodBId: string;

  let studentToken: string;
  let studentId: string;

  const createdSlotIds: string[] = [];
  const createdPeriodIds: string[] = [];
  const createdHolidayIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const MONDAY = "2026-09-14";
  const SUNDAY = "2026-09-13";
  const SATURDAY = "2026-09-19";
  const NEXT_MONDAY = "2026-09-21";

  async function createSlot(body: Record<string, unknown>) {
    const response = await request(app.getHttpServer()).post("/api/v1/calendar/timetable-slots").set(auth(sunriseAdminToken)).send(body);
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
    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
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
    coverTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher3@sunrise.test" } })).id;
    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: hillcrest.id, email: "teacher@hillcrest.test" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;
    englishSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "English Language" } })).id;

    const periodA = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TA-PeriodA", startsAt: "07:00", endsAt: "07:45", sortOrder: 1 });
    periodAId = periodA.body.id;
    createdPeriodIds.push(periodAId);
    const periodB = await request(app.getHttpServer())
      .post("/api/v1/calendar/periods")
      .set(auth(sunriseAdminToken))
      .send({ name: "E2E-TA-PeriodB", startsAt: "07:45", endsAt: "08:30", sortOrder: 2 });
    periodBId = periodB.body.id;
    createdPeriodIds.push(periodBId);

    // mathTeacher's own slot — the absence-marking target throughout.
    await createSlot({ classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "MONDAY", periodId: periodAId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });
    // englishTeacher's own slots — MONDAY periodA (the replacement
    // double-booking trap) and MONDAY periodB (a real "colleague's class"
    // mathTeacher has no field to name and no slot to match).
    await createSlot({ classArmId: jss1AArmId, sessionId: sunriseSessionId, dayOfWeek: "MONDAY", periodId: periodAId, subjectId: englishSubjectId, teacherUserId: englishTeacherId });
    await createSlot({ classArmId: jss1AArmId, sessionId: sunriseSessionId, dayOfWeek: "MONDAY", periodId: periodBId, subjectId: englishSubjectId, teacherUserId: englishTeacherId });

    // jss2A's Saturday slot — enabled just long enough to create it, then
    // disabled again, so a later absence-marking attempt on an actual
    // Saturday date hits "not a school day" via the CURRENT flag.
    await setSaturday(jss2AArmId, true);
    await createSlot({ classArmId: jss2AArmId, sessionId: sunriseSessionId, dayOfWeek: "SATURDAY", periodId: periodBId, subjectId: mathSubjectId, teacherUserId: mathTeacherId });
    await setSaturday(jss2AArmId, false);

    // A student enrolled in jss2A — the class/student-visibility proof.
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-TA/StudentA",
        firstName: "Absence",
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348039000001",
      },
    });
    studentId = student.id;
    createdStudentIds.push(studentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId, classArmId: jss2AArmId, sessionId: sunriseSessionId } });
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2ETASTUDENT", studentId, firstName: "Absence", lastName: "Student", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, "E2ETASTUDENT", "sunrise");
  });

  afterAll(async () => {
    await prisma.timetableException.deleteMany({ where: { classArmId: { in: [jss1AArmId, jss2AArmId] } } });
    await prisma.teacherAbsence.deleteMany({ where: { teacherUserId: { in: [mathTeacherId, englishTeacherId] } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.timetableSlot.deleteMany({ where: { id: { in: createdSlotIds } } });
    await prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
    await prisma.period.deleteMany({ where: { id: { in: createdPeriodIds } } });
    await prisma.classSchoolDays.deleteMany({ where: { classArmId: jss2AArmId } });
    await app.close();
  });

  describe("POST /calendar/teacher-absences", () => {
    it("404s a period/day the caller has no slot at — a real colleague's class they have no field to name", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(mathTeacherToken))
        .send({ date: MONDAY, periodIds: [periodBId], note: "trying to touch englishTeacher's slot" });
      expect(response.status).toBe(404);
    });

    it("404s a Sunday date — structurally, no slot can ever exist on one", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(mathTeacherToken))
        .send({ date: SUNDAY, periodIds: [periodAId], note: "sunday attempt" });
      expect(response.status).toBe(404);
    });

    it("400s a holiday date even though the slot exists for that weekday", async () => {
      const holiday = await request(app.getHttpServer())
        .post("/api/v1/calendar/holidays")
        .set(auth(sunriseAdminToken))
        .send({ sessionId: sunriseSessionId, name: "E2E-TA-Holiday", startDate: NEXT_MONDAY, endDate: NEXT_MONDAY });
      expect(holiday.status).toBe(201);
      createdHolidayIds.push(holiday.body.id);

      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(mathTeacherToken))
        .send({ date: NEXT_MONDAY, periodIds: [periodAId], note: "holiday attempt" });
      expect(response.status).toBe(400);
    });

    it("400s a Saturday date for a class whose Saturday flag is now disabled, even though the slot still exists", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(mathTeacherToken))
        .send({ date: SATURDAY, periodIds: [periodBId], note: "saturday-disabled attempt" });
      expect(response.status).toBe(400);
    });

    it("marks the teacher absent, cancelling exactly this class period — composes on both the teacher's own view and the class/student view", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(mathTeacherToken))
        .send({ date: MONDAY, periodIds: [periodAId], note: "Down with malaria" });
      expect(response.status).toBe(201);
      expect(response.body.periods).toHaveLength(1);
      expect(response.body.note).toBe("Down with malaria");

      const dbCount = await prisma.timetableException.count({ where: { classArmId: jss2AArmId, periodId: periodAId, date: new Date(`${MONDAY}T00:00:00Z`) } });
      expect(dbCount).toBe(1);

      const teacherView = await request(app.getHttpServer()).get("/api/v1/me/teaching-timetable").query({ from: MONDAY, to: MONDAY }).set(auth(mathTeacherToken));
      const teacherMonday = dayFor(teacherView.body, MONDAY);
      const teacherPeriodA = teacherMonday.periods.find((p) => p.periodId === periodAId)!;
      expect(teacherPeriodA.status).toBe("CANCELLED");
      expect(teacherPeriodA.note).toBe("Down with malaria");
      expect(teacherPeriodA.subjectName).toBe("Mathematics"); // original preserved

      const studentView = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: MONDAY, to: MONDAY }).set(auth(studentToken));
      const studentMonday = dayFor(studentView.body, MONDAY);
      const studentPeriodA = studentMonday.periods.find((p) => p.periodId === periodAId)!;
      expect(studentPeriodA.status).toBe("CANCELLED");
      expect(studentPeriodA.subjectName).toBe("Mathematics"); // original preserved
      expect(studentPeriodA.teacherName).toBe("Bola Ogundare"); // original preserved
      expect(studentPeriodA.note).toBeNull(); // never leaked to the student
    });

    it("409s marking the same period/date absent twice, and the DB still has exactly one exception row", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(mathTeacherToken))
        .send({ date: MONDAY, periodIds: [periodAId], note: "second attempt" });
      expect(response.status).toBe(409);

      const dbCount = await prisma.timetableException.count({ where: { classArmId: jss2AArmId, periodId: periodAId, date: new Date(`${MONDAY}T00:00:00Z`) } });
      expect(dbCount).toBe(1);
    });

    it("403s SCHOOL_ADMIN, STUDENT; 401s unauthenticated", async () => {
      const adminAttempt = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(sunriseAdminToken))
        .send({ date: MONDAY, periodIds: [periodAId], note: "x" });
      expect(adminAttempt.status).toBe(403);
      const studentAttempt = await request(app.getHttpServer())
        .post("/api/v1/calendar/teacher-absences")
        .set(auth(studentToken))
        .send({ date: MONDAY, periodIds: [periodAId], note: "x" });
      expect(studentAttempt.status).toBe(403);
      const unauth = await request(app.getHttpServer()).post("/api/v1/calendar/teacher-absences").send({ date: MONDAY, periodIds: [periodAId], note: "x" });
      expect(unauth.status).toBe(401);
    });
  });

  describe("GET /calendar/teacher-absences", () => {
    it("SCHOOL_ADMIN sees the note; TEACHER/STUDENT are forbidden", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/calendar/teacher-absences")
        .query({ from: MONDAY, to: MONDAY })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      const row = response.body.find((r: { teacherUserId: string }) => r.teacherUserId === mathTeacherId);
      expect(row.note).toBe("Down with malaria");
      const period = row.periods.find((p: { periodId: string }) => p.periodId === periodAId);
      expect(period).toBeDefined();
      expect(period.classArmId).toBe(jss2AArmId);
      expect(period.status).toBe("CANCELLED");
      expect(typeof period.exceptionId).toBe("string");
      expect(period.exceptionId.length).toBeGreaterThan(0);

      const teacherAttempt = await request(app.getHttpServer()).get("/api/v1/calendar/teacher-absences").query({ from: MONDAY, to: MONDAY }).set(auth(mathTeacherToken));
      expect(teacherAttempt.status).toBe(403);
      const studentAttempt = await request(app.getHttpServer()).get("/api/v1/calendar/teacher-absences").query({ from: MONDAY, to: MONDAY }).set(auth(studentToken));
      expect(studentAttempt.status).toBe(403);
    });

    it("tenant scoping: Hillcrest's admin list never includes Sunrise's absence", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/calendar/teacher-absences")
        .query({ from: MONDAY, to: MONDAY })
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.some((r: { teacherUserId: string }) => r.teacherUserId === mathTeacherId)).toBe(false);
    });
  });

  describe("PATCH /calendar/timetable-exceptions/:id", () => {
    let exceptionId: string;

    beforeAll(async () => {
      const exception = await prisma.timetableException.findFirstOrThrow({ where: { classArmId: jss2AArmId, periodId: periodAId, date: new Date(`${MONDAY}T00:00:00Z`) } });
      exceptionId = exception.id;
    });

    it("400s a replacement teacher who's already teaching at this exact day+period", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`)
        .set(auth(sunriseAdminToken))
        .send({ replacementTeacherUserId: englishTeacherId });
      expect(response.status).toBe(400);
    });

    it("404s a replacement teacher from a different tenant", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`)
        .set(auth(sunriseAdminToken))
        .send({ replacementTeacherUserId: hillcrestTeacherId });
      expect(response.status).toBe(404);
    });

    it("404s patching an exception id that belongs to a different tenant", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`)
        .set(auth(hillcrestAdminToken))
        .send({ activityLabel: "Prep" });
      expect(response.status).toBe(404);
    });

    it("replaces the cancelled period — the class/student and teacher views now show REPLACED with the replacement teacher + an activity label, original subject/teacher still preserved", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`)
        .set(auth(sunriseAdminToken))
        .send({ replacementTeacherUserId: coverTeacherId, activityLabel: "Prep/Study period" });
      expect(response.status).toBe(200);
      expect(response.body.type).toBe("REPLACED");

      const studentView = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: MONDAY, to: MONDAY }).set(auth(studentToken));
      const studentPeriodA = dayFor(studentView.body, MONDAY).periods.find((p) => p.periodId === periodAId)!;
      expect(studentPeriodA.status).toBe("REPLACED");
      expect(studentPeriodA.replacementTeacherName).toBe("Ahmed Suleiman");
      expect(studentPeriodA.activityLabel).toBe("Prep/Study period");
      expect(studentPeriodA.subjectName).toBe("Mathematics"); // original preserved
      expect(studentPeriodA.teacherName).toBe("Bola Ogundare"); // original preserved
      expect(studentPeriodA.note).toBeNull();

      const teacherView = await request(app.getHttpServer()).get("/api/v1/me/teaching-timetable").query({ from: MONDAY, to: MONDAY }).set(auth(mathTeacherToken));
      const teacherPeriodA = dayFor(teacherView.body, MONDAY).periods.find((p) => p.periodId === periodAId)!;
      expect(teacherPeriodA.status).toBe("REPLACED");
      expect(teacherPeriodA.note).toBe("Down with malaria");
    });

    it("reverts back to CANCELLED when every replacement field is nulled — no DELETE endpoint exists for this", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`)
        .set(auth(sunriseAdminToken))
        .send({ replacementTeacherUserId: null, replacementSubjectId: null, activityLabel: null });
      expect(response.status).toBe(200);
      expect(response.body.type).toBe("CANCELLED_TEACHER_ABSENT");
      expect(response.body.replacementTeacherUserId).toBeNull();

      const studentView = await request(app.getHttpServer()).get("/api/v1/me/timetable").query({ from: MONDAY, to: MONDAY }).set(auth(studentToken));
      const studentPeriodA = dayFor(studentView.body, MONDAY).periods.find((p) => p.periodId === periodAId)!;
      expect(studentPeriodA.status).toBe("CANCELLED");
      expect(studentPeriodA.replacementTeacherName).toBeNull();
    });

    it("403s TEACHER, STUDENT; 401s unauthenticated", async () => {
      const teacherAttempt = await request(app.getHttpServer()).patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`).set(auth(mathTeacherToken)).send({ activityLabel: "x" });
      expect(teacherAttempt.status).toBe(403);
      const studentAttempt = await request(app.getHttpServer()).patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`).set(auth(studentToken)).send({ activityLabel: "x" });
      expect(studentAttempt.status).toBe(403);
      const unauth = await request(app.getHttpServer()).patch(`/api/v1/calendar/timetable-exceptions/${exceptionId}`).send({ activityLabel: "x" });
      expect(unauth.status).toBe(401);
    });
  });
});
