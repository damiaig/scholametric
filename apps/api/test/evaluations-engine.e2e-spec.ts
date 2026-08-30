import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 1 (SPEC_V0.7.md §2/§5) — replaces grades-grid.e2e-spec.ts:
// GET/PUT /grades/evaluation-scores and POST /grades/recompute against the
// Evaluation/EvaluationScore model (native /100, no weights, no per-
// evaluation maxScore, no PENDING_APPROVAL hop — every not-yet-published
// subject row is DRAFT). Reuses the real seeded ~100-student JSS 2 A roster
// for realistic scale/timing, and the real seeded PUBLISHED JSS 1 A English
// result for the published-lock/cross-tenant proofs, same discipline as the
// file this replaces.
describe("Evaluation scores (e2e) — SPEC_V0.7.md §2/§5, step 1", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseMathTeacherToken: string; // teacher@sunrise.test — assigned Mathematics + scratch subject, JSS 1 A + JSS 2 A
  let sunriseEnglishTeacherToken: string; // teacher2@sunrise.test — assigned English only
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let englishId: string;

  let hillcrestId: string;
  let hillcrestSessionId: string;
  let hillcrestTermId: string;
  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestEvaluationId: string;

  let scratchSubjectId: string;
  let scratchEvaluationId: string;
  let mathTeacherId: string;
  let jss2ARoster: { id: string }[];
  let jss1ARoster: { id: string }[];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createEvaluation(subjectId: string, classArmId: string, name = "CA 1"): Promise<string> {
    const evaluation = await prisma.evaluation.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId: sunriseSessionId, termId: sunriseTermId, name, description: name, createdBy: mathTeacherId },
    });
    return evaluation.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseMathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    sunriseEnglishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    const sunriseTerm = await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } });
    sunriseTermId = sunriseTerm.id;

    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;

    englishId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "English Language" } })).id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    hillcrestSessionId = hillcrestSession.id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSessionId, name: "FIRST" } })).id;
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "Mathematics" } })).id;
    const hillcrestAdmin = await prisma.user.findFirstOrThrow({ where: { schoolId: hillcrestId, email: "admin@hillcrest.test" } });
    hillcrestEvaluationId = (
      await prisma.evaluation.create({
        data: {
          schoolId: hillcrestId,
          classArmId: hillcrestArmId,
          subjectId: hillcrestSubjectId,
          sessionId: hillcrestSessionId,
          termId: hillcrestTermId,
          name: "CA 1",
          description: "CA 1",
          createdBy: hillcrestAdmin.id,
        },
      })
    ).id;

    const mathTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    mathTeacherId = mathTeacher.id;

    // Scratch subject, isolated from the real Mathematics/English seeded
    // data (step 1's hand-verified totals/positions).
    const scratchSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: "E2E Evaluations Scratch", code: "E2ESCR" },
    });
    scratchSubjectId = scratchSubject.id;
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: scratchSubjectId, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacher.id },
    });
    scratchEvaluationId = await createEvaluation(scratchSubjectId, jss2AArmId);

    // Same filter GradesService.getRoster applies (deletedAt: null,
    // status != WITHDRAWN) — this dev DB has real withdrawn-student
    // residue from earlier acceptance testing, so an unfiltered roster
    // here would disagree with the service's own roster.
    jss2ARoster = await prisma.student.findMany({
      where: {
        schoolId: sunriseId,
        deletedAt: null,
        status: { not: "WITHDRAWN" },
        enrollments: { some: { classArmId: jss2AArmId, sessionId: sunriseSessionId } },
      },
      orderBy: [{ lastName: "asc" }, { firstName: "asc" }, { id: "asc" }],
      select: { id: true },
    });
    jss1ARoster = await prisma.student.findMany({
      where: {
        schoolId: sunriseId,
        deletedAt: null,
        status: { not: "WITHDRAWN" },
        enrollments: { some: { classArmId: jss1AArmId, sessionId: sunriseSessionId } },
      },
      select: { id: true },
    });
  });

  afterAll(async () => {
    await prisma.evaluationScore.deleteMany({ where: { evaluation: { subjectId: scratchSubjectId } } });
    await prisma.evaluation.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.evaluationScore.deleteMany({ where: { evaluationId: hillcrestEvaluationId } });
    await prisma.evaluation.deleteMany({ where: { id: hillcrestEvaluationId } });
    await prisma.termSubjectResult.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subject.delete({ where: { id: scratchSubjectId } });
    await app.close();
  });

  describe("GET /grades/evaluation-scores", () => {
    it("TEACHER can load the grid for their own assignment, reflecting a just-saved score", async () => {
      const [student] = jss2ARoster;
      await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseMathTeacherToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 9 }],
        });

      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluation-scores")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId })
        .set(auth(sunriseMathTeacherToken));
      expect(response.status).toBe(200);
      expect(response.body.rows.length).toBe(jss2ARoster.length);
      expect(response.body.rows.find((r: { studentId: string }) => r.studentId === student.id)?.rawScore).toBe(9);
    });

    it("returns each row's subject-level status, correctly mixed within one grid", async () => {
      // A dedicated, self-contained scratch subject — not the shared
      // scratchSubjectId every other test in this file writes to. This
      // test PUBLISHES a student, and publish's write-lock (409) would
      // poison every later "write to the whole roster" test that reuses
      // the shared subject.
      const statusSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Evaluations Status", code: "E2ESTA" },
      });
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId: statusSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
      });
      const evaluationId = await createEvaluation(statusSubject.id, jss2AArmId);
      try {
        const [published, draftScored, neverScored] = jss2ARoster.slice(0, 3);

        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, evaluationId, termId: sunriseTermId, scores: [{ studentId: published.id, rawScore: 75 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        // draftScored: scored but never published -> DRAFT.
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, evaluationId, termId: sunriseTermId, scores: [{ studentId: draftScored.id, rawScore: 10 }] });

        // neverScored: no evaluation_scores row at all for this subject -> DRAFT (default).

        const response = await request(app.getHttpServer())
          .get("/api/v1/grades/evaluation-scores")
          .query({ classArmId: jss2AArmId, subjectId: statusSubject.id, evaluationId, termId: sunriseTermId })
          .set(auth(sunriseAdminToken));
        expect(response.status).toBe(200);

        const byStudent = new Map(response.body.rows.map((r: { studentId: string; status: string }) => [r.studentId, r.status]));
        expect(byStudent.get(published.id)).toBe("PUBLISHED");
        expect(byStudent.get(draftScored.id)).toBe("DRAFT");
        expect(byStudent.get(neverScored.id)).toBe("DRAFT");
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluationId } });
        await prisma.evaluation.delete({ where: { id: evaluationId } });
        await prisma.termSubjectResult.deleteMany({ where: { subjectId: statusSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: statusSubject.id } });
        await prisma.subject.delete({ where: { id: statusSubject.id } });
      }
    });

    it("SCHOOL_ADMIN can load the grid for any class", async () => {
      const englishEvaluation = await createEvaluation(englishId, jss1AArmId, "E2E Read Probe");
      try {
        const response = await request(app.getHttpServer())
          .get("/api/v1/grades/evaluation-scores")
          .query({ classArmId: jss1AArmId, subjectId: englishId, evaluationId: englishEvaluation, termId: sunriseTermId })
          .set(auth(sunriseAdminToken));
        expect(response.status).toBe(200);
        expect(response.body.rows.length).toBe(jss1ARoster.length);
      } finally {
        await prisma.evaluation.delete({ where: { id: englishEvaluation } });
      }
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluation-scores")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER on a same-tenant class/subject they aren't assigned to", async () => {
      // teacher@sunrise.test teaches Mathematics + the scratch subject, not English.
      const englishEvaluation = await createEvaluation(englishId, jss1AArmId, "E2E RBAC Probe");
      try {
        const response = await request(app.getHttpServer())
          .get("/api/v1/grades/evaluation-scores")
          .query({ classArmId: jss1AArmId, subjectId: englishId, evaluationId: englishEvaluation, termId: sunriseTermId })
          .set(auth(sunriseMathTeacherToken));
        expect(response.status).toBe(403);
      } finally {
        await prisma.evaluation.delete({ where: { id: englishEvaluation } });
      }
    });

    it("404s (not 403) when Sunrise's admin reaches for Hillcrest's grid", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluation-scores")
        .query({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, evaluationId: hillcrestEvaluationId, termId: hillcrestTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(404);
    });

    it("404s (not 403) when Hillcrest's admin reaches for Sunrise's grid", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluation-scores")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId })
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });

    it("404s a nonexistent id within the caller's own tenant", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluation-scores")
        .query({ classArmId: "00000000-0000-0000-0000-000000000000", subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(404);
    });

    it("400s on a missing query param", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluation-scores")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(400);
    });

    it("400s on a malformed query param", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluation-scores")
        .query({ classArmId: "not-a-uuid", subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(400);
    });
  });

  describe("PUT /grades/evaluation-scores", () => {
    it("happy path: saves a small subset and recomputes term_subject_results", async () => {
      const subset = jss2ARoster.slice(0, 3);
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          evaluationId: scratchEvaluationId,
          termId: sunriseTermId,
          scores: subset.map((s) => ({ studentId: s.id, rawScore: 14 })),
        });
      expect(response.status).toBe(200);
      expect(response.body.savedCount).toBe(3);
      expect(response.body.rows).toHaveLength(3);
      for (const row of response.body.rows) {
        expect(row.rawScore).toBe(14);
        expect(row.totalScore).toBe(14); // one evaluation, native /100 — average of one value is itself
        expect(row.status).toBe("DRAFT");
      }

      const persisted = await prisma.evaluationScore.findMany({
        where: { evaluationId: scratchEvaluationId, studentId: { in: subset.map((s) => s.id) } },
      });
      expect(persisted).toHaveLength(3);
    });

    it("writes exactly one audit_logs row for the bulk save", async () => {
      const [student] = jss2ARoster.slice(3, 4);
      const before = await prisma.auditLog.count({ where: { schoolId: sunriseId, action: "grades.saveEvaluationScores" } });
      await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          evaluationId: scratchEvaluationId,
          termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 10 }],
        });
      const after = await prisma.auditLog.count({ where: { schoolId: sunriseId, action: "grades.saveEvaluationScores" } });
      expect(after).toBe(before + 1);

      const log = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.saveEvaluationScores" },
        orderBy: { createdAt: "desc" },
      });
      expect(log?.entityType).toBe("grades");
      expect(log?.entityId).toBe(jss2AArmId);
      expect((log?.metadata as { subjectId: string }).subjectId).toBe(scratchSubjectId);
    });

    it("a second, unscored evaluation contributes nothing — not rescaled", async () => {
      const [student] = jss2ARoster.slice(4, 5);
      const secondEvaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, "E2E Unscored");
      try {
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({
            classArmId: jss2AArmId,
            subjectId: scratchSubjectId,
            evaluationId: scratchEvaluationId,
            termId: sunriseTermId,
            scores: [{ studentId: student.id, rawScore: 15 }],
          });

        const result = await prisma.termSubjectResult.findUniqueOrThrow({
          where: {
            studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: scratchSubjectId, termId: sunriseTermId, sessionId: sunriseSessionId },
          },
        });
        // Only scratchEvaluationId has a score (15) — secondEvaluationId is
        // entirely unscored for this student and contributes nothing, not
        // a rescale to the scored one's full weight.
        expect(Number(result.totalScore)).toBe(15);
        expect(result.status).toBe("DRAFT");
        expect(result.autoGrade).toBe("F9"); // WAEC: 0-39
      } finally {
        await prisma.evaluation.delete({ where: { id: secondEvaluationId } });
      }
    });

    it("the ~100-student JSS 2 A bulk save writes and computes every row in one transaction", async () => {
      const start = Date.now();
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseMathTeacherToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          evaluationId: scratchEvaluationId,
          termId: sunriseTermId,
          scores: jss2ARoster.map((s, i) => ({ studentId: s.id, rawScore: 5 + (i % 16) })),
        });
      const elapsedMs = Date.now() - start;
      // eslint-disable-next-line no-console
      console.log(`[evaluations-engine] ~100-student bulk save: ${elapsedMs}ms for ${jss2ARoster.length} students`);
      expect(response.status).toBe(200);
      expect(response.body.savedCount).toBe(jss2ARoster.length);
      expect(response.body.rows).toHaveLength(jss2ARoster.length);
      expect(elapsedMs).toBeLessThan(5000);

      const scoreCount = await prisma.evaluationScore.count({ where: { evaluationId: scratchEvaluationId } });
      expect(scoreCount).toBe(jss2ARoster.length);
      const resultCount = await prisma.termSubjectResult.count({ where: { subjectId: scratchSubjectId } });
      expect(resultCount).toBe(jss2ARoster.length);
    });

    it("re-sending the identical 100-student payload is idempotent", async () => {
      const beforeScores = await prisma.evaluationScore.count({ where: { evaluationId: scratchEvaluationId } });
      const beforeResults = await prisma.termSubjectResult.count({ where: { subjectId: scratchSubjectId } });

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseMathTeacherToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          evaluationId: scratchEvaluationId,
          termId: sunriseTermId,
          scores: jss2ARoster.map((s, i) => ({ studentId: s.id, rawScore: 5 + (i % 16) })),
        });
      expect(response.status).toBe(200);

      const afterScores = await prisma.evaluationScore.count({ where: { evaluationId: scratchEvaluationId } });
      const afterResults = await prisma.termSubjectResult.count({ where: { subjectId: scratchSubjectId } });
      expect(afterScores).toBe(beforeScores);
      expect(afterResults).toBe(beforeResults);

      const sample = jss2ARoster[0];
      const persisted = await prisma.evaluationScore.findUniqueOrThrow({
        where: { evaluationId_studentId: { evaluationId: scratchEvaluationId, studentId: sample.id } },
      });
      expect(Number(persisted.rawScore)).toBe(5);
    });

    it("400s a rawScore above 100, writing nothing", async () => {
      const [student] = jss2ARoster.slice(10, 11);
      const before = await prisma.evaluationScore.findUnique({
        where: { evaluationId_studentId: { evaluationId: scratchEvaluationId, studentId: student.id } },
      });
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          evaluationId: scratchEvaluationId,
          termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 125 }],
        });
      expect(response.status).toBe(400);

      const after = await prisma.evaluationScore.findUnique({
        where: { evaluationId_studentId: { evaluationId: scratchEvaluationId, studentId: student.id } },
      });
      expect(after?.rawScore?.toString()).toBe(before?.rawScore?.toString());
    });

    it("400s a negative rawScore", async () => {
      const [student] = jss2ARoster.slice(10, 11);
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: -1 }],
        });
      expect(response.status).toBe(400);
    });

    it("400s a studentId not enrolled in this class arm", async () => {
      const foreignStudent = jss1ARoster[0]; // enrolled in JSS 1 A, not JSS 2 A
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId,
          scores: [{ studentId: foreignStudent.id, rawScore: 10 }],
        });
      expect(response.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId, scores: [] });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER writing to a same-tenant class/subject they aren't assigned to", async () => {
      // teacher2@sunrise.test teaches English only — no assignment on the scratch subject.
      const [student] = jss2ARoster.slice(0, 1);
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseEnglishTeacherToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 10 }],
        });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) a cross-tenant write — Sunrise admin targeting Hillcrest's grid", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, evaluationId: hillcrestEvaluationId, termId: hillcrestTermId,
          scores: [{ studentId: "00000000-0000-0000-0000-000000000000", rawScore: 10 }],
        });
      expect(response.status).toBe(404);
    });

    it("404s (not 403) a cross-tenant write — Hillcrest admin targeting Sunrise's grid", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(hillcrestAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId,
          scores: [{ studentId: "00000000-0000-0000-0000-000000000000", rawScore: 10 }],
        });
      expect(response.status).toBe(404);
    });

    // SPEC_V0.5.1.md §2.5, v0.5.1 step 4, carried into v0.7: SCHOOL_ADMIN/
    // PROPRIETOR pass this gate (see mark-absent-after-publish.e2e-spec.ts
    // for that full flow) — TEACHER still 409s here unconditionally.
    it("409s a TEACHER's write against the real, seeded PUBLISHED JSS 1 A English result, leaving it unchanged", async () => {
      const [student] = jss1ARoster;
      const before = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: englishId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(before.status).toBe("PUBLISHED");

      const englishEvaluation = await createEvaluation(englishId, jss1AArmId, "E2E Locked Probe");
      try {
        const response = await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseEnglishTeacherToken))
          .send({
            classArmId: jss1AArmId, subjectId: englishId, evaluationId: englishEvaluation, termId: sunriseTermId,
            scores: [{ studentId: student.id, rawScore: 1 }],
          });
        expect(response.status).toBe(409);
        expect(response.body.lockedStudentIds).toEqual([student.id]);
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluationId: englishEvaluation } });
        await prisma.evaluation.delete({ where: { id: englishEvaluation } });
      }

      const after = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: englishId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(after).toEqual(before);
    });

    it("concurrent saves to different evaluations for the same student don't lose an update", async () => {
      const [student] = jss2ARoster.slice(50, 51);
      const secondEvaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, "E2E Concurrency");
      try {
        const [responseA, responseB] = await Promise.all([
          request(app.getHttpServer())
            .put("/api/v1/grades/evaluation-scores")
            .set(auth(sunriseAdminToken))
            .send({
              classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId,
              scores: [{ studentId: student.id, rawScore: 12 }],
            }),
          request(app.getHttpServer())
            .put("/api/v1/grades/evaluation-scores")
            .set(auth(sunriseMathTeacherToken))
            .send({
              classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: secondEvaluationId, termId: sunriseTermId,
              scores: [{ studentId: student.id, rawScore: 8 }],
            }),
        ]);
        expect(responseA.status).toBe(200);
        expect(responseB.status).toBe(200);

        const result = await prisma.termSubjectResult.findUniqueOrThrow({
          where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: scratchSubjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
        });
        // (12 + 8) / 2 = 10 — both writes must be reflected, not whichever
        // transaction happened to read evaluation_scores last.
        expect(Number(result.totalScore)).toBe(10);
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluationId: secondEvaluationId } });
        await prisma.evaluation.delete({ where: { id: secondEvaluationId } });
      }
    });
  });

  describe("PUT /grades/evaluation-scores — absent (SPEC_V0.5.md §2.1, v0.5 step 2, carried into v0.7)", () => {
    it("marking a student absent persists (rawScore null, isAbsent true) and flows through the existing recompute — excluded from the total entirely", async () => {
      const [student] = jss2ARoster.slice(70, 71);
      const secondEvaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, "E2E Absent Total");
      try {
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 15 }] });

        const absentRes = await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: secondEvaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, isAbsent: true }] });
        expect(absentRes.status).toBe(200);
        const row = absentRes.body.rows[0];
        expect(row.rawScore).toBeNull();
        expect(row.isAbsent).toBe(true);
        // Total excludes the absent evaluation entirely: only the first
        // evaluation counts (15) — NOT a 0 and NOT rescaled.
        expect(row.status).toBe("DRAFT");
        expect(row.totalScore).toBe(15);

        const persisted = await prisma.evaluationScore.findUniqueOrThrow({
          where: { evaluationId_studentId: { evaluationId: secondEvaluationId, studentId: student.id } },
        });
        expect(persisted.rawScore).toBeNull();
        expect(persisted.isAbsent).toBe(true);
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluationId: secondEvaluationId } });
        await prisma.evaluation.delete({ where: { id: secondEvaluationId } });
      }
    });

    it("a real score entered after a prior absent mark clears isAbsent back to false (not left stale)", async () => {
      const [student] = jss2ARoster.slice(71, 72);
      const absentRes = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, isAbsent: true }] });
      expect(absentRes.body.rows[0].isAbsent).toBe(true);
      expect(absentRes.body.rows[0].rawScore).toBeNull();

      const scoredRes = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 18 }] });
      expect(scoredRes.status).toBe(200);
      expect(scoredRes.body.rows[0].rawScore).toBe(18);
      expect(scoredRes.body.rows[0].isAbsent).toBe(false);

      // Not just the response echo — the persisted row itself, which is
      // what the DB CHECK constraint actually guards. A stale isAbsent:
      // true left behind here alongside the new rawScore would violate
      // evaluation_scores_raw_score_or_absent_check.
      const persisted = await prisma.evaluationScore.findUniqueOrThrow({
        where: { evaluationId_studentId: { evaluationId: scratchEvaluationId, studentId: student.id } },
      });
      expect(Number(persisted.rawScore)).toBe(18);
      expect(persisted.isAbsent).toBe(false);
    });

    it("marking absent after a prior real score clears rawScore to null (the other direction)", async () => {
      const [student] = jss2ARoster.slice(72, 73);
      const scoredRes = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 12 }] });
      expect(scoredRes.body.rows[0].rawScore).toBe(12);
      expect(scoredRes.body.rows[0].isAbsent).toBe(false);

      const absentRes = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, isAbsent: true }] });
      expect(absentRes.status).toBe(200);
      expect(absentRes.body.rows[0].rawScore).toBeNull();
      expect(absentRes.body.rows[0].isAbsent).toBe(true);

      const persisted = await prisma.evaluationScore.findUniqueOrThrow({
        where: { evaluationId_studentId: { evaluationId: scratchEvaluationId, studentId: student.id } },
      });
      expect(persisted.rawScore).toBeNull();
      expect(persisted.isAbsent).toBe(true);
    });

    it("400s a payload with both rawScore and isAbsent set, writing nothing (DTO-level mutual exclusion)", async () => {
      const [student] = jss2ARoster.slice(73, 74);
      const before = await prisma.evaluationScore.findUnique({
        where: { evaluationId_studentId: { evaluationId: scratchEvaluationId, studentId: student.id } },
      });

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: scratchEvaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 10, isAbsent: true }] });
      expect(response.status).toBe(400);

      const after = await prisma.evaluationScore.findUnique({
        where: { evaluationId_studentId: { evaluationId: scratchEvaluationId, studentId: student.id } },
      });
      expect(after).toEqual(before);
    });

    it("GET /grades/evaluation-scores round-trips isAbsent alongside a normally-scored classmate in the same response", async () => {
      const [absentStudent, scoredStudent] = jss2ARoster.slice(74, 76);
      const secondEvaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, "E2E Roundtrip");
      try {
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({
            classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: secondEvaluationId, termId: sunriseTermId,
            scores: [{ studentId: absentStudent.id, isAbsent: true }, { studentId: scoredStudent.id, rawScore: 45 }],
          });

        const response = await request(app.getHttpServer())
          .get("/api/v1/grades/evaluation-scores")
          .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, evaluationId: secondEvaluationId, termId: sunriseTermId })
          .set(auth(sunriseAdminToken));
        expect(response.status).toBe(200);
        const rows = response.body.rows as Array<{ studentId: string; rawScore: number | null; isAbsent: boolean }>;
        const absentRow = rows.find((r) => r.studentId === absentStudent.id);
        const scoredRow = rows.find((r) => r.studentId === scoredStudent.id);
        expect(absentRow?.isAbsent).toBe(true);
        expect(absentRow?.rawScore).toBeNull();
        expect(scoredRow?.isAbsent).toBe(false);
        expect(scoredRow?.rawScore).toBe(45);
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluationId: secondEvaluationId } });
        await prisma.evaluation.delete({ where: { id: secondEvaluationId } });
      }
    });

    it("the DB CHECK constraint still rejects a hand-crafted both-set row, entirely bypassing the DTO", async () => {
      // A canary against a future regression removing/weakening
      // evaluation_scores_raw_score_or_absent_check — goes straight
      // through Prisma, never through the DTO's own mutual-exclusion
      // validator proven above, so this is the last line of defense.
      const [student] = jss2ARoster.slice(76, 77);
      const admin = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "admin@sunrise.test" } });
      await expect(
        prisma.evaluationScore.create({
          data: {
            evaluationId: scratchEvaluationId,
            studentId: student.id,
            rawScore: 50,
            isAbsent: true,
            enteredBy: admin.id,
            enteredAt: new Date(),
          },
        }),
      ).rejects.toThrow();
    });
  });

  describe("POST /grades/recompute", () => {
    it("SCHOOL_ADMIN can re-trigger recompute for a class/subject/term", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/recompute")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId });
      expect(response.status).toBe(200);
      expect(response.body.recomputedCount).toBe(jss2ARoster.length);
    });

    it("403s a TEACHER, even on their own assignment", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/recompute")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId });
      expect(response.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/recompute")
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId });
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/recompute")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId });
      expect(response.status).toBe(404);
    });

    it("409s against the real, seeded PUBLISHED JSS 1 A English result, naming every locked student", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/recompute")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss1AArmId, subjectId: englishId, termId: sunriseTermId });
      expect(response.status).toBe(409);
      expect(new Set(response.body.lockedStudentIds)).toEqual(new Set(jss1ARoster.map((s) => s.id)));
    });
  });
});
