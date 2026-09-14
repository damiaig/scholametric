import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7.4 step 2 (SPEC_V0.7.4.md §3) — replaces the old subject-level
// POST /exams/publish with a two-step approval workflow: TEACHER submits
// (own assignment) -> PENDING_APPROVAL; SCHOOL_ADMIN/PROPRIETOR approves
// -> PUBLISHED (only path there now) or rejects -> back to DRAFT.
// POST /exams/unpublish is UNCHANGED (PROPRIETOR-only, PUBLISHED -> DRAFT).
// No subjectPosition/override at this level (term_subject_exam_results has
// neither field — Q6 ranks only at the per-term/whole-year levels, see
// exam-rankings.e2e-spec.ts).
describe("Exam approval workflow (e2e) — SPEC_V0.7.4.md §3, v0.7.4 step 2", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let hillcrestTeacherToken: string;

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

  function submitExam(bundle: Pick<ScratchBundle, "classArmId" | "subjectId" | "termId">, token = sunriseTeacherToken) {
    return request(app.getHttpServer())
      .post("/api/v1/exams/submit-for-approval")
      .set(auth(token))
      .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
  }

  function approveExam(bundle: Pick<ScratchBundle, "classArmId" | "subjectId" | "termId">, token = sunriseAdminToken) {
    return request(app.getHttpServer())
      .post("/api/v1/exams/approve")
      .set(auth(token))
      .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
  }

  function rejectExam(bundle: Pick<ScratchBundle, "classArmId" | "subjectId" | "termId">, token = sunriseAdminToken) {
    return request(app.getHttpServer())
      .post("/api/v1/exams/reject")
      .set(auth(token))
      .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
  }

  // Submits then approves in one step — the confirmed happy path for
  // reaching PUBLISHED under the new workflow, used by tests that just
  // need a published fixture rather than testing submit/approve themselves.
  async function submitAndApprove(bundle: Pick<ScratchBundle, "classArmId" | "subjectId" | "termId">) {
    const submitRes = await submitExam(bundle);
    if (submitRes.status !== 200) throw new Error(`submit failed: ${submitRes.status} ${JSON.stringify(submitRes.body)}`);
    const approveRes = await approveExam(bundle);
    if (approveRes.status !== 200) throw new Error(`approve failed: ${approveRes.status} ${JSON.stringify(approveRes.body)}`);
    return approveRes;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");
    hillcrestTeacherToken = await loginAs(app, "teacher@hillcrest.test", "hillcrest");

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

  describe("POST /exams/submit-for-approval", () => {
    it("happy path: TEACHER transitions DRAFT rows to PENDING_APPROVAL — no cascade yet", async () => {
      const bundle = await createScratchBundle("Happy");
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [
        { studentId: bundle.studentIds[0], rawScore: 80 },
        { studentId: bundle.studentIds[1], rawScore: 60 },
      ]);

      const response = await submitExam(bundle);
      expect(response.status).toBe(200);
      expect(response.body.submittedCount).toBe(2);

      const rows = await prisma.termSubjectExamResult.findMany({ where: { subjectId: bundle.subjectId } });
      for (const row of rows) {
        expect(row.status).toBe("PENDING_APPROVAL");
        expect(row.publishedAt).toBeNull();
      }

      // No cascade on submit — term_exam_results only counts PUBLISHED rows.
      const termExamResults = await prisma.termExamResult.findMany({ where: { termId: bundle.termId } });
      expect(termExamResults).toHaveLength(0);
    });

    it("409s with nothing to do (no scores entered)", async () => {
      const bundle = await createScratchBundle("Empty");
      const response = await submitExam(bundle);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to submit/i);
    });

    // v0.7.4 step 2 (SPEC_V0.7.4.md §3 Q5) — roster-wide, reusing the
    // evaluation track's Step 1 gate shape: a student who was NEVER
    // scored on ANY exam (no term_subject_exam_result row exists at all
    // for them) still blocks the submit — not just students who already
    // have a row and left one exam blank.
    it("completeness gate is ROSTER-WIDE: blocks submit when a student was never scored at all, not just a blank row", async () => {
      const bundle = await createScratchBundle("Completeness");
      const examA = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId, "Exam A");
      const [scored, neverScored] = bundle.studentIds;
      await scoreExam(bundle, examA, [{ studentId: scored, rawScore: 50 }]); // neverScored has NO row at all

      const response = await submitExam(bundle);
      expect(response.status).toBe(409);
      expect(response.body.incompleteStudentIds).toEqual([neverScored]);

      const scoredRow = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: scored, subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(scoredRow.status).toBe("DRAFT"); // atomic — not transitioned just because a roster-mate was blank
    });

    it("completeness gate also catches a blank exam for a student who has a row on a DIFFERENT exam", async () => {
      const bundle = await createScratchBundle("CompletenessB");
      const examA = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId, "Exam A");
      const examB = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId, "Exam B");
      const [complete, incomplete] = bundle.studentIds;
      await scoreExam(bundle, examA, [{ studentId: complete, rawScore: 50 }, { studentId: incomplete, rawScore: 40 }]);
      await scoreExam(bundle, examB, [{ studentId: complete, rawScore: 60 }]); // incomplete's examB left blank

      const response = await submitExam(bundle);
      expect(response.status).toBe(409);
      expect(response.body.incompleteStudentIds).toEqual([incomplete]);
    });

    it("403s SCHOOL_ADMIN and PROPRIETOR (TEACHER-only, categorical); rejects unauthenticated; 404s cross-tenant", async () => {
      const bundle = await createScratchBundle("Rbac");

      const adminAttempt = await submitExam(bundle, sunriseAdminToken);
      expect(adminAttempt.status).toBe(403);

      const proprietorAttempt = await submitExam(bundle, sunriseProprietorToken);
      expect(proprietorAttempt.status).toBe(403);

      const unauth = await request(app.getHttpServer())
        .post("/api/v1/exams/submit-for-approval")
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(unauth.status).toBe(401);

      // A real TEACHER token, but from the wrong school — reaches the
      // service layer (role check passes) and 404s on tenant scope.
      const crossTenant = await submitExam(bundle, hillcrestTeacherToken);
      expect(crossTenant.status).toBe(404);
    });

    it("409s re-submitting an already-pending or already-published subject", async () => {
      const bundle = await createScratchBundle("Resubmit", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);

      expect((await submitExam(bundle)).status).toBe(200);
      const secondSubmit = await submitExam(bundle);
      expect(secondSubmit.status).toBe(409);
      expect(secondSubmit.body.message).toMatch(/already submitted for approval or published/i);

      expect((await approveExam(bundle)).status).toBe(200);
      const thirdSubmit = await submitExam(bundle);
      expect(thirdSubmit.status).toBe(409);
    });
  });

  describe("POST /exams/approve", () => {
    it("happy path: SCHOOL_ADMIN approves a PENDING_APPROVAL subject -> PUBLISHED, cascades into term_exam_results", async () => {
      const bundle = await createScratchBundle("Approve");
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [
        { studentId: bundle.studentIds[0], rawScore: 80 },
        { studentId: bundle.studentIds[1], rawScore: 60 },
      ]);
      expect((await submitExam(bundle)).status).toBe(200);

      const response = await approveExam(bundle);
      expect(response.status).toBe(200);
      expect(response.body.approvedCount).toBe(2);

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

    it("PROPRIETOR can also approve (both roles keep this power)", async () => {
      const bundle = await createScratchBundle("ApproveProprietor", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      expect((await submitExam(bundle)).status).toBe(200);

      const response = await approveExam(bundle, sunriseProprietorToken);
      expect(response.status).toBe(200);
    });

    // The load-bearing test: if a teacher could approve their own
    // submission, the approval gate would be theater.
    it("TEACHER cannot self-approve — 403", async () => {
      const bundle = await createScratchBundle("SelfApprove", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      expect((await submitExam(bundle)).status).toBe(200);

      const selfApprove = await approveExam(bundle, sunriseTeacherToken);
      expect(selfApprove.status).toBe(403);

      const stillPending = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: bundle.studentIds[0], subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(stillPending.status).toBe("PENDING_APPROVAL");
    });

    it("409s with nothing to approve (no exam results are pending)", async () => {
      const bundle = await createScratchBundle("ApproveEmpty");
      const response = await approveExam(bundle);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to approve/i);
    });

    it("rejects unauthenticated; 404s cross-tenant", async () => {
      const bundle = await createScratchBundle("ApproveRbac");

      const unauth = await request(app.getHttpServer())
        .post("/api/v1/exams/approve")
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
      expect(unauth.status).toBe(401);

      const crossTenant = await approveExam(bundle, hillcrestAdminToken);
      expect(crossTenant.status).toBe(404);
    });
  });

  describe("POST /exams/reject", () => {
    it("happy path: SCHOOL_ADMIN rejects a PENDING_APPROVAL subject back to DRAFT — no cascade", async () => {
      const bundle = await createScratchBundle("Reject", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      expect((await submitExam(bundle)).status).toBe(200);

      const response = await rejectExam(bundle);
      expect(response.status).toBe(200);
      expect(response.body.rejectedCount).toBe(1);

      const reverted = await prisma.termSubjectExamResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: bundle.studentIds[0], subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
      });
      expect(reverted.status).toBe("DRAFT");
      expect(reverted.publishedAt).toBeNull();

      // A rejected subject can be resubmitted (round-trip).
      const resubmit = await submitExam(bundle);
      expect(resubmit.status).toBe(200);
    });

    it("PROPRIETOR can also reject", async () => {
      const bundle = await createScratchBundle("RejectProprietor", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      expect((await submitExam(bundle)).status).toBe(200);

      const response = await rejectExam(bundle, sunriseProprietorToken);
      expect(response.status).toBe(200);
    });

    it("403s a TEACHER attempting to reject", async () => {
      const bundle = await createScratchBundle("RejectRbac", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      expect((await submitExam(bundle)).status).toBe(200);

      const response = await rejectExam(bundle, sunriseTeacherToken);
      expect(response.status).toBe(403);
    });

    it("409s with nothing to reject (no exam results are pending)", async () => {
      const bundle = await createScratchBundle("RejectEmpty");
      const response = await rejectExam(bundle);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to reject/i);
    });

    it("404s cross-tenant", async () => {
      const response = await rejectExam({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId }, sunriseAdminToken);
      expect(response.status).toBe(404);
    });
  });

  describe("POST /exams/unpublish", () => {
    it("happy path (PROPRIETOR): reverts to DRAFT; SCHOOL_ADMIN 403s", async () => {
      const bundle = await createScratchBundle("Unpublish", 1);
      const examId = await createExamFor(bundle.subjectId, bundle.classArmId, bundle.sessionId, bundle.termId);
      await scoreExam(bundle, examId, [{ studentId: bundle.studentIds[0], rawScore: 70 }]);
      await submitAndApprove(bundle);

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
