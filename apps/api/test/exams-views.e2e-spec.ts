import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, GuardianRelationship, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 3 (SPEC_V0.7.md §4): the two exam read views — the per-term
// "Show exams" button (GET .../exams) and the whole-year Exams view
// (GET .../year-exams) — reused across staff (/students/:id/*), STUDENT
// (/me/*), and PARENT (/me/children/:childId/*). The centerpiece: the
// published-only wall must hold on EVERY self-view route, mirroring
// GET /students/:id/report-card's own filter (status: PUBLISHED in the
// Prisma where clause, never a post-fetch filter) — proven here by
// showing the exact same underlying data through a staff route (visible)
// and a self-view route (invisible) side by side.
describe("Exam views (e2e) — SPEC_V0.7.md §4, step 3", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let classArmId: string;
  let sessionId: string;
  let termFirstId: string;
  let termSecondId: string;
  let mathTeacherId: string;

  let publishedSubjectId: string; // scored + published in term FIRST
  let draftSubjectId: string; // scored, never published, term FIRST

  let studentId: string;
  let studentToken: string;
  let parentToken: string;

  const createdSessionIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdClassArmIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const SEED_PASSWORD = "Passw0rd!";

  async function createExam(subjectId: string, termId: string, name: string): Promise<string> {
    const exam = await prisma.exam.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name, createdBy: mathTeacherId },
    });
    return exam.id;
  }

  async function scoreAndMaybePublish(subjectId: string, examId: string, termId: string, rawScore: number, publish: boolean) {
    const saveRes = await request(app.getHttpServer())
      .put("/api/v1/exams/scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId, examId, termId, scores: [{ studentId, rawScore }] });
    if (saveRes.status !== 200) throw new Error(`score failed: ${saveRes.status} ${JSON.stringify(saveRes.body)}`);
    if (publish) {
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId, subjectId, termId });
      if (publishRes.status !== 200) throw new Error(`publish failed: ${publishRes.status} ${JSON.stringify(publishRes.body)}`);
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    mathTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-ExamViews-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-09-01"), isCurrent: false },
    });
    sessionId = session.id;
    createdSessionIds.push(sessionId);

    const termFirst = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId, name: "FIRST", startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01") },
    });
    termFirstId = termFirst.id;
    const termSecond = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId, name: "SECOND", startsOn: new Date("2027-05-01"), endsOn: new Date("2027-08-01") },
    });
    termSecondId = termSecond.id;
    createdTermIds.push(termFirstId, termSecondId);

    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    const classArm = await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-ExamViews-${stamp}` } });
    classArmId = classArm.id;
    createdClassArmIds.push(classArmId);

    const publishedSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E ExamViews Published ${stamp}`, code: `XVP${stamp.slice(-5)}`.slice(0, 10).toUpperCase() },
    });
    publishedSubjectId = publishedSubject.id;
    const draftSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E ExamViews Draft ${stamp}`, code: `XVD${stamp.slice(-5)}`.slice(0, 10).toUpperCase() },
    });
    draftSubjectId = draftSubject.id;
    createdSubjectIds.push(publishedSubjectId, draftSubjectId);

    for (const subjectId of [publishedSubjectId, draftSubjectId]) {
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId, classArmId, sessionId, teacherUserId: mathTeacherId },
      });
    }

    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-XV/${stamp}`,
        firstName: "ExamViews",
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-03-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348034000000",
      },
    });
    studentId = student.id;
    createdStudentIds.push(studentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId, classArmId, sessionId } });

    // FIRST term: draftSubject scored FIRST (so its term_subject_exam_result
    // row exists BEFORE publishedSubject's publish() cascades upward —
    // recomputeExamOverallForClassArm only sees whatever rows already
    // exist at the moment it runs; scoring order here is what makes the
    // term-level aggregate correctly stay DRAFT, not a quirk to work
    // around). publishedSubject scored+published second.
    const draftExamFirst = await createExam(draftSubjectId, termFirstId, "Draft Subject Exam");
    await scoreAndMaybePublish(draftSubjectId, draftExamFirst, termFirstId, 40, false);
    const publishedExamFirst = await createExam(publishedSubjectId, termFirstId, "Term 1 Exam");
    await scoreAndMaybePublish(publishedSubjectId, publishedExamFirst, termFirstId, 82, true);

    // SECOND term: publishedSubject scored but left DRAFT (this term never publishes) —
    // proves a "partially published year" shows term FIRST but not term SECOND.
    const examSecond = await createExam(publishedSubjectId, termSecondId, "Term 2 Exam");
    await scoreAndMaybePublish(publishedSubjectId, examSecond, termSecondId, 55, false);

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: `E2EXV${stamp}`.slice(0, 20).toUpperCase(), studentId, firstName: "ExamViews", lastName: "Student", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, studentUser.username!, "sunrise");

    const guardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "ExamViews", lastName: "Guardian", phone: "+2348034000001" } });
    createdGuardianIds.push(guardian.id);
    await prisma.studentGuardian.create({ data: { schoolId: sunriseId, studentId, guardianId: guardian.id, relationship: GuardianRelationship.OTHER, isPrimary: true } });
    const parentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: `E2EXVP${stamp}`.slice(0, 20).toUpperCase(), guardianId: guardian.id, firstName: "ExamViews", lastName: "Parent", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(parentUser.id);
    parentToken = await loginAs(app, parentUser.username!, "sunrise");
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { guardianId: { in: createdGuardianIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    const exams = await prisma.exam.findMany({ where: { subjectId: { in: createdSubjectIds } }, select: { id: true } });
    await prisma.examScore.deleteMany({ where: { examId: { in: exams.map((e) => e.id) } } });
    await prisma.exam.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termExamResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.yearExamResult.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  describe("GET /students/:id/exams (staff)", () => {
    it("shows the published subject's exam breakdown and average", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toHaveLength(1);
      expect(response.body.exams[0].rawScore).toBe(82);
      expect(response.body.subjectExamAverage).toBe(82);
      expect(response.body.status).toBe("PUBLISHED");
    });

    it("also shows the DRAFT (never-published) subject's real data to staff", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: draftSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toHaveLength(1);
      expect(response.body.exams[0].rawScore).toBe(40);
      expect(response.body.status).toBe("DRAFT");
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId });
      expect(response.status).toBe(401);
    });
  });

  describe("Published-only wall — /me/exams and /me/children/:childId/exams", () => {
    it("STUDENT sees the published subject's real data", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/exams")
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(studentToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toHaveLength(1);
      expect(response.body.exams[0].rawScore).toBe(82);
      expect(response.body.subjectExamAverage).toBe(82);
      expect(response.body.status).toBe("PUBLISHED");
    });

    it("STUDENT sees NOTHING for the unpublished subject — indistinguishable from never-entered", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/exams")
        .query({ subjectId: draftSubjectId, termId: termFirstId, sessionId })
        .set(auth(studentToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toEqual([]);
      expect(response.body.subjectExamAverage).toBeNull();
      expect(response.body.subjectExamGrade).toBeNull();
      expect(response.body.status).toBeNull();
    });

    it("PARENT sees the same published/unpublished split for their child", async () => {
      const publishedRes = await request(app.getHttpServer())
        .get("/api/v1/me/children")
        .set(auth(parentToken));
      expect(publishedRes.status).toBe(200);
      const childId = publishedRes.body.children[0].studentId;
      expect(childId).toBe(studentId);

      const published = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${childId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(parentToken));
      expect(published.status).toBe(200);
      expect(published.body.exams).toHaveLength(1);
      expect(published.body.status).toBe("PUBLISHED");

      const draft = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${childId}/exams`)
        .query({ subjectId: draftSubjectId, termId: termFirstId, sessionId })
        .set(auth(parentToken));
      expect(draft.status).toBe(200);
      expect(draft.body.exams).toEqual([]);
      expect(draft.body.status).toBeNull();
    });

    it("rejects unauthenticated requests on both self-view routes", async () => {
      const a = await request(app.getHttpServer())
        .get("/api/v1/me/exams")
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId });
      expect(a.status).toBe(401);

      const b = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId });
      expect(b.status).toBe(401);
    });
  });

  describe("GET /students/:id/year-exams (staff) — the whole-year, partial-year case", () => {
    it("shows term FIRST's published subject, term FIRST's draft subject, and term SECOND's draft data — all real, staff sees everything", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/year-exams`)
        .query({ sessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);

      const termFirst = response.body.terms.find((t: { termId: string }) => t.termId === termFirstId);
      const termSecond = response.body.terms.find((t: { termId: string }) => t.termId === termSecondId);
      expect(termFirst.subjects).toHaveLength(2);
      expect(termFirst.subjects.find((s: { subjectId: string }) => s.subjectId === publishedSubjectId).subjectExamAverage).toBe(82);
      expect(termFirst.subjects.find((s: { subjectId: string }) => s.subjectId === draftSubjectId).subjectExamAverage).toBe(40);

      expect(termSecond.subjects).toHaveLength(1);
      expect(termSecond.subjects[0].subjectExamAverage).toBe(55);
      expect(termSecond.status).toBeNull(); // term-level aggregate never recomputed for a still-all-draft term
    });
  });

  describe("Published-only wall — /me/year-exams and /me/children/:childId/year-exams (partial year)", () => {
    it("STUDENT sees term FIRST's published subject only — the draft subject in term FIRST and all of term SECOND are invisible", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/year-exams")
        .query({ sessionId })
        .set(auth(studentToken));
      expect(response.status).toBe(200);

      const termFirst = response.body.terms.find((t: { termId: string }) => t.termId === termFirstId);
      const termSecond = response.body.terms.find((t: { termId: string }) => t.termId === termSecondId);

      expect(termFirst.subjects).toHaveLength(1);
      expect(termFirst.subjects[0].subjectId).toBe(publishedSubjectId);
      expect(termFirst.subjects[0].subjectExamAverage).toBe(82);
      // Term FIRST's own cross-subject aggregate never published either
      // (draftSubjectId never published this term) — null, not a number.
      expect(termFirst.termExamAverage).toBeNull();
      expect(termFirst.status).toBeNull();

      // Term SECOND has nothing published at all — empty, not an error.
      expect(termSecond.subjects).toEqual([]);
      expect(termSecond.termExamAverage).toBeNull();
      expect(termSecond.status).toBeNull();

      // No term this session has ever been fully exam-published -> no year_exam_results row exists yet.
      expect(response.body.overallExamAverage).toBeNull();
      expect(response.body.yearExamPosition).toBeNull();
      expect(response.body.overallStatus).toBeNull();
    });

    it("PARENT sees the identical partial-year picture for their child", async () => {
      const childrenRes = await request(app.getHttpServer()).get("/api/v1/me/children").set(auth(parentToken));
      const childId = childrenRes.body.children[0].studentId;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${childId}/year-exams`)
        .query({ sessionId })
        .set(auth(parentToken));
      expect(response.status).toBe(200);
      const termFirst = response.body.terms.find((t: { termId: string }) => t.termId === termFirstId);
      expect(termFirst.subjects).toHaveLength(1);
      expect(termFirst.subjects[0].subjectId).toBe(publishedSubjectId);
    });

    it("rejects unauthenticated requests on both self-view routes", async () => {
      const a = await request(app.getHttpServer()).get("/api/v1/me/year-exams").query({ sessionId });
      expect(a.status).toBe(401);

      const b = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/year-exams`).query({ sessionId });
      expect(b.status).toBe(401);
    });
  });

  describe("TEACHER read access (any relationship to the class arm, mirroring getReportCard)", () => {
    it("the assigned subject teacher can read both views for this student", async () => {
      const a = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseTeacherToken));
      expect(a.status).toBe(200);

      const b = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/year-exams`)
        .query({ sessionId })
        .set(auth(sunriseTeacherToken));
      expect(b.status).toBe(200);
    });
  });
});
