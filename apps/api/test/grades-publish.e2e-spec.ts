import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// All scratch fixtures in this suite live in Sunrise's JSS 2 B — confirmed
// untouched by prisma/seed.ts (only JSS 1 A / JSS 2 A get real Math/English
// data). This matters more here than in step 2's suite: publish/unpublish
// recompute term_overall_results across the WHOLE class arm + term, merging
// in EVERY subject a student has — reusing a real, already-scored class arm
// (like JSS 2 A) would pull step 1's hand-verified Math/English data into
// every overall computation this suite triggers, corrupting it.
describe("Grades publish/unpublish/override (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let hillcrestProprietorToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let scratchArmId: string; // JSS 2 B
  // A second, dedicated scratch class arm for tests that assert on
  // ABSOLUTE overall_position values. term_overall_results ranking is
  // scoped to the whole (classArmId, termId) — every subject any student
  // in the arm has ever been scored in — so it's not enough to isolate by
  // subject the way per-subject position tests are; every OTHER test in
  // this file that scores a student in scratchArmId would otherwise
  // pollute the same ranking pool. This arm is used ONLY by the "Overall
  // cascade" and "two concurrent publishes" tests.
  let overallArmId: string;
  // Two more dedicated arms for the gap-#2 fix's tests (saveGrid
  // triggering an overall recompute) — same isolation reasoning as
  // overallArmId above, kept SEPARATE from it (not reused) so this suite's
  // pre-existing absolute-position tests never see gap-#2's students, and
  // vice versa. gapTwoArmId: the stale-rank reproduction + hot-path no-op
  // tests (order-independent, relative positions only). gapTwoConcurrencyArmId:
  // the concurrency test alone, since it needs a clean, fully predictable
  // ranked cohort to assert an exact final position against.
  let gapTwoArmId: string;
  let gapTwoConcurrencyArmId: string;
  let ca1Id: string; // weight 20, max_score 20, requiresApproval false
  let examId: string; // weight 60, max_score 100, requiresApproval true
  let ca2Id: string; // weight 20, max_score 20, requiresApproval false

  // Real, cross-tenant fixtures for the "attempt and reject" 404 tests —
  // non-mutating by design, so no isolation needed; reuses step 1's
  // hand-verified seed data directly, same as step 2's suite.
  let hillcrestId: string;
  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestTermId: string;
  let sunrisePublishedResultId: string; // JSS 1 A English, PUBLISHED
  let hillcrestPublishedResultId: string; // Hillcrest's published slice

  const createdStudentIds: string[] = [];
  const createdSubjectIds: string[] = [];
  let hillcrestScratchProprietorId: string | null = null;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createScratchStudents(count: number, prefix: string, classArmId: string = scratchArmId): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-PUB/${prefix}/${i}`,
          firstName: `${prefix}`,
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+234800${prefix.length}${String(i).padStart(6, "0")}`,
        },
      });
      await prisma.studentEnrollment.create({
        data: { schoolId: sunriseId, studentId: student.id, classArmId, sessionId: sunriseSessionId },
      });
      createdStudentIds.push(student.id);
      ids.push(student.id);
    }
    return ids;
  }

  async function createScratchSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  async function scoreComponent(
    token: string,
    subjectId: string,
    componentId: string,
    scores: { studentId: string; rawScore: number }[],
    classArmId: string = scratchArmId,
  ) {
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(token))
      .send({ classArmId, subjectId, componentId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`scoreComponent failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;

    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    scratchArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "B" } })).id;
    overallArmId = (
      await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-Overall-${Date.now()}` } })
    ).id;
    gapTwoArmId = (
      await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-Gap2-${Date.now()}` } })
    ).id;
    gapTwoConcurrencyArmId = (
      await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-Gap2Conc-${Date.now()}` } })
    ).id;

    const components = await prisma.assessmentComponent.findMany({
      where: { schoolId: sunriseId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    ca1Id = components[0].id;
    ca2Id = components[1].id;
    examId = components[2].id;

    // Cross-tenant fixtures: real, hand-verified seed data (non-mutating
    // usage only in this suite).
    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "Mathematics" } })).id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;

    const sunriseEnglishId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "English Language" } })).id;
    const sunriseJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    const sunriseJss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: sunriseJss1.id, name: "A" } })).id;
    sunrisePublishedResultId = (
      await prisma.termSubjectResult.findFirstOrThrow({
        where: { schoolId: sunriseId, classArmId: sunriseJss1AArmId, subjectId: sunriseEnglishId, termId: sunriseTermId, status: "PUBLISHED" },
      })
    ).id;
    hillcrestPublishedResultId = (
      await prisma.termSubjectResult.findFirstOrThrow({
        where: { schoolId: hillcrestId, classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId, status: "PUBLISHED" },
      })
    ).id;

    // Hillcrest has no seeded PROPRIETOR (only admin@hillcrest.test /
    // SCHOOL_ADMIN) — unpublish is PROPRIETOR-only, so a genuine
    // cross-tenant 404 test in that direction needs one. Created directly
    // (bypassing personnel/auth flows, matching this suite's other direct
    // Prisma fixtures) and torn down in afterAll.
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4); // low cost — test-only, not a real credential
    const scratchProprietor = await prisma.user.create({
      data: {
        schoolId: hillcrestId,
        email: "e2e.scratch.proprietor@hillcrest.test",
        passwordHash,
        firstName: "E2E",
        lastName: "ScratchProprietor",
        role: UserRole.PROPRIETOR,
      },
    });
    hillcrestScratchProprietorId = scratchProprietor.id;
    hillcrestProprietorToken = await loginAs(app, "e2e.scratch.proprietor@hillcrest.test", "hillcrest");
  });

  afterAll(async () => {
    if (createdSubjectIds.length > 0) {
      await prisma.studentScore.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.termSubjectResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    }
    if (createdStudentIds.length > 0) {
      await prisma.termOverallResult.deleteMany({ where: { studentId: { in: createdStudentIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
      await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    }
    if (overallArmId) {
      await prisma.classArm.delete({ where: { id: overallArmId } });
    }
    if (gapTwoArmId) {
      await prisma.classArm.delete({ where: { id: gapTwoArmId } });
    }
    if (gapTwoConcurrencyArmId) {
      await prisma.classArm.delete({ where: { id: gapTwoConcurrencyArmId } });
    }
    if (hillcrestScratchProprietorId) {
      // Real login flow (loginAs) issued a refresh token for this user —
      // must go before the user row itself (refresh_tokens.user_id FK).
      await prisma.refreshToken.deleteMany({ where: { userId: hillcrestScratchProprietorId } });
      await prisma.user.delete({ where: { id: hillcrestScratchProprietorId } });
    }
    await app.close();
  });

  describe("POST /grades/publish", () => {
    it("happy path with a deliberate tie: shares a position, next rank skips", async () => {
      const subjectId = await createScratchSubject("E2E Publish Tie");
      const [s0, s1, s2] = await createScratchStudents(3, "Tie");

      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [
        { studentId: s0, rawScore: 20 },
        { studentId: s1, rawScore: 20 },
        { studentId: s2, rawScore: 5 },
      ]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [
        { studentId: s0, rawScore: 100 },
        { studentId: s1, rawScore: 100 },
        { studentId: s2, rawScore: 25 },
      ]);
      // s0, s1: 20 + 60 = 80 (tied). s2: 5 + 15 = 20.

      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken)) // SCHOOL_ADMIN may publish
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });

      expect(response.status).toBe(200);
      expect(response.body.publishedCount).toBe(3);
      interface PositionRow {
        studentId: string;
        totalScore: number;
        finalGrade: string | null;
        subjectPosition: number;
      }
      const byStudent = new Map<string, PositionRow>(
        response.body.subjectPositions.map((r: PositionRow) => [r.studentId, r]),
      );
      expect(byStudent.get(s0)?.subjectPosition).toBe(1);
      expect(byStudent.get(s1)?.subjectPosition).toBe(1);
      expect(byStudent.get(s2)?.subjectPosition).toBe(3); // skips 2, standard competition ranking
      expect(byStudent.get(s0)?.totalScore).toBe(80);
      expect(byStudent.get(s2)?.totalScore).toBe(20);

      const persisted = await prisma.termSubjectResult.findMany({ where: { subjectId }, orderBy: { subjectPosition: "asc" } });
      for (const row of persisted) {
        expect(row.status).toBe("PUBLISHED");
        expect(row.publishedAt).not.toBeNull();
      }

      const auditLog = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.publish", entityId: scratchArmId },
        orderBy: { createdAt: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect((auditLog?.metadata as { subjectId: string }).subjectId).toBe(subjectId);
      expect((auditLog?.metadata as { publishedCount: number }).publishedCount).toBe(3);
    });

    it("409s with no rows pending and none published (nothing to do)", async () => {
      const subjectId = await createScratchSubject("E2E Publish Empty");
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to publish/i);
    });

    it("re-publishing an already-fully-published subject is an idempotent 200 (publishedCount: 0)", async () => {
      const subjectId = await createScratchSubject("E2E Publish Idempotent");
      const [s0] = await createScratchStudents(1, "Idem");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 20 }]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: 100 }]);
      const first = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(first.status).toBe(200);
      expect(first.body.publishedCount).toBe(1);

      const second = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(second.status).toBe(200);
      expect(second.body.publishedCount).toBe(0);
      expect(second.body.subjectPositions).toHaveLength(1);
    });

    it("403s a TEACHER (categorical — publish is director/owner only)", async () => {
      const subjectId = await createScratchSubject("E2E Publish TeacherReject");
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseTeacherToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(response.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .send({ classArmId: scratchArmId, subjectId: ca1Id, termId: sunriseTermId });
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(hillcrestAdminToken))
        .send({ classArmId: scratchArmId, subjectId: ca1Id, termId: sunriseTermId });
      expect(b.status).toBe(404);
    });
  });

  describe("POST /grades/unpublish", () => {
    it("happy path (PROPRIETOR): reverts to PENDING_APPROVAL, clears position and published_at", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish Happy");
      const [s0] = await createScratchStudents(1, "Unpub");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 20 }]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: 100 }]);

      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(publishRes.status).toBe(200);

      // SCHOOL_ADMIN can publish but not unpublish — owner-only.
      const adminAttempt = await request(app.getHttpServer())
        .post("/api/v1/grades/unpublish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(adminAttempt.status).toBe(403);

      const unpublishRes = await request(app.getHttpServer())
        .post("/api/v1/grades/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(unpublishRes.status).toBe(200);
      expect(unpublishRes.body.unpublishedCount).toBe(1);

      const reverted = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(reverted.status).toBe("PENDING_APPROVAL");
      expect(reverted.subjectPosition).toBeNull();
      expect(reverted.publishedAt).toBeNull();
      expect(Number(reverted.totalScore)).toBe(80); // unaffected — unpublish doesn't touch scores

      const auditLog = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.unpublish", entityId: scratchArmId },
        orderBy: { createdAt: "desc" },
      });
      expect((auditLog?.metadata as { unpublishedCount: number }).unpublishedCount).toBe(1);
    });

    it("409s when nothing is currently published for this subject", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish Empty");
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to unpublish/i);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .post("/api/v1/grades/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .post("/api/v1/grades/unpublish")
        .set(auth(hillcrestProprietorToken))
        .send({ classArmId: scratchArmId, subjectId: ca1Id, termId: sunriseTermId });
      expect(b.status).toBe(404);
    });
  });

  describe("PUT /grades/override", () => {
    it("allowed while PENDING_APPROVAL by SCHOOL_ADMIN", async () => {
      const subjectId = await createScratchSubject("E2E Override Pending");
      const [s0] = await createScratchStudents(1, "OvrPending");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 15 }]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: 60 }]);
      // total = 15 + 36 = 51 -> C6 (50-54)

      const row = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(row.status).toBe("PENDING_APPROVAL");
      expect(row.autoGrade).toBe("C6");

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseAdminToken))
        .send({ termSubjectResultId: row.id, overrideGrade: "A1" });
      expect(response.status).toBe(200);
      expect(response.body.overrideGrade).toBe("A1");
      expect(response.body.autoGrade).toBe("C6");
      expect(response.body.finalGrade).toBe("A1");
    });

    it("409s while DRAFT — total isn't final yet", async () => {
      const subjectId = await createScratchSubject("E2E Override Draft");
      const [s0] = await createScratchStudents(1, "OvrDraft");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 15 }]);
      // No exam score -> DRAFT.

      const row = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(row.status).toBe("DRAFT");

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseAdminToken))
        .send({ termSubjectResultId: row.id, overrideGrade: "A1" });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/isn't final/i);
    });

    it("regression: PENDING_APPROVAL -> DRAFT (exam score cleared) nulls a stored override, not just leaves it stale", async () => {
      const subjectId = await createScratchSubject("E2E Override Regression");
      const [s0] = await createScratchStudents(1, "OvrRegress");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 15 }]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: 60 }]);

      const pending = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      const overrideRes = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseAdminToken))
        .send({ termSubjectResultId: pending.id, overrideGrade: "A1" });
      expect(overrideRes.status).toBe(200);
      expect(overrideRes.body.overrideGrade).toBe("A1");

      // Clear the approval-required (exam) score -> reverts to DRAFT.
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: null as unknown as number }]);

      const reverted = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(reverted.status).toBe("DRAFT");
      expect(reverted.overrideGrade).toBeNull();
      expect(reverted.finalGrade).toBe(reverted.autoGrade); // no longer overridden
    });

    it("on a PUBLISHED result: SCHOOL_ADMIN 403s, PROPRIETOR 200s and position is unchanged", async () => {
      const subjectId = await createScratchSubject("E2E Override Published");
      const [s0] = await createScratchStudents(1, "OvrPublished");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 15 }]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: 60 }]);
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      const publishedPosition = publishRes.body.subjectPositions[0].subjectPosition;

      const row = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(row.status).toBe("PUBLISHED");

      const adminAttempt = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseAdminToken))
        .send({ termSubjectResultId: row.id, overrideGrade: "B2" });
      expect(adminAttempt.status).toBe(403);

      const ownerAttempt = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseProprietorToken))
        .send({ termSubjectResultId: row.id, overrideGrade: "B2" });
      expect(ownerAttempt.status).toBe(200);
      expect(ownerAttempt.body.finalGrade).toBe("B2");
      expect(ownerAttempt.body.autoGrade).toBe(row.autoGrade); // unchanged

      const afterOverride = await prisma.termSubjectResult.findUniqueOrThrow({ where: { id: row.id } });
      expect(afterOverride.subjectPosition).toBe(publishedPosition); // override never touches ranking

      const auditLog = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.override", entityId: row.id },
        orderBy: { createdAt: "desc" },
      });
      const metadata = auditLog?.metadata as { oldOverrideGrade: string | null; newOverrideGrade: string | null };
      expect(metadata.oldOverrideGrade).toBeNull();
      expect(metadata.newOverrideGrade).toBe("B2");
    });

    it("rejects an overrideGrade not in the school's grading scale", async () => {
      const subjectId = await createScratchSubject("E2E Override InvalidGrade");
      const [s0] = await createScratchStudents(1, "OvrInvalid");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 15 }]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: 60 }]);
      const row = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseAdminToken))
        .send({ termSubjectResultId: row.id, overrideGrade: "Z9" });
      expect(response.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .send({ termSubjectResultId: sunrisePublishedResultId, overrideGrade: "A1" });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER (categorical)", async () => {
      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseTeacherToken))
        .send({ termSubjectResultId: sunrisePublishedResultId, overrideGrade: "A1" });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseProprietorToken))
        .send({ termSubjectResultId: hillcrestPublishedResultId, overrideGrade: "A1" });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(hillcrestProprietorToken))
        .send({ termSubjectResultId: sunrisePublishedResultId, overrideGrade: "A1" });
      expect(b.status).toBe(404);
    });
  });

  describe("Overall cascade + positions", () => {
    it("partial-term: a student missing one subject's publish is excluded from overall ranking entirely", async () => {
      const soloSubjectId = await createScratchSubject("E2E Overall Solo");
      const sharedSubjectId = await createScratchSubject("E2E Overall Shared");
      const extraSubjectId = await createScratchSubject("E2E Overall Extra");
      const [p, t, q, r] = await createScratchStudents(4, "Overall", overallArmId);

      // T, Q, R all take the shared subject.
      await scoreComponent(
        sunriseAdminToken,
        sharedSubjectId,
        ca1Id,
        [
          { studentId: t, rawScore: 15 },
          { studentId: q, rawScore: 10 },
          { studentId: r, rawScore: 12 },
        ],
        overallArmId,
      );
      await scoreComponent(
        sunriseAdminToken,
        sharedSubjectId,
        examId,
        [
          { studentId: t, rawScore: 75 },
          { studentId: q, rawScore: 50 },
          { studentId: r, rawScore: 60 },
        ],
        overallArmId,
      );
      // T: 15+45=60. Q: 10+30=40. R: 12+36=48.

      // R ALSO has a second subject, scored but never published — this is
      // what keeps R's overall genuinely incomplete (not just "R only
      // takes 1 subject", which — per term_overall_results.subjects_count
      // being a count of EXISTING rows, not a curriculum size — would
      // legitimately read as "complete" with only 1 subject).
      await scoreComponent(sunriseAdminToken, extraSubjectId, ca1Id, [{ studentId: r, rawScore: 10 }], overallArmId);
      await scoreComponent(sunriseAdminToken, extraSubjectId, examId, [{ studentId: r, rawScore: 40 }], overallArmId);
      // R's extra subject: 10+24=34, left PENDING_APPROVAL (never published).

      const sharedPublish = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: overallArmId, subjectId: sharedSubjectId, termId: sunriseTermId });
      expect(sharedPublish.status).toBe(200);
      expect(sharedPublish.body.publishedCount).toBe(3);

      // P takes only the solo subject.
      await scoreComponent(sunriseAdminToken, soloSubjectId, ca1Id, [{ studentId: p, rawScore: 20 }], overallArmId);
      await scoreComponent(sunriseAdminToken, soloSubjectId, examId, [{ studentId: p, rawScore: 100 }], overallArmId);
      // P: 20+60=80.
      const soloPublish = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: overallArmId, subjectId: soloSubjectId, termId: sunriseTermId });
      expect(soloPublish.status).toBe(200);

      const [pOverall, tOverall, qOverall, rOverall] = await Promise.all(
        [p, t, q, r].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );

      expect(pOverall.status).toBe("PUBLISHED");
      expect(Number(pOverall.averageScore)).toBe(80);
      expect(pOverall.overallPosition).toBe(1);

      expect(tOverall.status).toBe("PUBLISHED");
      expect(Number(tOverall.averageScore)).toBe(60);
      expect(tOverall.overallPosition).toBe(2);

      expect(qOverall.status).toBe("PUBLISHED");
      expect(Number(qOverall.averageScore)).toBe(40);
      expect(qOverall.overallPosition).toBe(3);

      // R: excluded — subjects_count is 2 (shared + extra), but only 1 of
      // 2 is published, so overall stays PENDING_APPROVAL with NO leaked
      // position, even though R's own shared-subject result IS published.
      expect(rOverall.status).toBe("PENDING_APPROVAL");
      expect(rOverall.subjectsCount).toBe(2);
      expect(rOverall.overallPosition).toBeNull();

      // Unpublishing the solo subject removes ONLY P from the published
      // cohort (T/Q never touched it) — the remaining cohort re-ranks:
      // T and Q both shift up one place.
      const unpublishSolo = await request(app.getHttpServer())
        .post("/api/v1/grades/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: overallArmId, subjectId: soloSubjectId, termId: sunriseTermId });
      expect(unpublishSolo.status).toBe(200);
      expect(unpublishSolo.body.overallRevertedCount).toBe(1); // only P

      const [pAfter, tAfter, qAfter] = await Promise.all(
        [p, t, q].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );
      expect(pAfter.status).toBe("PENDING_APPROVAL");
      expect(pAfter.overallPosition).toBeNull();
      expect(tAfter.status).toBe("PUBLISHED");
      expect(tAfter.overallPosition).toBe(1); // was 2, shifted up
      expect(qAfter.status).toBe("PUBLISHED");
      expect(qAfter.overallPosition).toBe(2); // was 3, shifted up
    });
  });

  // Gap #2 (docs/DECISIONS.md, fixed this step): saveGrid creating a
  // student's FIRST-EVER term_subject_result for a subject, while that
  // student's term_overall_result is currently PUBLISHED, must revert the
  // overall to PENDING_APPROVAL and re-rank the shrunken published
  // cohort — not leave a stale PUBLISHED status/position behind.
  describe("saveGrid triggering an overall recompute (gap #2 fix)", () => {
    it("stale-rank reproduction: a brand-new subject for a published-overall student reverts their overall and re-ranks the rest of the cohort", async () => {
      const subjectA = await createScratchSubject("E2E Gap2 SubjectA");
      const [s0, s1, s2] = await createScratchStudents(3, "Gap2Stale", gapTwoArmId);

      // s0: 20 + 60 = 80 (rank 1). s1: 15 + 45 = 60 (rank 2). s2: 10 + 30 = 40 (rank 3).
      await scoreComponent(sunriseAdminToken, subjectA, ca1Id, [
        { studentId: s0, rawScore: 20 },
        { studentId: s1, rawScore: 15 },
        { studentId: s2, rawScore: 10 },
      ], gapTwoArmId);
      await scoreComponent(sunriseAdminToken, subjectA, examId, [
        { studentId: s0, rawScore: 100 },
        { studentId: s1, rawScore: 75 },
        { studentId: s2, rawScore: 50 },
      ], gapTwoArmId);

      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: gapTwoArmId, subjectId: subjectA, termId: sunriseTermId });
      expect(publishRes.status).toBe(200);
      expect(publishRes.body.publishedCount).toBe(3);

      // Each student's ONLY subject (A) is now published, so each overall
      // is PUBLISHED too, ranked in the same order as their subject A total.
      const [s0Before, s1Before, s2Before] = await Promise.all(
        [s0, s1, s2].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );
      expect(s0Before.status).toBe("PUBLISHED");
      expect(s0Before.overallPosition).toBe(1);
      expect(s1Before.status).toBe("PUBLISHED");
      expect(s1Before.overallPosition).toBe(2);
      expect(s2Before.status).toBe("PUBLISHED");
      expect(s2Before.overallPosition).toBe(3);

      // s1 (middle-ranked) gets their FIRST-EVER score in a brand-new
      // subject B — no existing term_subject_result row for it, and s1's
      // overall is currently PUBLISHED: exactly the gap-#2 trigger.
      const subjectB = await createScratchSubject("E2E Gap2 SubjectB");
      const saveRes = await scoreComponent(sunriseAdminToken, subjectB, ca1Id, [{ studentId: s1, rawScore: 5 }], gapTwoArmId);
      expect(saveRes.status).toBe(200);

      const [s0After, s1After, s2After] = await Promise.all(
        [s0, s1, s2].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );

      // s1: reverted — subject B is DRAFT (no exam score yet), so overall
      // is no longer fully published. subjectsCount grows to 2. No leaked
      // position.
      expect(s1After.status).toBe("PENDING_APPROVAL");
      expect(s1After.overallPosition).toBeNull();
      expect(s1After.subjectsCount).toBe(2);

      // s0, s2 are untouched by this save but their COHORT shrank (s1
      // dropped out of the ranked set) — they re-rank: s0 stays 1st, s2
      // shifts from 3rd to 2nd.
      expect(s0After.status).toBe("PUBLISHED");
      expect(s0After.overallPosition).toBe(1);
      expect(s2After.status).toBe("PUBLISHED");
      expect(s2After.overallPosition).toBe(2); // was 3, shifted up
    });

    it("hot-path no-op: saveGrid creating OR editing a row never touches term_overall_results unless a real gap-#2 candidate exists", async () => {
      const subjectId = await createScratchSubject("E2E Gap2 HotPath");
      const [s0] = await createScratchStudents(1, "Gap2HotPath", gapTwoArmId);

      // First save: CREATES the row. s0 has no term_overall_result at all
      // yet (never published anything) — "no overall row" must read as
      // not-published, not throw, and not spuriously create one.
      const createRes = await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 10 }], gapTwoArmId);
      expect(createRes.status).toBe(200);
      const afterCreate = await prisma.termOverallResult.findUnique({
        where: { studentId_termId_sessionId: { studentId: s0, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(afterCreate).toBeNull();

      // Second save: EDITS the same (existing) row. The perf-critical
      // assertion — this must stay a zero-extra-query, zero-extra-lock
      // no-op, proven behaviorally: still no term_overall_result row.
      const editRes = await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 15 }], gapTwoArmId);
      expect(editRes.status).toBe(200);
      const afterEdit = await prisma.termOverallResult.findUnique({
        where: { studentId_termId_sessionId: { studentId: s0, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(afterEdit).toBeNull();
    });

    it("concurrency: a saveGrid triggering the recompute and a publish on a different subject of the same arm don't deadlock and both land correctly", async () => {
      const subjectA2 = await createScratchSubject("E2E Gap2 Conc SubjectA2");
      const subjectB2 = await createScratchSubject("E2E Gap2 Conc SubjectB2");
      const subjectC2 = await createScratchSubject("E2E Gap2 Conc SubjectC2");
      const [sA, sB] = await createScratchStudents(2, "Gap2Conc", gapTwoConcurrencyArmId);

      // sA: fully scored + published in subject A2 (their only subject so
      // far) -> overall PUBLISHED, position 1 (sole ranked student).
      await scoreComponent(sunriseAdminToken, subjectA2, ca1Id, [{ studentId: sA, rawScore: 20 }], gapTwoConcurrencyArmId);
      await scoreComponent(sunriseAdminToken, subjectA2, examId, [{ studentId: sA, rawScore: 100 }], gapTwoConcurrencyArmId);
      const publishA2 = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: gapTwoConcurrencyArmId, subjectId: subjectA2, termId: sunriseTermId });
      expect(publishA2.status).toBe(200);

      // sB: fully scored in subject C2, left PENDING_APPROVAL (not
      // published yet) — this is what the concurrent publish() call will
      // publish.
      await scoreComponent(sunriseAdminToken, subjectC2, ca1Id, [{ studentId: sB, rawScore: 20 }], gapTwoConcurrencyArmId);
      await scoreComponent(sunriseAdminToken, subjectC2, examId, [{ studentId: sB, rawScore: 100 }], gapTwoConcurrencyArmId);

      // Fire concurrently: sA's first-ever score in subject B2 (triggers
      // the gap-#2 recompute — sA's overall is currently PUBLISHED) vs.
      // publishing subject C2 for sB. Different subjects -> no subject-lock
      // contention; both want the class-arm lock -> must serialize, never
      // deadlock.
      const [saveRes, publishRes] = await Promise.all([
        request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: gapTwoConcurrencyArmId, subjectId: subjectB2, componentId: ca1Id, termId: sunriseTermId, scores: [{ studentId: sA, rawScore: 5 }] }),
        request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: gapTwoConcurrencyArmId, subjectId: subjectC2, termId: sunriseTermId }),
      ]);
      expect(saveRes.status).toBe(200);
      expect(publishRes.status).toBe(200);

      const [sAOverall, sBOverall] = await Promise.all(
        [sA, sB].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );

      // No lost update, regardless of which transaction's class-arm-lock
      // acquisition won the race: sA reverted (subject B2 is DRAFT — no
      // exam score), sB published and now the sole ranked student.
      expect(sAOverall.status).toBe("PENDING_APPROVAL");
      expect(sAOverall.overallPosition).toBeNull();
      expect(sAOverall.subjectsCount).toBe(2);
      expect(sBOverall.status).toBe("PUBLISHED");
      expect(sBOverall.overallPosition).toBe(1);
      expect(sBOverall.subjectsCount).toBe(1);
    });
  });

  describe("Concurrency", () => {
    it("a publish and a saveGrid on the same grid, fired concurrently, don't corrupt each other", async () => {
      const subjectId = await createScratchSubject("E2E Concurrency SaveVsPublish");
      const [s0] = await createScratchStudents(1, "ConcSave");
      await scoreComponent(sunriseAdminToken, subjectId, ca1Id, [{ studentId: s0, rawScore: 15 }]);
      await scoreComponent(sunriseAdminToken, subjectId, examId, [{ studentId: s0, rawScore: 60 }]);
      // PENDING_APPROVAL, total 51.

      const [publishRes, saveRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId }),
        request(app.getHttpServer())
          .put("/api/v1/grades/grid")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: scratchArmId, subjectId, componentId: ca2Id, termId: sunriseTermId, scores: [{ studentId: s0, rawScore: 10 }] }),
      ]);

      // Whichever transaction's advisory lock wins, the outcome must be
      // ONE of two internally-consistent states, never a torn value:
      // either the save landed first (total includes CA2, still
      // PENDING_APPROVAL when publish ran, so publish succeeds with the
      // higher total) or publish landed first (CA2 write then 409s
      // against the now-PUBLISHED row, total excludes CA2).
      expect(publishRes.status).toBe(200);
      expect([200, 409]).toContain(saveRes.status);

      const final = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(final.status).toBe("PUBLISHED");
      if (saveRes.status === 200) {
        expect(Number(final.totalScore)).toBe(61); // 15 + 10 + 36
      } else {
        expect(Number(final.totalScore)).toBe(51); // CA2 write was rejected
      }
      const ca2Score = await prisma.studentScore.findUnique({
        where: { studentId_subjectId_componentId_termId_sessionId: { studentId: s0, subjectId, componentId: ca2Id, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      // Consistency check: the stored raw score always agrees with which
      // path the total reflects.
      if (saveRes.status === 200) {
        expect(Number(ca2Score?.rawScore)).toBe(10);
      } else {
        expect(ca2Score).toBeNull();
      }
    });

    it("two publishes for different subjects of the same class arm/term, fired concurrently, both land in the overall recompute", async () => {
      const subjectC = await createScratchSubject("E2E Concurrency C");
      const subjectD = await createScratchSubject("E2E Concurrency D");
      const [s0] = await createScratchStudents(1, "ConcPublish", overallArmId);

      await scoreComponent(sunriseAdminToken, subjectC, ca1Id, [{ studentId: s0, rawScore: 20 }], overallArmId);
      await scoreComponent(sunriseAdminToken, subjectC, examId, [{ studentId: s0, rawScore: 100 }], overallArmId);
      await scoreComponent(sunriseAdminToken, subjectD, ca1Id, [{ studentId: s0, rawScore: 10 }], overallArmId);
      await scoreComponent(sunriseAdminToken, subjectD, examId, [{ studentId: s0, rawScore: 50 }], overallArmId);
      // C: 80. D: 40. Both PENDING_APPROVAL.

      const [resC, resD] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: overallArmId, subjectId: subjectC, termId: sunriseTermId }),
        request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseProprietorToken))
          .send({ classArmId: overallArmId, subjectId: subjectD, termId: sunriseTermId }),
      ]);
      expect(resC.status).toBe(200);
      expect(resD.status).toBe(200);

      const overall = await prisma.termOverallResult.findUniqueOrThrow({
        where: { studentId_termId_sessionId: { studentId: s0, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      // The class-arm-level lock must serialize the two overall-recompute
      // phases so whichever ran second sees BOTH subjects published — if
      // the lock didn't exist, each could independently conclude "not all
      // published yet" and neither would ever correctly flip this to
      // PUBLISHED (a lost update, not just a stale read).
      expect(overall.status).toBe("PUBLISHED");
      expect(Number(overall.averageScore)).toBe(60); // (80 + 40) / 2
      expect(overall.subjectsCount).toBe(2);
      expect(overall.overallPosition).toBe(1);
    });
  });

  describe("Timing", () => {
    it("publish + position computation across a ~100-student class stays fast", async () => {
      const subjectId = await createScratchSubject("E2E Timing");
      const students = await createScratchStudents(100, "Timing");

      await scoreComponent(
        sunriseAdminToken,
        subjectId,
        ca1Id,
        students.map((studentId, i) => ({ studentId, rawScore: 5 + (i % 16) })),
      );
      await scoreComponent(
        sunriseAdminToken,
        subjectId,
        examId,
        students.map((studentId, i) => ({ studentId, rawScore: 20 + (i % 60) })),
      );

      const start = Date.now();
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      const elapsedMs = Date.now() - start;
      // eslint-disable-next-line no-console
      console.log(`[grades-publish] 100-student publish + position computation: ${elapsedMs}ms`);

      expect(response.status).toBe(200);
      expect(response.body.publishedCount).toBe(100);
      expect(response.body.subjectPositions).toHaveLength(100);
      expect(elapsedMs).toBeLessThan(2000); // observed ~115-475ms locally across runs — real headroom, not a loose ceiling

      const positions = response.body.subjectPositions.map((r: { subjectPosition: number }) => r.subjectPosition);
      expect(Math.min(...positions)).toBe(1);
      expect(new Set(positions).size).toBeGreaterThan(1); // real spread, not everyone tied
    });
  });
});
