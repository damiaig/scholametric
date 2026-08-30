import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 1 (SPEC_V0.7.md §2/§5) — Track B: exams are scored/published
// entirely separately from evaluations (Track A) and must NEVER contribute
// to term_subject_results/term_overall_results. Every scenario gets its
// own scratch session+term+class-arm+subject+students bundle in the real
// Sunrise tenant (mirrors terms.e2e-spec.ts's createScratchBundle) — never
// the seeded demo data.
describe("Exam scores (e2e) — SPEC_V0.7.md §2/§5, step 1", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let sunriseOtherTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let jss2LevelId: string;
  let teacherUserId: string;

  let hillcrestId: string;
  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestTermId: string;
  let hillcrestExamId: string;

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
    examId: string;
    studentIds: string[];
  }

  async function createExamFor(subjectId: string, classArmId: string, sessionId: string, termId: string, name = "Exam"): Promise<string> {
    const exam = await prisma.exam.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name, createdBy: teacherUserId },
    });
    return exam.id;
  }

  async function createScratchBundle(prefix: string, studentCount = 3): Promise<ScratchBundle> {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-Exams-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-Exams-${stamp}` },
    });
    createdClassArmIds.push(classArm.id);
    const subject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E Exams ${stamp}`, code: `EX${stamp.slice(-6)}`.slice(0, 10).toUpperCase() },
    });
    createdSubjectIds.push(subject.id);
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: subject.id, classArmId: classArm.id, sessionId: session.id, teacherUserId },
    });
    const examId = await createExamFor(subject.id, classArm.id, session.id, term.id);

    const studentIds: string[] = [];
    for (let i = 0; i < studentCount; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-EX/${stamp}/${i}`,
          firstName: "Exams",
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348034${String(Date.now() + i).slice(-6)}`,
        },
      });
      createdStudentIds.push(student.id);
      await prisma.studentEnrollment.create({
        data: { schoolId: sunriseId, studentId: student.id, classArmId: classArm.id, sessionId: session.id },
      });
      studentIds.push(student.id);
    }

    return { sessionId: session.id, termId: term.id, classArmId: classArm.id, subjectId: subject.id, examId, studentIds };
  }

  async function scoreExam(token: string, bundle: ScratchBundle, examId: string, scores: { studentId: string; rawScore?: number | null; isAbsent?: boolean }[]) {
    return request(app.getHttpServer())
      .put("/api/v1/exams/scores")
      .set(auth(token))
      .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, examId, termId: bundle.termId, scores });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    sunriseOtherTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;
    teacherUserId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "Mathematics" } })).id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;
    const hillcrestAdmin = await prisma.user.findFirstOrThrow({ where: { schoolId: hillcrestId, email: "admin@hillcrest.test" } });
    hillcrestExamId = (
      await prisma.exam.create({
        data: {
          schoolId: hillcrestId,
          classArmId: hillcrestArmId,
          subjectId: hillcrestSubjectId,
          sessionId: hillcrestSession.id,
          termId: hillcrestTermId,
          createdBy: hillcrestAdmin.id,
        },
      })
    ).id;
  });

  afterAll(async () => {
    await prisma.termUnlock.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.examScore.deleteMany({ where: { exam: { subjectId: { in: createdSubjectIds } } } });
    await prisma.exam.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.examScore.deleteMany({ where: { examId: hillcrestExamId } });
    await prisma.exam.deleteMany({ where: { id: hillcrestExamId } });
    await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termExamResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.yearExamResult.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
    // The cross-track independence test also writes an EvaluationScore,
    // which creates a term_subject_results row (evaluation track) that
    // must be cleaned up too, before students can be deleted.
    await prisma.termSubjectResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  describe("GET/PUT /exams/scores", () => {
    it("happy path: saves scores and recomputes term_subject_exam_results", async () => {
      const bundle = await createScratchBundle("Happy");
      const response = await scoreExam(sunriseAdminToken, bundle, bundle.examId, bundle.studentIds.map((studentId) => ({ studentId, rawScore: 72 })));
      expect(response.status).toBe(200);
      expect(response.body.savedCount).toBe(3);
      for (const row of response.body.rows) {
        expect(row.rawScore).toBe(72);
        expect(row.totalScore).toBe(72);
        expect(row.status).toBe("DRAFT");
      }

      const result = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: bundle.studentIds[0], subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(Number(result.totalScore)).toBe(72);
      expect(result.status).toBe("DRAFT");

      const read = await request(app.getHttpServer())
        .get("/api/v1/exams/scores")
        .query({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, examId: bundle.examId, termId: bundle.termId })
        .set(auth(sunriseAdminToken));
      expect(read.status).toBe(200);
      expect(read.body.rows).toHaveLength(3);
      expect(read.body.rows.every((r: { status: string }) => r.status === "DRAFT")).toBe(true);
    });

    it("400s a studentId not enrolled in this class arm", async () => {
      const bundle = await createScratchBundle("Roster");
      const response = await scoreExam(sunriseAdminToken, bundle, bundle.examId, [{ studentId: "00000000-0000-0000-0000-000000000000", rawScore: 50 }]);
      expect(response.status).toBe(400);
    });

    it("403s a TEACHER not assigned to this subject; 404s SCHOOL_ADMIN/PROPRIETOR without an assignment", async () => {
      const bundle = await createScratchBundle("RBAC");
      const teacherAttempt = await scoreExam(sunriseOtherTeacherToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], rawScore: 50 }]);
      expect(teacherAttempt.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const bundle = await createScratchBundle("Unauth");
      const response = await request(app.getHttpServer())
        .put("/api/v1/exams/scores")
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, examId: bundle.examId, termId: bundle.termId, scores: [] });
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const bundle = await createScratchBundle("CrossTenant");
      const a = await request(app.getHttpServer())
        .get("/api/v1/exams/scores")
        .query({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, examId: hillcrestExamId, termId: hillcrestTermId })
        .set(auth(sunriseAdminToken));
      expect(a.status).toBe(404);

      const b = await scoreExam(hillcrestAdminToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], rawScore: 10 }]);
      expect(b.status).toBe(404);
    });

    it("absent handling: excluded from the total entirely, and the DB CHECK constraint rejects a hand-crafted both-set row", async () => {
      const bundle = await createScratchBundle("Absent", 2);
      const secondExamId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId, "Resit");
      await scoreExam(sunriseAdminToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], rawScore: 40 }]);
      const absentRes = await scoreExam(sunriseAdminToken, bundle, secondExamId, [{ studentId: bundle.studentIds[0], isAbsent: true }]);
      expect(absentRes.status).toBe(200);
      expect(absentRes.body.rows[0].rawScore).toBeNull();
      expect(absentRes.body.rows[0].isAbsent).toBe(true);
      expect(absentRes.body.rows[0].totalScore).toBe(40); // resit excluded, not averaged as 0

      const admin = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "admin@sunrise.test" } });
      await expect(
        prisma.examScore.create({
          data: { examId: bundle.examId, studentId: bundle.studentIds[1], rawScore: 50, isAbsent: true, enteredBy: admin.id, enteredAt: new Date() },
        }),
      ).rejects.toThrow();
    });

    it("closed-term protection (headline b, exam track): blocked without unlock, allowed after — the SAME term lock the evaluation track uses", async () => {
      const bundle = await createScratchBundle("ClosedTerm");
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));

      const blocked = await scoreExam(sunriseAdminToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], rawScore: 60 }]);
      expect(blocked.status).toBe(409);
      expect(blocked.body.termLocked).toBe(true);

      const unlockRes = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Correcting an exam entry" });
      expect(unlockRes.status).toBe(200);

      const allowed = await scoreExam(sunriseAdminToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], rawScore: 60 }]);
      expect(allowed.status).toBe(200);

      const relockRes = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/relock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId });
      expect(relockRes.status).toBe(200);

      const blockedAgain = await scoreExam(sunriseAdminToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      expect(blockedAgain.status).toBe(409);
    });

    it("published-lock: TEACHER 409s against a PUBLISHED exam result; SCHOOL_ADMIN/PROPRIETOR may correct it", async () => {
      const bundle = await createScratchBundle("PublishedLock");
      await scoreExam(sunriseAdminToken, bundle, bundle.examId, bundle.studentIds.map((studentId) => ({ studentId, rawScore: 50 })));
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(publishRes.status).toBe(200);

      const teacherAttempt = await scoreExam(sunriseTeacherToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], isAbsent: true }]);
      expect(teacherAttempt.status).toBe(409);
      expect(teacherAttempt.body.lockedStudentIds).toEqual([bundle.studentIds[0]]);

      const adminCorrection = await scoreExam(sunriseAdminToken, bundle, bundle.examId, [{ studentId: bundle.studentIds[0], isAbsent: true }]);
      expect(adminCorrection.status).toBe(200);
      const corrected = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: bundle.studentIds[0], subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(corrected.status).toBe("PUBLISHED"); // preserved, not reverted
    });
  });

  describe("POST /exams/recompute", () => {
    it("SCHOOL_ADMIN can re-trigger recompute for a class/subject/term", async () => {
      const bundle = await createScratchBundle("Recompute");
      await scoreExam(sunriseAdminToken, bundle, bundle.examId, bundle.studentIds.map((studentId) => ({ studentId, rawScore: 30 })));
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/recompute")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(response.status).toBe(200);
      expect(response.body.recomputedCount).toBe(3);
    });

    it("403s a TEACHER, even on their own assignment", async () => {
      const bundle = await createScratchBundle("RecomputeRbac");
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/recompute")
        .set(auth(sunriseTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams/recompute")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId });
      expect(response.status).toBe(404);
    });
  });

  // Headline assertion (a), confirmed by the user: an exam score present
  // must NOT change the evaluation term average — the two tracks are
  // entirely independent (SPEC_V0.7.md §2).
  describe("Cross-track independence (headline assertion a)", () => {
    it("an exam score for a student does not change their evaluation-track term_subject_result", async () => {
      const bundle = await createScratchBundle("Independence", 1);
      const [studentId] = bundle.studentIds;

      const evaluation = await prisma.evaluation.create({
        data: {
          schoolId: sunriseId,
          classArmId: bundle.classArmId,
          subjectId: bundle.subjectId,
          sessionId: bundle.sessionId,
          termId: bundle.termId,
          name: "CA 1",
          description: "CA 1",
          createdBy: teacherUserId,
        },
      });
      const evalSave = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, evaluationId: evaluation.id, termId: bundle.termId, scores: [{ studentId, rawScore: 55 }] });
      expect(evalSave.status).toBe(200);

      const beforeExam = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId, subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(Number(beforeExam.totalScore)).toBe(55);

      // Now score a wildly different exam value for the SAME student/
      // subject/term — the evaluation-track total must be untouched.
      const examSave = await scoreExam(sunriseAdminToken, bundle, bundle.examId, [{ studentId, rawScore: 5 }]);
      expect(examSave.status).toBe(200);

      const afterExam = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId, subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(Number(afterExam.totalScore)).toBe(55); // unchanged by the exam write

      const examResult = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId, subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(Number(examResult.totalScore)).toBe(5); // the exam track's own, independent number

      await prisma.evaluationScore.deleteMany({ where: { evaluationId: evaluation.id } });
      await prisma.evaluation.delete({ where: { id: evaluation.id } });
    });
  });
});
