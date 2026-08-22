import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Grades grid (e2e)", () => {
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
  let mathematicsId: string;
  let englishId: string;
  let ca1Id: string;
  let ca2Id: string;
  let examId: string;

  let hillcrestId: string;
  let hillcrestSessionId: string;
  let hillcrestTermId: string;
  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestComponentId: string;

  let scratchSubjectId: string;
  let mathTeacherId: string;
  let jss2ARoster: { id: string }[];
  let jss1ARoster: { id: string }[];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

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

    mathematicsId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;
    englishId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "English Language" } })).id;

    const components = await prisma.assessmentComponent.findMany({
      where: { schoolId: sunriseId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    ca1Id = components[0].id;
    ca2Id = components[1].id;
    examId = components[2].id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    hillcrestSessionId = hillcrestSession.id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSessionId, name: "FIRST" } })).id;
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "Mathematics" } })).id;
    hillcrestComponentId = (
      await prisma.assessmentComponent.findFirstOrThrow({ where: { schoolId: hillcrestId, deletedAt: null } })
    ).id;

    // Scratch subject, isolated from the real Mathematics/English seeded
    // data (step 1's hand-verified totals/positions) — reuses the real
    // school-wide CA1/CA2/Exam components (assessment structure is
    // school-wide, not per-subject, so no scratch component is needed).
    const scratchSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: "E2E Grades Scratch", code: "E2ESCR" },
    });
    scratchSubjectId = scratchSubject.id;
    const mathTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    mathTeacherId = mathTeacher.id;
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: scratchSubjectId, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacher.id },
    });

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
    await prisma.studentScore.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.termSubjectResult.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subject.delete({ where: { id: scratchSubjectId } });
    await app.close();
  });

  describe("GET /grades/grid", () => {
    it("TEACHER can load the grid for their own assignment, reflecting a just-saved score", async () => {
      // Round-trips against the scratch subject rather than asserting on
      // Mathematics' pre-existing seeded scores: the assessment-components
      // e2e suite's own afterAll restores CA1/CA2/Exam by re-PUTting with
      // no ids, which — correctly, per the soft-delete design — swaps in
      // fresh component ids with no history every time that suite runs,
      // so "the active CA1 has historical scores" isn't a stable
      // assumption across a full test-suite run.
      // teacher@sunrise.test's scratch assignment is on JSS 2 A.
      const [student] = jss2ARoster;
      await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseMathTeacherToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 9 }],
        });

      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId })
        .set(auth(sunriseMathTeacherToken));
      expect(response.status).toBe(200);
      expect(response.body.rows.length).toBe(jss2ARoster.length);
      expect(response.body.maxScore).toBe(20);
      expect(response.body.requiresApproval).toBe(false);
      expect(response.body.rows.find((r: { studentId: string }) => r.studentId === student.id)?.rawScore).toBe(9);
    });

    it("returns each row's subject-level status, correctly mixed within one grid", async () => {
      // A dedicated, self-contained scratch subject — not the shared
      // scratchSubjectId every other test in this file writes to. This
      // test PUBLISHES a student, and publish's write-lock (409) would
      // poison every later "write to the whole roster" test that reuses
      // the shared subject.
      const statusSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Grid Status", code: "E2ESTA" },
      });
      // SPEC_V0.5.1.md §2.1/§2.2: entry (this test's whole point) now
      // requires an assignment for admin too, not just TEACHER.
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId: statusSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
      });
      try {
        const [published, draftScored, neverScored] = jss2ARoster.slice(0, 3);

        // published: CA1 + Exam scored, then the subject published.
        await request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: published.id, rawScore: 15 }] });
        await request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, componentId: examId, termId: sunriseTermId, scores: [{ studentId: published.id, rawScore: 60 }] });
        // CA2 = 0 (decided, not blank) — completeness gate (SPEC_V0.5.md §2.2).
        await request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, componentId: ca2Id, termId: sunriseTermId, scores: [{ studentId: published.id, rawScore: 0 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        // draftScored: only CA1 scored, no approval-required component yet -> DRAFT.
        await request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: statusSubject.id, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: draftScored.id, rawScore: 10 }] });

        // neverScored: no student_scores row at all for this subject -> DRAFT (default).

        const response = await request(app.getHttpServer())
          .get("/api/v1/grades/grid")
          .query({ classArmId: jss2AArmId, subjectId: statusSubject.id, componentId: ca1Id, termId: sunriseTermId })
          .set(auth(sunriseAdminToken));
        expect(response.status).toBe(200);

        const byStudent = new Map(response.body.rows.map((r: { studentId: string; status: string }) => [r.studentId, r.status]));
        expect(byStudent.get(published.id)).toBe("PUBLISHED");
        expect(byStudent.get(draftScored.id)).toBe("DRAFT");
        expect(byStudent.get(neverScored.id)).toBe("DRAFT");
      } finally {
        await prisma.studentScore.deleteMany({ where: { subjectId: statusSubject.id } });
        await prisma.termSubjectResult.deleteMany({ where: { subjectId: statusSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: statusSubject.id } });
        await prisma.subject.delete({ where: { id: statusSubject.id } });
      }
    });

    it("SCHOOL_ADMIN can load the grid for any class", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: jss1AArmId, subjectId: englishId, componentId: ca1Id, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.rows.length).toBe(jss1ARoster.length);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: jss1AArmId, subjectId: mathematicsId, componentId: ca1Id, termId: sunriseTermId });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER on a same-tenant class/subject they aren't assigned to", async () => {
      // teacher@sunrise.test teaches Mathematics, not English.
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: jss1AArmId, subjectId: englishId, componentId: ca1Id, termId: sunriseTermId })
        .set(auth(sunriseMathTeacherToken));
      expect(response.status).toBe(403);
    });

    it("404s (not 403) when Sunrise's admin reaches for Hillcrest's grid", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, componentId: hillcrestComponentId, termId: hillcrestTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(404);
    });

    it("404s (not 403) when Hillcrest's admin reaches for Sunrise's grid", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: jss1AArmId, subjectId: mathematicsId, componentId: ca1Id, termId: sunriseTermId })
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });

    it("404s a nonexistent id within the caller's own tenant", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: "00000000-0000-0000-0000-000000000000", subjectId: mathematicsId, componentId: ca1Id, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(404);
    });

    it("400s on a missing query param", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: jss1AArmId, subjectId: mathematicsId, componentId: ca1Id })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(400);
    });

    it("400s on a malformed query param", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: "not-a-uuid", subjectId: mathematicsId, componentId: ca1Id, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(400);
    });
  });

  describe("PUT /grades/grid", () => {
    it("happy path: saves a small subset and recomputes term_subject_results", async () => {
      const subset = jss2ARoster.slice(0, 3);
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          componentId: ca1Id,
          termId: sunriseTermId,
          scores: subset.map((s) => ({ studentId: s.id, rawScore: 14 })),
        });
      expect(response.status).toBe(200);
      expect(response.body.savedCount).toBe(3);
      expect(response.body.rows).toHaveLength(3);
      for (const row of response.body.rows) {
        expect(row.rawScore).toBe(14);
        // CA1: weight 20, maxScore 20 -> 14/20*20 = 14, others missing = 0.
        expect(row.totalScore).toBe(14);
        expect(row.status).toBe("DRAFT");
      }

      const persisted = await prisma.studentScore.findMany({
        where: { subjectId: scratchSubjectId, componentId: ca1Id, studentId: { in: subset.map((s) => s.id) } },
      });
      expect(persisted).toHaveLength(3);
    });

    it("writes exactly one audit_logs row for the bulk save", async () => {
      const [student] = jss2ARoster.slice(3, 4);
      const before = await prisma.auditLog.count({ where: { schoolId: sunriseId, action: "grades.saveGrid" } });
      await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          componentId: ca1Id,
          termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 10 }],
        });
      const after = await prisma.auditLog.count({ where: { schoolId: sunriseId, action: "grades.saveGrid" } });
      expect(after).toBe(before + 1);

      const log = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.saveGrid" },
        orderBy: { createdAt: "desc" },
      });
      expect(log?.entityType).toBe("grades");
      expect(log?.entityId).toBe(jss2AArmId);
      expect((log?.metadata as { subjectId: string }).subjectId).toBe(scratchSubjectId);
    });

    it("missing components count as 0 (not rescaled)", async () => {
      const [student] = jss2ARoster.slice(4, 5);
      await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          componentId: ca1Id,
          termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 15 }],
        });

      const result = await prisma.termSubjectResult.findUniqueOrThrow({
        where: {
          studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: scratchSubjectId, termId: sunriseTermId, sessionId: sunriseSessionId },
        },
      });
      // Only CA1 (weight 20, maxScore 20) has a score: 15/20*20 = 15. CA2
      // and Exam are entirely unscored for this student/subject and
      // contribute 0 each, not a rescale to CA1's own 100%.
      expect(Number(result.totalScore)).toBe(15);
      expect(result.status).toBe("DRAFT");
      expect(result.autoGrade).toBe("F9"); // WAEC: 0-39
    });

    it("scoring the approval-required component flips status to PENDING_APPROVAL", async () => {
      const [student] = jss2ARoster.slice(5, 6);
      const before = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 10 }],
        });
      expect(before.body.rows[0].status).toBe("DRAFT");

      const after = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: examId, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 50 }],
        });
      expect(after.status).toBe(200);
      expect(after.body.rows[0].status).toBe("PENDING_APPROVAL");
      // 10/20*20 + 50/100*60 = 10 + 30 = 40.
      expect(after.body.rows[0].totalScore).toBe(40);
    });

    it("re-saving a non-approval component after PENDING_APPROVAL does not reset status to DRAFT", async () => {
      const [student] = jss2ARoster.slice(6, 7);
      await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 10 }],
        });
      const scored = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: examId, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 50 }],
        });
      expect(scored.body.rows[0].status).toBe("PENDING_APPROVAL");

      // Re-save CA1 with a different value — Exam is untouched by this
      // call, so status must recompute from the CURRENT state (Exam still
      // scored), not reset just because this particular write wasn't the
      // approval-required component. A regression here would silently
      // un-gate a result that should still require director/owner
      // approval (step 3).
      const resaved = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 15 }],
        });
      expect(resaved.status).toBe(200);
      expect(resaved.body.rows[0].status).toBe("PENDING_APPROVAL");
      // 15/20*20 + 50/100*60 = 15 + 30 = 45.
      expect(resaved.body.rows[0].totalScore).toBe(45);

      const persisted = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: scratchSubjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(persisted.status).toBe("PENDING_APPROVAL");
    });

    it("the ~100-student JSS 2 A bulk save writes and computes every row in one transaction", async () => {
      const start = Date.now();
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseMathTeacherToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          componentId: ca1Id,
          termId: sunriseTermId,
          scores: jss2ARoster.map((s, i) => ({ studentId: s.id, rawScore: 5 + (i % 16) })),
        });
      const elapsedMs = Date.now() - start;
      // eslint-disable-next-line no-console
      console.log(`[grades-grid] ~100-student bulk save: ${elapsedMs}ms for ${jss2ARoster.length} students`);
      expect(response.status).toBe(200);
      expect(response.body.savedCount).toBe(jss2ARoster.length);
      expect(response.body.rows).toHaveLength(jss2ARoster.length);
      expect(elapsedMs).toBeLessThan(5000);

      const scoreCount = await prisma.studentScore.count({ where: { subjectId: scratchSubjectId, componentId: ca1Id } });
      expect(scoreCount).toBe(jss2ARoster.length);
      const resultCount = await prisma.termSubjectResult.count({ where: { subjectId: scratchSubjectId } });
      expect(resultCount).toBe(jss2ARoster.length);
    });

    it("re-sending the identical 100-student payload is idempotent", async () => {
      const beforeScores = await prisma.studentScore.count({ where: { subjectId: scratchSubjectId, componentId: ca1Id } });
      const beforeResults = await prisma.termSubjectResult.count({ where: { subjectId: scratchSubjectId } });

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseMathTeacherToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          componentId: ca1Id,
          termId: sunriseTermId,
          scores: jss2ARoster.map((s, i) => ({ studentId: s.id, rawScore: 5 + (i % 16) })),
        });
      expect(response.status).toBe(200);

      const afterScores = await prisma.studentScore.count({ where: { subjectId: scratchSubjectId, componentId: ca1Id } });
      const afterResults = await prisma.termSubjectResult.count({ where: { subjectId: scratchSubjectId } });
      expect(afterScores).toBe(beforeScores);
      expect(afterResults).toBe(beforeResults);

      const sample = jss2ARoster[0];
      const persisted = await prisma.studentScore.findUniqueOrThrow({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: sample.id, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });
      expect(Number(persisted.rawScore)).toBe(5);
    });

    it("400s a rawScore above this component's actual max_score, writing nothing", async () => {
      const [student] = jss2ARoster.slice(10, 11);
      const before = await prisma.studentScore.findUnique({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student.id, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId,
          subjectId: scratchSubjectId,
          componentId: ca1Id, // max_score 20
          termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 25 }],
        });
      expect(response.status).toBe(400);

      const after = await prisma.studentScore.findUnique({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student.id, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });
      expect(after?.rawScore?.toString()).toBe(before?.rawScore?.toString());
    });

    it("accepts a rawScore above 100 when the component's own max_score allows it", async () => {
      // Nothing in the real seeded/assessment-components-validated set
      // exceeds 100 (PUT /assessment-components caps max_score at 100),
      // so this component is created directly, bypassing that endpoint —
      // the point is proving GradesService checks the ACTUAL component
      // row, not a hardcoded 100, which a DTO-level @Max(100) would have
      // silently violated.
      const highMaxComponent = await prisma.assessmentComponent.create({
        data: { schoolId: sunriseId, name: "E2E High Max", weight: 1, sortOrder: 99, maxScore: 120, requiresApproval: false },
      });
      try {
        const [student] = jss2ARoster.slice(7, 8);
        const response = await request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({
            classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: highMaxComponent.id, termId: sunriseTermId,
            scores: [{ studentId: student.id, rawScore: 110 }],
          });
        expect(response.status).toBe(200);
        expect(response.body.rows[0].rawScore).toBe(110);
      } finally {
        await prisma.studentScore.deleteMany({ where: { componentId: highMaxComponent.id } });
        await prisma.assessmentComponent.delete({ where: { id: highMaxComponent.id } });
      }
    });

    it("400s a negative rawScore", async () => {
      const [student] = jss2ARoster.slice(10, 11);
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: -1 }],
        });
      expect(response.status).toBe(400);
    });

    it("400s a studentId not enrolled in this class arm", async () => {
      const foreignStudent = jss1ARoster[0]; // enrolled in JSS 1 A, not JSS 2 A
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: foreignStudent.id, rawScore: 10 }],
        });
      expect(response.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, scores: [] });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER writing to a same-tenant class/subject they aren't assigned to", async () => {
      // teacher2@sunrise.test teaches English only — no assignment on the scratch subject.
      const [student] = jss2ARoster.slice(0, 1);
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseEnglishTeacherToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 10 }],
        });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) a cross-tenant write — Sunrise admin targeting Hillcrest's grid", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, componentId: hillcrestComponentId, termId: hillcrestTermId,
          scores: [{ studentId: "00000000-0000-0000-0000-000000000000", rawScore: 10 }],
        });
      expect(response.status).toBe(404);
    });

    it("404s (not 403) a cross-tenant write — Hillcrest admin targeting Sunrise's grid", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(hillcrestAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: "00000000-0000-0000-0000-000000000000", rawScore: 10 }],
        });
      expect(response.status).toBe(404);
    });

    // SPEC_V0.5.1.md §2.5, v0.5.1 step 4: SCHOOL_ADMIN/PROPRIETOR now pass
    // this gate (see mark-absent-after-publish.e2e-spec.ts for that full
    // flow, scratch-isolated) — TEACHER still 409s here unconditionally,
    // exactly as before this step. Uses the English teacher specifically
    // (not the admin token this test used pre-step-4), since that's the
    // role this lock still actually blocks.
    it("409s a TEACHER's write against the real, seeded PUBLISHED JSS 1 A English result, leaving it unchanged", async () => {
      const [student] = jss1ARoster;
      const before = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: englishId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(before.status).toBe("PUBLISHED");

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseEnglishTeacherToken))
        .send({
          classArmId: jss1AArmId, subjectId: englishId, componentId: ca1Id, termId: sunriseTermId,
          scores: [{ studentId: student.id, rawScore: 1 }],
        });
      expect(response.status).toBe(409);
      expect(response.body.lockedStudentIds).toEqual([student.id]);

      const after = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: englishId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(after).toEqual(before);
    });

    it("concurrent saves to different components for the same student don't lose an update", async () => {
      const [student] = jss2ARoster.slice(50, 51);

      const [responseA, responseB] = await Promise.all([
        request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({
            classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId,
            scores: [{ studentId: student.id, rawScore: 12 }],
          }),
        request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseMathTeacherToken))
          .send({
            classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca2Id, termId: sunriseTermId,
            scores: [{ studentId: student.id, rawScore: 8 }],
          }),
      ]);
      expect(responseA.status).toBe(200);
      expect(responseB.status).toBe(200);

      const result = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: scratchSubjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      // CA1 12/20*20=12, CA2 8/20*20=8 — both writes must be reflected, not
      // whichever transaction happened to read student_scores last.
      expect(Number(result.totalScore)).toBe(20);
    });
  });

  describe("PUT /grades/grid — absent (SPEC_V0.5.md §2.1, v0.5 step 2)", () => {
    it("marking a student absent persists (rawScore null, isAbsent true) and flows through the existing recompute — excluded from the total, and an absent EXAM reaches PENDING_APPROVAL", async () => {
      const [student] = jss2ARoster.slice(70, 71);
      await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 15 }] });

      const absentRes = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: examId, termId: sunriseTermId, scores: [{ studentId: student.id, isAbsent: true }] });
      expect(absentRes.status).toBe(200);
      const row = absentRes.body.rows[0];
      expect(row.rawScore).toBeNull();
      expect(row.isAbsent).toBe(true);
      // Absent is a DECIDED outcome for the approval-required component
      // (step 1's computeSubjectStatus extension) — PENDING_APPROVAL, not
      // stuck in DRAFT. Total excludes the absent Exam entirely: only CA1
      // counts, 15/20*20=15 — NOT a 0 and NOT rescaled.
      expect(row.status).toBe("PENDING_APPROVAL");
      expect(row.totalScore).toBe(15);

      const persisted = await prisma.studentScore.findUniqueOrThrow({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student.id, subjectId: scratchSubjectId, componentId: examId, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });
      expect(persisted.rawScore).toBeNull();
      expect(persisted.isAbsent).toBe(true);
    });

    it("a real score entered after a prior absent mark clears isAbsent back to false (not left stale)", async () => {
      const [student] = jss2ARoster.slice(71, 72);
      const absentRes = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: student.id, isAbsent: true }] });
      expect(absentRes.body.rows[0].isAbsent).toBe(true);
      expect(absentRes.body.rows[0].rawScore).toBeNull();

      const scoredRes = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 18 }] });
      expect(scoredRes.status).toBe(200);
      expect(scoredRes.body.rows[0].rawScore).toBe(18);
      expect(scoredRes.body.rows[0].isAbsent).toBe(false);

      // Not just the response echo — the persisted row itself, which is
      // what the DB CHECK constraint actually guards. A stale isAbsent:
      // true left behind here alongside the new rawScore would violate
      // student_scores_raw_score_or_absent_check.
      const persisted = await prisma.studentScore.findUniqueOrThrow({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student.id, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });
      expect(Number(persisted.rawScore)).toBe(18);
      expect(persisted.isAbsent).toBe(false);
    });

    it("marking absent after a prior real score clears rawScore to null (the other direction)", async () => {
      const [student] = jss2ARoster.slice(72, 73);
      const scoredRes = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 12 }] });
      expect(scoredRes.body.rows[0].rawScore).toBe(12);
      expect(scoredRes.body.rows[0].isAbsent).toBe(false);

      const absentRes = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: student.id, isAbsent: true }] });
      expect(absentRes.status).toBe(200);
      expect(absentRes.body.rows[0].rawScore).toBeNull();
      expect(absentRes.body.rows[0].isAbsent).toBe(true);

      const persisted = await prisma.studentScore.findUniqueOrThrow({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student.id, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });
      expect(persisted.rawScore).toBeNull();
      expect(persisted.isAbsent).toBe(true);
    });

    it("400s a payload with both rawScore and isAbsent set, writing nothing (DTO-level mutual exclusion)", async () => {
      // ca1Id at ANY index already has a row by this point in the file (the
      // ~100-student bulk save test above touches every student) — so
      // "writing nothing" is proven by before/after EQUALITY, not by
      // assuming no prior row, same pattern as the existing "400s a
      // rawScore above max_score" test above.
      const [student] = jss2ARoster.slice(73, 74);
      const before = await prisma.studentScore.findUnique({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student.id, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 10, isAbsent: true }] });
      expect(response.status).toBe(400);

      const after = await prisma.studentScore.findUnique({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student.id, subjectId: scratchSubjectId, componentId: ca1Id, termId: sunriseTermId, sessionId: sunriseSessionId,
          },
        },
      });
      expect(after).toEqual(before);
    });

    it("GET /grades/grid round-trips isAbsent alongside a normally-scored classmate in the same response", async () => {
      const [absentStudent, scoredStudent] = jss2ARoster.slice(74, 76);
      await request(app.getHttpServer())
        .put("/api/v1/grades/grid")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: examId, termId: sunriseTermId,
          scores: [{ studentId: absentStudent.id, isAbsent: true }, { studentId: scoredStudent.id, rawScore: 45 }],
        });

      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/grid")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, componentId: examId, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      const rows = response.body.rows as Array<{ studentId: string; rawScore: number | null; isAbsent: boolean }>;
      const absentRow = rows.find((r) => r.studentId === absentStudent.id);
      const scoredRow = rows.find((r) => r.studentId === scoredStudent.id);
      expect(absentRow?.isAbsent).toBe(true);
      expect(absentRow?.rawScore).toBeNull();
      expect(scoredRow?.isAbsent).toBe(false);
      expect(scoredRow?.rawScore).toBe(45);
    });

    it("the DB CHECK constraint still rejects a hand-crafted both-set row, entirely bypassing the DTO", async () => {
      // A canary against a future regression removing/weakening
      // student_scores_raw_score_or_absent_check — goes straight through
      // Prisma, never through the DTO's own mutual-exclusion validator
      // proven above, so this is the last line of defense, not the first.
      const canaryComponent = await prisma.assessmentComponent.create({
        data: { schoolId: sunriseId, name: "E2E CHECK Canary", weight: 1, sortOrder: 97, maxScore: 100, requiresApproval: false },
      });
      try {
        const [student] = jss2ARoster.slice(76, 77);
        const admin = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "admin@sunrise.test" } });
        await expect(
          prisma.studentScore.create({
            data: {
              schoolId: sunriseId,
              studentId: student.id,
              subjectId: scratchSubjectId,
              componentId: canaryComponent.id,
              sessionId: sunriseSessionId,
              termId: sunriseTermId,
              classArmId: jss2AArmId,
              rawScore: 50,
              isAbsent: true,
              enteredBy: admin.id,
              enteredAt: new Date(),
            },
          }),
        ).rejects.toThrow();
      } finally {
        await prisma.studentScore.deleteMany({ where: { componentId: canaryComponent.id } });
        await prisma.assessmentComponent.delete({ where: { id: canaryComponent.id } });
      }
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
