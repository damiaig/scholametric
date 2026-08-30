import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 1 (SPEC_V0.7.md §2/§5) — POST /exams/publish and
// /exams/unpublish: same publish model as v0.4/the evaluation track
// (confirmed), applied to Track B. No subjectPosition/override at this
// level (term_subject_exam_results has neither field — Q6 ranks only at
// the per-term/whole-year levels, see exam-rankings.e2e-spec.ts).
describe("Exam publish/unpublish (e2e) — SPEC_V0.7.md §2/§5, step 1", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let jss2LevelId: string;
  let teacherUserId: string;

  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestTermId: string;

  const createdSessionIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdClassArmIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  interface ScratchBundle {
    sessionId: string;
    termId: string;
    classArmId: string;
    subjectId: string;
    studentIds: string[];
  }

  async function createExamFor(subjectId: string, classArmId: string, sessionId: string, termId: string, name = "Exam"): Promise<string> {
    const exam = await prisma.exam.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name, createdBy: teacherUserId },
    });
    return exam.id;
  }

  async function createScratchBundle(prefix: string, studentCount = 2): Promise<ScratchBundle> {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-ExPub-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-ExPub-${stamp}` },
    });
    createdClassArmIds.push(classArm.id);
    const subject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E ExPub ${stamp}`, code: `EP${stamp.slice(-6)}`.slice(0, 10).toUpperCase() },
    });
    createdSubjectIds.push(subject.id);
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: subject.id, classArmId: classArm.id, sessionId: session.id, teacherUserId },
    });

    const studentIds: string[] = [];
    for (let i = 0; i < studentCount; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-EXPUB/${stamp}/${i}`,
          firstName: "ExPub",
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348035${String(Date.now() + i).slice(-6)}`,
        },
      });
      createdStudentIds.push(student.id);
      await prisma.studentEnrollment.create({
        data: { schoolId: sunriseId, studentId: student.id, classArmId: classArm.id, sessionId: session.id },
      });
      studentIds.push(student.id);
    }

    return { sessionId: session.id, termId: term.id, classArmId: classArm.id, subjectId: subject.id, studentIds };
  }

  async function scoreExam(bundle: ScratchBundle, examId: string, scores: { studentId: string; rawScore?: number | null; isAbsent?: boolean }[]) {
    const response = await request(app.getHttpServer())
      .put("/api/v1/exams/scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, examId, termId: bundle.termId, scores });
    if (response.status !== 200) throw new Error(`scoreExam failed: ${response.status} ${JSON.stringify(response.body)}`);
    return response;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;
    teacherUserId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrest.id, isCurrent: true } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrest.id, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrest.id, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrest.id, name: "Mathematics" } })).id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;
  });

  afterAll(async () => {
    await prisma.examScore.deleteMany({ where: { exam: { subjectId: { in: createdSubjectIds } } } });
    await prisma.exam.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termExamResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.yearExamResult.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  describe("POST /exams/publish", () => {
    it("happy path: transitions DRAFT rows to PUBLISHED and cascades into term_exam_results", async () => {
      const bundle = await createScratchBundle("Happy");
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [
        { studentId: bundle.studentIds[0], rawScore: 80 },
        { studentId: bundle.studentIds[1], rawScore: 60 },
      ]);

      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(response.status).toBe(200);
      expect(response.body.publishedCount).toBe(2);

      const rows = await prisma.termSubjectExamResult.findMany({ where: { subjectId: bundle.subjectId } });
      for (const row of rows) {
        expect(row.status).toBe("PUBLISHED");
        expect(row.publishedAt).not.toBeNull();
      }

      const termExamResults = await prisma.termExamResult.findMany({ where: { termId: bundle.termId } });
      expect(termExamResults).toHaveLength(2);
      const byStudent = new Map(termExamResults.map((r) => [r.studentId, r]));
      expect(byStudent.get(bundle.studentIds[0])?.examPosition).toBe(1);
      expect(byStudent.get(bundle.studentIds[1])?.examPosition).toBe(2);
    });

    it("409s with nothing to do (no scores entered)", async () => {
      const bundle = await createScratchBundle("Empty");
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to publish/i);
    });

    it("completeness gate: blocks the whole publish when one exam is blank, naming the exact student+exam", async () => {
      const bundle = await createScratchBundle("Completeness");
      const examA = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId, "Exam A");
      const examB = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId, "Exam B");
      const [complete, incomplete] = bundle.studentIds;
      await scoreExam(bundle, examA, [{ studentId: complete, rawScore: 50 }, { studentId: incomplete, rawScore: 40 }]);
      await scoreExam(bundle, examB, [{ studentId: complete, rawScore: 60 }]); // incomplete's examB left blank

      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(response.status).toBe(409);
      expect(response.body.incompleteEntries).toEqual([{ studentId: incomplete, examId: examB }]);

      const completeRow = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: complete, subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(completeRow.status).toBe("DRAFT"); // atomic — not transitioned just because a batch-mate was blank
    });

    it("403s a TEACHER; rejects unauthenticated; 404s cross-tenant", async () => {
      const bundle = await createScratchBundle("Rbac");
      const teacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
      const teacherAttempt = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(teacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(teacherAttempt.status).toBe(403);

      const unauth = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(unauth.status).toBe(401);

      const crossTenant = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(hillcrestAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(crossTenant.status).toBe(404);
    });
  });

  describe("POST /exams/unpublish", () => {
    it("happy path (PROPRIETOR): reverts to DRAFT; SCHOOL_ADMIN 403s", async () => {
      const bundle = await createScratchBundle("Unpublish", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(publishRes.status).toBe(200);

      const adminAttempt = await request(app.getHttpServer())
        .post("/api/v1/exams/unpublish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(adminAttempt.status).toBe(403);

      const unpublishRes = await request(app.getHttpServer())
        .post("/api/v1/exams/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(unpublishRes.status).toBe(200);
      expect(unpublishRes.body.unpublishedCount).toBe(1);

      const reverted = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: bundle.studentIds[0], subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(reverted.status).toBe("DRAFT");
      expect(reverted.publishedAt).toBeNull();
    });

    it("409s when nothing is currently published", async () => {
      const bundle = await createScratchBundle("UnpublishEmpty");
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to unpublish/i);
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId });
      expect(response.status).toBe(404);
    });
  });
});
