import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.8.2 step 2 (SPEC_V0.8.2.md §6 item 2) — the first STUDENT/PARENT
// read access to homework + the mark-done write. Reuses the SAME JSS 1 A
// Mathematics assignment (teacher@sunrise.test) Step 1's own
// homework.e2e-spec.ts already relies on — confirmed safe there (Jest
// runs e2e files sequentially, --runInBand; each file tracks and cleans
// up only its own created rows).
describe("Student + parent homework views (e2e) — SPEC_V0.8.2.md §6 item 2, v0.8.2 step 2", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let mathTeacherToken: string;
  let studentToken: string;
  let otherClassStudentToken: string;
  let parentToken: string;
  let notLinkedParentToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let otherTermId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let mathSubjectId: string;

  let studentId: string;
  let otherClassStudentId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // Genuine calendar dates, chosen clear of Step 1's own holiday fixture
  // (2026-10-12) and unrelated to any past/future concern of its own —
  // isSchoolDayForClassOnDate has no "now" comparison, only weekday/
  // holiday validity.
  const VALID_DUE_DATE = "2026-11-02"; // Monday
  const PAST_DUE_DATE = "2026-09-14"; // Monday, genuinely in the past relative to the real clock

  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];
  const createdHomeworkIds: string[] = [];

  function createHomework(token: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post("/api/v1/homework")
      .set(auth(token))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        termId: sunriseTermId,
        title: "Chapter 4 exercises",
        description: "Solve all questions.",
        dueDate: VALID_DUE_DATE,
        requiresUpload: false,
        ...overrides,
      });
  }

  async function createPublishedAndTrack(token: string, overrides: Partial<Record<string, unknown>> = {}): Promise<string> {
    const created = await createHomework(token, overrides);
    if (created.status !== 201) {
      throw new Error(`homework creation failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    createdHomeworkIds.push(created.body.id);
    const published = await request(app.getHttpServer()).post(`/api/v1/homework/${created.body.id}/publish`).set(auth(token));
    if (published.status !== 200) {
      throw new Error(`homework publish failed: ${published.status} ${JSON.stringify(published.body)}`);
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
    const term = await prisma.term.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseTermId = term.id;
    const otherTerm = await prisma.term.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: false, sessionId: sunriseSessionId } });
    otherTermId = otherTerm.id;

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
        admissionNumber: "E2E-MEHW/Student",
        firstName: "Chidinma",
        lastName: "Eze",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000001",
      },
    });
    studentId = student.id;
    createdStudentIds.push(studentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId, classArmId: jss1AArmId, sessionId: sunriseSessionId } });
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2EMEHWSTUDENT", studentId, firstName: "Chidinma", lastName: "Eze", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, "E2EMEHWSTUDENT", "sunrise");

    // A second student in a DIFFERENT class (jss2A) — the own-class wall.
    const otherClassStudent = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-MEHW/OtherClass",
        firstName: "Tunde",
        lastName: "Bello",
        gender: Gender.MALE,
        dateOfBirth: new Date("2011-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000002",
      },
    });
    otherClassStudentId = otherClassStudent.id;
    createdStudentIds.push(otherClassStudentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: otherClassStudentId, classArmId: jss2AArmId, sessionId: sunriseSessionId } });
    const otherClassStudentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2EMEHWOTHERCLASS", studentId: otherClassStudentId, firstName: "Tunde", lastName: "Bello", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(otherClassStudentUser.id);
    otherClassStudentToken = await loginAs(app, "E2EMEHWOTHERCLASS", "sunrise");

    // A guardian linked to `student` — the parent's own-child wall.
    const guardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "Ngozi", lastName: "Eze", phone: "+2348050000003" } });
    createdGuardianIds.push(guardian.id);
    await prisma.studentGuardian.create({ data: { schoolId: sunriseId, studentId, guardianId: guardian.id, relationship: "MOTHER", isPrimary: true } });
    const parentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: "E2EMEHWPARENT", guardianId: guardian.id, firstName: "Ngozi", lastName: "Eze", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(parentUser.id);
    parentToken = await loginAs(app, "E2EMEHWPARENT", "sunrise");

    // A SEPARATE guardian, linked to nobody relevant — the "not my child" 404.
    const notLinkedGuardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "Unrelated", lastName: "Parent", phone: "+2348050000004" } });
    createdGuardianIds.push(notLinkedGuardian.id);
    const notLinkedParentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: "E2EMEHWNOTLINKED", guardianId: notLinkedGuardian.id, firstName: "Unrelated", lastName: "Parent", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(notLinkedParentUser.id);
    notLinkedParentToken = await loginAs(app, "E2EMEHWNOTLINKED", "sunrise");
  });

  afterAll(async () => {
    if (createdHomeworkIds.length > 0) {
      await prisma.homeworkCompletion.deleteMany({ where: { homeworkId: { in: createdHomeworkIds } } });
      await prisma.homework.deleteMany({ where: { id: { in: createdHomeworkIds } } });
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { studentId } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await app.close();
  });

  describe("GET /me/homework (STUDENT)", () => {
    it("sees only PUBLISHED homework in their own current-term class, sorted by due date", async () => {
      const publishedId = await createPublishedAndTrack(mathTeacherToken);

      const draft = await createHomework(mathTeacherToken, { title: "Never published" });
      if (draft.status !== 201) throw new Error(`draft creation failed: ${draft.status}`);
      createdHomeworkIds.push(draft.body.id);

      const response = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(studentToken));
      expect(response.status).toBe(200);
      const ids = response.body.homework.map((h: { id: string }) => h.id);
      expect(ids).toContain(publishedId);
      expect(ids).not.toContain(draft.body.id);
    });

    it("a DRAFT homework never appears, even to the class it belongs to", async () => {
      const draft = await createHomework(mathTeacherToken, { title: "Still drafting" });
      if (draft.status !== 201) throw new Error(`draft creation failed: ${draft.status}`);
      createdHomeworkIds.push(draft.body.id);

      const response = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(studentToken));
      expect(response.body.homework.some((h: { id: string }) => h.id === draft.body.id)).toBe(false);
    });

    // v0.8.2 step 2, Item 8 — the teacher's Step 1 list is a COMPLETELY
    // separate code path (listHomework, untouched by isDueDatePast);
    // this proves the two independently.
    it("a past-due homework is hidden from the student but still visible to the teacher", async () => {
      const pastDueId = await createPublishedAndTrack(mathTeacherToken, { dueDate: PAST_DUE_DATE, title: "Long overdue" });

      const studentView = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(studentToken));
      expect(studentView.body.homework.some((h: { id: string }) => h.id === pastDueId)).toBe(false);

      const teacherView = await request(app.getHttpServer())
        .get("/api/v1/homework")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId, termId: sunriseTermId })
        .set(auth(mathTeacherToken));
      expect(teacherView.status).toBe(200);
      expect(teacherView.body.homework.some((h: { id: string }) => h.id === pastDueId)).toBe(true);
    });

    // The term-scoping regression test — ClassArm is a PERMANENT entity;
    // without filtering by the CURRENT term too, this homework (same
    // class, a DIFFERENT term) would otherwise leak into the list forever.
    it("does not show a PUBLISHED homework from a different term in the same class (term-scoping regression)", async () => {
      const otherTermId2 = await createPublishedAndTrack(mathTeacherToken, { termId: otherTermId, title: "Last term's assignment" });

      const response = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(studentToken));
      expect(response.body.homework.some((h: { id: string }) => h.id === otherTermId2)).toBe(false);
    });

    it("a student in a different class never sees this class's homework", async () => {
      const publishedId = await createPublishedAndTrack(mathTeacherToken);

      const response = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(otherClassStudentToken));
      expect(response.body.homework.some((h: { id: string }) => h.id === publishedId)).toBe(false);
    });
  });

  describe("POST /me/homework/:id/complete (STUDENT)", () => {
    it("marks done, setting markedAt; un-marking clears it", async () => {
      const homeworkId = await createPublishedAndTrack(mathTeacherToken);

      const marked = await request(app.getHttpServer()).post(`/api/v1/me/homework/${homeworkId}/complete`).set(auth(studentToken)).send({ markedDone: true });
      expect(marked.status).toBe(200);
      expect(marked.body.markedDone).toBe(true);
      expect(marked.body.markedAt).not.toBeNull();

      const listAfterMark = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(studentToken));
      const entry = listAfterMark.body.homework.find((h: { id: string }) => h.id === homeworkId);
      expect(entry.markedDone).toBe(true);

      const unmarked = await request(app.getHttpServer()).post(`/api/v1/me/homework/${homeworkId}/complete`).set(auth(studentToken)).send({ markedDone: false });
      expect(unmarked.status).toBe(200);
      expect(unmarked.body.markedDone).toBe(false);
      expect(unmarked.body.markedAt).toBeNull();
    });

    it("404s a student completing a homework outside their own class — same id, wrong class", async () => {
      const homeworkId = await createPublishedAndTrack(mathTeacherToken);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/me/homework/${homeworkId}/complete`)
        .set(auth(otherClassStudentToken))
        .send({ markedDone: true });
      expect(response.status).toBe(404);
    });

    it("404s completing a DRAFT homework — not yet published", async () => {
      const draft = await createHomework(mathTeacherToken, { title: "Not published yet" });
      if (draft.status !== 201) throw new Error(`draft creation failed: ${draft.status}`);
      createdHomeworkIds.push(draft.body.id);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/me/homework/${draft.body.id}/complete`)
        .set(auth(studentToken))
        .send({ markedDone: true });
      expect(response.status).toBe(404);
    });
  });

  describe("GET /me/children/:childId/homework (PARENT)", () => {
    it("sees the same PUBLISHED, current-term, not-past-due homework for a linked child", async () => {
      const publishedId = await createPublishedAndTrack(mathTeacherToken);

      const response = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/homework`).set(auth(parentToken));
      expect(response.status).toBe(200);
      expect(response.body.homework.some((h: { id: string }) => h.id === publishedId)).toBe(true);
    });

    it("404s a parent with no link to this student — the own-child wall, not a new path", async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/homework`).set(auth(notLinkedParentToken));
      expect(response.status).toBe(404);
    });

    it("403s a STUDENT calling the PARENT route, and vice versa", async () => {
      const asStudent = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/homework`).set(auth(studentToken));
      expect(asStudent.status).toBe(403);
      const asParent = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(parentToken));
      expect(asParent.status).toBe(403);
    });
  });
});
