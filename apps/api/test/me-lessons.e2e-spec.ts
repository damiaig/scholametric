import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { pastWeekday } from "./utils/future-date";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.8.4 step 2 (SPEC_V0.8.4.md §4.2) — the first STUDENT/PARENT read
// access to lessons. Reuses the SAME JSS 1 A Mathematics assignment
// (teacher@sunrise.test) step 1's own lesson.e2e-spec.ts already relies
// on. Lesson has ZERO per-student state (no mark-done, no submissions),
// so unlike me-homework.e2e-spec.ts there is no "shows the caller's own
// X, never a classmate's" test — there is no per-caller X to leak.
describe("Student + parent lesson views (e2e) — SPEC_V0.8.4.md §4.2, v0.8.4 step 2", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let mathTeacherToken: string;
  let studentToken: string;
  let otherClassStudentToken: string;
  let parentToken: string;
  let notLinkedParentToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let mathSubjectId: string;
  let studentId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // Same weekday (Monday), different weeksAgo — guarantees EARLIER_LESSON_DATE
  // is exactly 7 days before VALID_LESSON_DATE, unambiguously. (Two
  // DIFFERENT weekdays, e.g. Monday vs. Tuesday, do NOT reliably order
  // this way: pastWeekday snaps each to ITS OWN most-recent occurrence
  // before subtracting weeksAgo*7, so which weekday lands "more recent"
  // depends on where today falls in the week — not a fixed relationship.)
  const VALID_LESSON_DATE = pastWeekday(1, 5);
  const EARLIER_LESSON_DATE = pastWeekday(1, 6);

  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdLessonIds: string[] = [];

  function createLesson(token: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post("/api/v1/lessons")
      .set(auth(token))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        title: "Fractions — introduction",
        body: "Covered the definition of a fraction and simple addition.",
        lessonDate: VALID_LESSON_DATE,
        ...overrides,
      });
  }

  async function createPublishedAndTrack(token: string, overrides: Partial<Record<string, unknown>> = {}): Promise<string> {
    const created = await createLesson(token, overrides);
    if (created.status !== 201) {
      throw new Error(`lesson creation failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    createdLessonIds.push(created.body.id);
    const published = await request(app.getHttpServer()).post(`/api/v1/lessons/${created.body.id}/publish`).set(auth(token));
    if (published.status !== 200) {
      throw new Error(`lesson publish failed: ${published.status} ${JSON.stringify(published.body)}`);
    }
    return created.body.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);

    // The student whose class is jss1AArmId — the main character below.
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-MELESSON/Student",
        firstName: "Chidinma",
        lastName: "Eze",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000021",
      },
    });
    studentId = student.id;
    createdStudentIds.push(studentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId, classArmId: jss1AArmId, sessionId: sunriseSessionId } });
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2EMELESSONSTUDENT", studentId, firstName: "Chidinma", lastName: "Eze", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, "E2EMELESSONSTUDENT", "sunrise");

    // A second student in a DIFFERENT class (jss2A) — the own-class wall.
    const otherClassStudent = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-MELESSON/OtherClass",
        firstName: "Tunde",
        lastName: "Bello",
        gender: Gender.MALE,
        dateOfBirth: new Date("2011-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000022",
      },
    });
    createdStudentIds.push(otherClassStudent.id);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: otherClassStudent.id, classArmId: jss2AArmId, sessionId: sunriseSessionId } });
    const otherClassStudentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2EMELESSONOTHERCLASS", studentId: otherClassStudent.id, firstName: "Tunde", lastName: "Bello", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(otherClassStudentUser.id);
    otherClassStudentToken = await loginAs(app, "E2EMELESSONOTHERCLASS", "sunrise");

    // A guardian linked to `student` — the parent's own-child wall.
    const guardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "Ngozi", lastName: "Eze", phone: "+2348050000023" } });
    createdGuardianIds.push(guardian.id);
    await prisma.studentGuardian.create({ data: { schoolId: sunriseId, studentId, guardianId: guardian.id, relationship: "MOTHER", isPrimary: true } });
    const parentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: "E2EMELESSONPARENT", guardianId: guardian.id, firstName: "Ngozi", lastName: "Eze", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(parentUser.id);
    parentToken = await loginAs(app, "E2EMELESSONPARENT", "sunrise");

    // A SEPARATE guardian, linked to nobody relevant — the "not my child" 404.
    const notLinkedGuardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "Unrelated", lastName: "Parent", phone: "+2348050000024" } });
    createdGuardianIds.push(notLinkedGuardian.id);
    const notLinkedParentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: "E2EMELESSONNOTLINKED", guardianId: notLinkedGuardian.id, firstName: "Unrelated", lastName: "Parent", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(notLinkedParentUser.id);
    notLinkedParentToken = await loginAs(app, "E2EMELESSONNOTLINKED", "sunrise");
    // No local TimetableSlot fixture needed — seed.ts itself seeds
    // teacher@sunrise.test teaching jss1AArmId Mathematics on Mon/Tue/Thu/Fri
    // (v0.8.3 Item 4 rework), and VALID_LESSON_DATE/EARLIER_LESSON_DATE are
    // always past Mondays.
  });

  afterAll(async () => {
    if (createdLessonIds.length > 0) {
      await prisma.lesson.deleteMany({ where: { id: { in: createdLessonIds } } });
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await app.close();
  });

  describe("GET /me/lessons (STUDENT)", () => {
    it("sees only PUBLISHED lessons in their own class, newest lessonDate first", async () => {
      const earlierId = await createPublishedAndTrack(mathTeacherToken, { lessonDate: EARLIER_LESSON_DATE, title: "Earlier lesson" });
      const laterId = await createPublishedAndTrack(mathTeacherToken, { lessonDate: VALID_LESSON_DATE, title: "Later lesson" });

      const draft = await createLesson(mathTeacherToken, { title: "Never published" });
      if (draft.status !== 201) throw new Error(`draft creation failed: ${draft.status}`);
      createdLessonIds.push(draft.body.id);

      const response = await request(app.getHttpServer()).get("/api/v1/me/lessons").set(auth(studentToken));
      expect(response.status).toBe(200);
      const ids = response.body.lessons.map((l: { id: string }) => l.id);
      expect(ids).toContain(earlierId);
      expect(ids).toContain(laterId);
      expect(ids).not.toContain(draft.body.id);
      expect(ids.indexOf(laterId)).toBeLessThan(ids.indexOf(earlierId));
    });

    it("a DRAFT lesson never appears, even to the class it belongs to", async () => {
      const draft = await createLesson(mathTeacherToken, { title: "Still drafting" });
      if (draft.status !== 201) throw new Error(`draft creation failed: ${draft.status}`);
      createdLessonIds.push(draft.body.id);

      const response = await request(app.getHttpServer()).get("/api/v1/me/lessons").set(auth(studentToken));
      expect(response.body.lessons.some((l: { id: string }) => l.id === draft.body.id)).toBe(false);
    });

    // No classArmId param exists on this route at all — a lesson from a
    // different class is simply never in the response (silent exclusion,
    // 200), not a 404. The literal 404 case for this domain is the
    // parent's non-linked-child wall, tested below.
    it("a student in a different class never sees this class's lessons", async () => {
      const publishedId = await createPublishedAndTrack(mathTeacherToken);

      const response = await request(app.getHttpServer()).get("/api/v1/me/lessons").set(auth(otherClassStudentToken));
      expect(response.body.lessons.some((l: { id: string }) => l.id === publishedId)).toBe(false);
    });
  });

  describe("GET /me/children/:childId/lessons (PARENT)", () => {
    it("sees the same PUBLISHED lessons for a linked child", async () => {
      const publishedId = await createPublishedAndTrack(mathTeacherToken);

      const response = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/lessons`).set(auth(parentToken));
      expect(response.status).toBe(200);
      expect(response.body.lessons.some((l: { id: string }) => l.id === publishedId)).toBe(true);
    });

    it("404s a parent with no link to this student — the own-child wall, not a new path", async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/lessons`).set(auth(notLinkedParentToken));
      expect(response.status).toBe(404);
    });

    it("403s a STUDENT calling the PARENT route, and vice versa", async () => {
      const asStudent = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/lessons`).set(auth(studentToken));
      expect(asStudent.status).toBe(403);
      const asParent = await request(app.getHttpServer()).get("/api/v1/me/lessons").set(auth(parentToken));
      expect(asParent.status).toBe(403);
    });
  });
});
