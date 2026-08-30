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
  // Dedicated scratch arm for the completeness gate's own tests
  // (SPEC_V0.5.md §2.2, v0.5 step 2) — same isolation reasoning as the
  // arms above, kept separate so a blank-component candidate here can
  // never leak into another suite's publish-success assertions.
  let completenessArmId: string;
  // Dedicated scratch arms for the gap-2-TWIN fix's own tests
  // (SPEC_V0.5.md §3, v0.5 step 3 — POST /grades/recompute's version of the
  // same staleness bug saveGrid was fixed for in v0.4/af94921), same
  // isolation reasoning as gapTwoArmId/gapTwoConcurrencyArmId above but
  // kept separate from them since these students get their subjectB rows
  // via a direct Prisma write (simulating a data-repair scenario), not
  // through saveGrid.
  let gapTwoTwinArmId: string;
  let gapTwoTwinConcurrencyArmId: string;
  let teacherUserId: string;

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

  // SPEC_V0.5.1.md §2.1/§2.2: PUT /grades/evaluation-scores now 404s
  // without a subject_teacher_assignment for (subjectId, classArmId,
  // session) — upserting one here, keyed off whatever pair this particular
  // call actually targets, means every existing call site in this file
  // keeps working without having to hand-track which of the several
  // scratch arms each scratch subject was scored against.
  async function ensureAssignment(subjectId: string, classArmId: string) {
    await prisma.subjectTeacherAssignment.upsert({
      where: { subjectId_classArmId_sessionId: { subjectId, classArmId, sessionId: sunriseSessionId } },
      update: {},
      create: { schoolId: sunriseId, subjectId, classArmId, sessionId: sunriseSessionId, teacherUserId },
    });
  }

  // v0.7 step 1 (SPEC_V0.7.md §2/§5): evaluations replace the fixed
  // CA1/CA2/Exam components — created directly via Prisma (no
  // create-evaluation HTTP endpoint yet, Step 2). Every subject in this
  // file gets its own fresh set, scoped to whichever class arm it's used
  // in.
  async function createEvaluationsForSubject(subjectId: string, classArmId: string, count = 3): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const name = `CA ${i + 1}`;
      const evaluation = await prisma.evaluation.create({
        data: { schoolId: sunriseId, classArmId, subjectId, sessionId: sunriseSessionId, termId: sunriseTermId, name, description: name, createdBy: teacherUserId },
      });
      ids.push(evaluation.id);
    }
    return ids;
  }

  async function scoreEvaluation(
    token: string,
    subjectId: string,
    evaluationId: string,
    scores: { studentId: string; rawScore?: number | null; isAbsent?: boolean }[],
    classArmId: string = scratchArmId,
  ) {
    await ensureAssignment(subjectId, classArmId);
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(token))
      .send({ classArmId, subjectId, evaluationId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`scoreEvaluation failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    return response;
  }

  // Scores every evaluation in `evaluationIds` at the SAME value for each
  // student — since computeEvaluationAverage is a plain average, this
  // makes that value the student's final total directly (native /100, no
  // weights — SPEC_V0.7.md Q1), while still fully satisfying the
  // completeness gate (every evaluation genuinely decided). The simplest
  // way to hand-verify a target total in this new model.
  async function scoreTotal(
    token: string,
    subjectId: string,
    evaluationIds: string[],
    entries: { studentId: string; total: number }[],
    classArmId: string = scratchArmId,
  ) {
    for (const evaluationId of evaluationIds) {
      await scoreEvaluation(token, subjectId, evaluationId, entries.map((e) => ({ studentId: e.studentId, rawScore: e.total })), classArmId);
    }
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
    completenessArmId = (
      await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-Completeness-${Date.now()}` } })
    ).id;
    gapTwoTwinArmId = (
      await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-Gap2Twin-${Date.now()}` } })
    ).id;
    gapTwoTwinConcurrencyArmId = (
      await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-Gap2TwinConc-${Date.now()}` } })
    ).id;

    teacherUserId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;

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
      const evaluations = await prisma.evaluation.findMany({ where: { subjectId: { in: createdSubjectIds } }, select: { id: true } });
      await prisma.evaluationScore.deleteMany({ where: { evaluationId: { in: evaluations.map((e) => e.id) } } });
      await prisma.evaluation.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.termSubjectResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
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
    if (completenessArmId) {
      await prisma.classArm.delete({ where: { id: completenessArmId } });
    }
    if (gapTwoTwinArmId) {
      await prisma.classArm.delete({ where: { id: gapTwoTwinArmId } });
    }
    if (gapTwoTwinConcurrencyArmId) {
      await prisma.classArm.delete({ where: { id: gapTwoTwinConcurrencyArmId } });
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
      const evaluationIds = await createEvaluationsForSubject(subjectId, scratchArmId);

      // s0, s1: 80 (tied). s2: 20. Every evaluation decided for everyone —
      // satisfies the completeness gate (SPEC_V0.5.md §2.2) trivially.
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [
        { studentId: s0, total: 80 },
        { studentId: s1, total: 80 },
        { studentId: s2, total: 20 },
      ]);

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
      const evaluationIds = await createEvaluationsForSubject(subjectId, scratchArmId);
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [{ studentId: s0, total: 100 }]);
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
        .send({ classArmId: scratchArmId, subjectId: sunriseId, termId: sunriseTermId });
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
        .send({ classArmId: scratchArmId, subjectId: sunriseId, termId: sunriseTermId });
      expect(b.status).toBe(404);
    });
  });

  describe("POST /grades/unpublish", () => {
    it("happy path (PROPRIETOR): reverts to DRAFT, clears position and published_at", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish Happy");
      const [s0] = await createScratchStudents(1, "Unpub");
      const evaluationIds = await createEvaluationsForSubject(subjectId, scratchArmId);
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [{ studentId: s0, total: 80 }]);

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
      expect(reverted.status).toBe("DRAFT");
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
        .send({ classArmId: scratchArmId, subjectId: sunriseId, termId: sunriseTermId });
      expect(b.status).toBe(404);
    });
  });

  describe("PUT /grades/override", () => {
    it("409s while DRAFT — total isn't final yet", async () => {
      const subjectId = await createScratchSubject("E2E Override Draft");
      const [s0] = await createScratchStudents(1, "OvrDraft");
      const [eval1] = await createEvaluationsForSubject(subjectId, scratchArmId, 1);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [{ studentId: s0, rawScore: 15 }]);
      // Never published -> DRAFT.

      const row = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(row.status).toBe("DRAFT");

      const response = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseAdminToken))
        .send({ termSubjectResultId: row.id, overrideGrade: "A1" });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/hasn't been published/i);
    });

    // v0.7 step 1 (confirmed): no more PENDING_APPROVAL hop for a subject
    // row — override is now available ONLY once published, and only to
    // PROPRIETOR (SCHOOL_ADMIN can no longer override at all, unlike v0.4's
    // PENDING_APPROVAL loophole). This regression is the new-model
    // equivalent: PUBLISHED -> DRAFT (via unpublish) nulls a stored
    // override, not just leaves it stale.
    it("regression: unpublish (PUBLISHED -> DRAFT) nulls a stored override, not just leaves it stale", async () => {
      const subjectId = await createScratchSubject("E2E Override Regression");
      const [s0] = await createScratchStudents(1, "OvrRegress");
      const evaluationIds = await createEvaluationsForSubject(subjectId, scratchArmId);
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [{ studentId: s0, total: 51 }]);
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(publishRes.status).toBe(200);

      const published = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      const overrideRes = await request(app.getHttpServer())
        .put("/api/v1/grades/override")
        .set(auth(sunriseProprietorToken))
        .send({ termSubjectResultId: published.id, overrideGrade: "A1" });
      expect(overrideRes.status).toBe(200);
      expect(overrideRes.body.overrideGrade).toBe("A1");

      const unpublishRes = await request(app.getHttpServer())
        .post("/api/v1/grades/unpublish")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId });
      expect(unpublishRes.status).toBe(200);

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
      const evaluationIds = await createEvaluationsForSubject(subjectId, scratchArmId);
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [{ studentId: s0, total: 51 }]);
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
      const [eval1] = await createEvaluationsForSubject(subjectId, scratchArmId, 1);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [{ studentId: s0, rawScore: 15 }]);
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

      // T, Q, R all take the shared subject. T: 60. Q: 40. R: 48.
      const sharedEvaluationIds = await createEvaluationsForSubject(sharedSubjectId, overallArmId);
      await scoreTotal(
        sunriseAdminToken,
        sharedSubjectId,
        sharedEvaluationIds,
        [
          { studentId: t, total: 60 },
          { studentId: q, total: 40 },
          { studentId: r, total: 48 },
        ],
        overallArmId,
      );

      // R ALSO has a second subject, scored but never published — this is
      // what keeps R's overall genuinely incomplete (not just "R only
      // takes 1 subject", which — per term_overall_results.subjects_count
      // being a count of EXISTING rows, not a curriculum size — would
      // legitimately read as "complete" with only 1 subject).
      const extraEvaluationIds = await createEvaluationsForSubject(extraSubjectId, overallArmId);
      await scoreTotal(sunriseAdminToken, extraSubjectId, extraEvaluationIds, [{ studentId: r, total: 34 }], overallArmId);
      // R's extra subject: 34, left DRAFT (never published).

      const sharedPublish = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: overallArmId, subjectId: sharedSubjectId, termId: sunriseTermId });
      expect(sharedPublish.status).toBe(200);
      expect(sharedPublish.body.publishedCount).toBe(3);

      // P takes only the solo subject. P: 80.
      const soloEvaluationIds = await createEvaluationsForSubject(soloSubjectId, overallArmId);
      await scoreTotal(sunriseAdminToken, soloSubjectId, soloEvaluationIds, [{ studentId: p, total: 80 }], overallArmId);
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
      // v0.7 step 1 (confirmed): no more PENDING_APPROVAL hop for a
      // subject row — unpublish reverts P's SOLE subject straight to
      // DRAFT (not a decided-but-unpublished intermediate), so with only
      // one subject touched, P's overall is DRAFT too (computeOverallStatus
      // only reaches PENDING_APPROVAL when at least one subject is
      // PUBLISHED among a mix — a single DRAFT subject alone is just DRAFT).
      expect(pAfter.status).toBe("DRAFT");
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
  // Completeness gate (SPEC_V0.5.md §2.2, v0.5 step 2, carried into v0.7
  // step 1): publish() rejects (409) a subject with a DRAFT candidate that
  // has a blank evaluation — no row, or a row with neither a score nor an
  // absent mark. Scoped to publish CANDIDATES only (docs/DECISIONS.md —
  // the spec's literal "every student in the roster" is read as "every
  // student being published in THIS call", preserving v0.4's staggered/
  // repeatable publish rather than requiring 100% roster completeness
  // before anyone can publish).
  describe("Completeness gate (SPEC_V0.5.md §2.2)", () => {
    it("blocks the ENTIRE publish call atomically when even one candidate has a blank evaluation — naming exactly that student+evaluation, leaving a genuinely complete classmate un-transitioned", async () => {
      const subjectId = await createScratchSubject("E2E Completeness Blocks");
      const [complete, incomplete] = await createScratchStudents(2, "CompleteGate", completenessArmId);
      const [eval1, eval2, eval3] = await createEvaluationsForSubject(subjectId, completenessArmId);

      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [
        { studentId: complete, rawScore: 15 },
        { studentId: incomplete, rawScore: 10 },
      ], completenessArmId);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [
        { studentId: complete, rawScore: 60 },
        { studentId: incomplete, rawScore: 50 },
      ], completenessArmId);
      // `complete` also gets eval3 — `incomplete` deliberately does not:
      // never entered, never marked absent. Both are DRAFT (unpublished),
      // but only `incomplete` is blank on eval3.
      await scoreEvaluation(sunriseAdminToken, subjectId, eval3, [{ studentId: complete, rawScore: 5 }], completenessArmId);

      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: completenessArmId, subjectId, termId: sunriseTermId });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/1 student/i);
      expect(response.body.incompleteEntries).toEqual([{ studentId: incomplete, evaluationId: eval3 }]);

      // Atomic — `complete`, who was perfectly eligible, must NOT have
      // been transitioned just because a batch-mate was blank.
      const completeRow = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: complete, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(completeRow.status).toBe("DRAFT");
      expect(completeRow.publishedAt).toBeNull();
    });

    it("resolving the blank with a real score unblocks publish for both students", async () => {
      const subjectId = await createScratchSubject("E2E Completeness Resolve");
      const [s0, s1] = await createScratchStudents(2, "CompleteResolve", completenessArmId);
      const [eval1, eval2, eval3] = await createEvaluationsForSubject(subjectId, completenessArmId);

      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [
        { studentId: s0, rawScore: 15 },
        { studentId: s1, rawScore: 10 },
      ], completenessArmId);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [
        { studentId: s0, rawScore: 60 },
        { studentId: s1, rawScore: 50 },
      ], completenessArmId);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval3, [{ studentId: s0, rawScore: 5 }], completenessArmId);
      // s1's eval3 still blank.

      const blocked = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: completenessArmId, subjectId, termId: sunriseTermId });
      expect(blocked.status).toBe(409);
      expect(blocked.body.incompleteEntries).toEqual([{ studentId: s1, evaluationId: eval3 }]);

      await scoreEvaluation(sunriseAdminToken, subjectId, eval3, [{ studentId: s1, rawScore: 8 }], completenessArmId);

      const allowed = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: completenessArmId, subjectId, termId: sunriseTermId });
      expect(allowed.status).toBe(200);
      expect(allowed.body.publishedCount).toBe(2);
    });

    it("an all-absent-on-one-evaluation roster still publishes — absent is a decided outcome, not blank", async () => {
      const subjectId = await createScratchSubject("E2E Completeness Absent");
      const [s0] = await createScratchStudents(1, "CompleteAbsent", completenessArmId);
      const [eval1, eval2, eval3] = await createEvaluationsForSubject(subjectId, completenessArmId);

      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [{ studentId: s0, rawScore: 15 }], completenessArmId);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [{ studentId: s0, rawScore: 87 }], completenessArmId);
      // eval3 marked ABSENT, not scored — a decided outcome, satisfies the gate.
      const absentRes = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: completenessArmId, subjectId, evaluationId: eval3, termId: sunriseTermId, scores: [{ studentId: s0, isAbsent: true }] });
      expect(absentRes.status).toBe(200);

      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: completenessArmId, subjectId, termId: sunriseTermId });
      expect(response.status).toBe(200);
      expect(response.body.publishedCount).toBe(1);
      // Total excludes the absent eval3 entirely: (15 + 87) / 2 = 51 — NOT a 0, NOT rescaled.
      expect(response.body.subjectPositions[0].totalScore).toBe(51);
    });
  });

  describe("saveGrid triggering an overall recompute (gap #2 fix)", () => {
    it("stale-rank reproduction: a brand-new subject for a published-overall student reverts their overall and re-ranks the rest of the cohort", async () => {
      const subjectA = await createScratchSubject("E2E Gap2 SubjectA");
      const [s0, s1, s2] = await createScratchStudents(3, "Gap2Stale", gapTwoArmId);
      const evaluationIds = await createEvaluationsForSubject(subjectA, gapTwoArmId);

      // s0: 80 (rank 1). s1: 60 (rank 2). s2: 40 (rank 3).
      await scoreTotal(
        sunriseAdminToken,
        subjectA,
        evaluationIds,
        [
          { studentId: s0, total: 80 },
          { studentId: s1, total: 60 },
          { studentId: s2, total: 40 },
        ],
        gapTwoArmId,
      );

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
      const [subjectBEval] = await createEvaluationsForSubject(subjectB, gapTwoArmId, 1);
      const saveRes = await scoreEvaluation(sunriseAdminToken, subjectB, subjectBEval, [{ studentId: s1, rawScore: 5 }], gapTwoArmId);
      expect(saveRes.status).toBe(200);

      const [s0After, s1After, s2After] = await Promise.all(
        [s0, s1, s2].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );

      // s1: reverted — subject B is DRAFT (never published), so overall
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
      const [evaluationId] = await createEvaluationsForSubject(subjectId, gapTwoArmId, 1);

      // First save: CREATES the row. s0 has no term_overall_result at all
      // yet (never published anything) — "no overall row" must read as
      // not-published, not throw, and not spuriously create one.
      const createRes = await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 10 }], gapTwoArmId);
      expect(createRes.status).toBe(200);
      const afterCreate = await prisma.termOverallResult.findUnique({
        where: { studentId_termId_sessionId: { studentId: s0, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(afterCreate).toBeNull();

      // Second save: EDITS the same (existing) row. The perf-critical
      // assertion — this must stay a zero-extra-query, zero-extra-lock
      // no-op, proven behaviorally: still no term_overall_result row.
      const editRes = await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 15 }], gapTwoArmId);
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
      const a2Evals = await createEvaluationsForSubject(subjectA2, gapTwoConcurrencyArmId);
      await scoreTotal(sunriseAdminToken, subjectA2, a2Evals, [{ studentId: sA, total: 100 }], gapTwoConcurrencyArmId);
      const publishA2 = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: gapTwoConcurrencyArmId, subjectId: subjectA2, termId: sunriseTermId });
      expect(publishA2.status).toBe(200);

      // sB: fully scored in subject C2, left DRAFT (not published yet) —
      // this is what the concurrent publish() call will publish.
      const c2Evals = await createEvaluationsForSubject(subjectC2, gapTwoConcurrencyArmId);
      await scoreTotal(sunriseAdminToken, subjectC2, c2Evals, [{ studentId: sB, total: 100 }], gapTwoConcurrencyArmId);

      // Fire concurrently: sA's first-ever score in subject B2 (triggers
      // the gap-#2 recompute — sA's overall is currently PUBLISHED) vs.
      // publishing subject C2 for sB. Different subjects -> no subject-lock
      // contention; both want the class-arm lock -> must serialize, never
      // deadlock.
      const [subjectB2Eval] = await createEvaluationsForSubject(subjectB2, gapTwoConcurrencyArmId, 1);
      await ensureAssignment(subjectB2, gapTwoConcurrencyArmId); // subjectB2's first-ever write, via a raw PUT below (not scoreEvaluation)
      const [saveRes, publishRes] = await Promise.all([
        request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: gapTwoConcurrencyArmId, subjectId: subjectB2, evaluationId: subjectB2Eval, termId: sunriseTermId, scores: [{ studentId: sA, rawScore: 5 }] }),
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
      // acquisition won the race: sA reverted (subject B2 is DRAFT — never
      // published), sB published and now the sole ranked student.
      expect(sAOverall.status).toBe("PENDING_APPROVAL");
      expect(sAOverall.overallPosition).toBeNull();
      expect(sAOverall.subjectsCount).toBe(2);
      expect(sBOverall.status).toBe("PUBLISHED");
      expect(sBOverall.overallPosition).toBe(1);
      expect(sBOverall.subjectsCount).toBe(1);
    });
  });

  // Gap-2-TWIN (SPEC_V0.5.md §3, fixed this step): POST /grades/recompute
  // carries the identical staleness bug saveGrid was fixed for above (gap
  // #2, af94921) — re-deriving a first-ever term_subject_result for a
  // student whose overall is currently PUBLISHED left the overall stale.
  // recompute() re-derives the WHOLE roster (not just an "affected"
  // subset — there's no payload), so unlike saveGrid's version, EVERY
  // roster student who never had a row for the subject being recomputed
  // is a gap-2 candidate, not just whichever ones a specific save touched.
  describe("POST /grades/recompute triggering an overall recompute (gap-2-TWIN fix)", () => {
    it("stale-rank reproduction: recomputing a brand-new subject reverts every published-overall student in the roster, clearing their positions", async () => {
      const subjectA = await createScratchSubject("E2E Gap2Twin SubjectA");
      const [s0, s1, s2] = await createScratchStudents(3, "Gap2TwinStale", gapTwoTwinArmId);
      const evaluationIds = await createEvaluationsForSubject(subjectA, gapTwoTwinArmId);

      // s0,s1,s2 each fully scored + published in subjectA (their only
      // subject) -> each overall PUBLISHED, ranked 1/2/3 by score.
      await scoreTotal(
        sunriseAdminToken,
        subjectA,
        evaluationIds,
        [
          { studentId: s0, total: 80 },
          { studentId: s1, total: 60 },
          { studentId: s2, total: 40 },
        ],
        gapTwoTwinArmId,
      );
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: gapTwoTwinArmId, subjectId: subjectA, termId: sunriseTermId });
      expect(publishRes.status).toBe(200);

      const [s0Before, s1Before, s2Before] = await Promise.all(
        [s0, s1, s2].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );
      expect(s0Before.status).toBe("PUBLISHED");
      expect(s1Before.status).toBe("PUBLISHED");
      expect(s2Before.status).toBe("PUBLISHED");

      // subjectB: an evaluation_scores row written DIRECTLY (simulating a
      // data-repair scenario — recompute()'s own doc comment says
      // "e.g. after a roster fix") for s1 only, BYPASSING the HTTP save
      // endpoint entirely — no term_subject_result row exists for
      // subjectB yet, for ANY of the three students.
      const subjectB = await createScratchSubject("E2E Gap2Twin SubjectB");
      const [subjectBEval] = await createEvaluationsForSubject(subjectB, gapTwoTwinArmId, 1);
      const admin = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "admin@sunrise.test" } });
      await prisma.evaluationScore.create({
        data: { evaluationId: subjectBEval, studentId: s1, rawScore: 5, enteredBy: admin.id, enteredAt: new Date() },
      });

      // recompute() processes the WHOLE roster for subjectB — s0 and s2
      // get an implicit blank DRAFT row (zero scores), s1 gets a real
      // (but still DRAFT) one. ALL THREE are first-ever-row candidates
      // with a currently-PUBLISHED overall -> gap-2-twin fires for all
      // three, not just s1.
      const recomputeRes = await request(app.getHttpServer())
        .post("/api/v1/grades/recompute")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: gapTwoTwinArmId, subjectId: subjectB, termId: sunriseTermId });
      expect(recomputeRes.status).toBe(200);
      expect(recomputeRes.body.recomputedCount).toBe(3);

      const [s0After, s1After, s2After] = await Promise.all(
        [s0, s1, s2].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );
      // No stale PUBLISHED status or leaked position survives for anyone —
      // subjectB is DRAFT for all three, so no one is fully published now.
      for (const overall of [s0After, s1After, s2After]) {
        expect(overall.status).toBe("PENDING_APPROVAL");
        expect(overall.overallPosition).toBeNull();
        expect(overall.subjectsCount).toBe(2);
      }
    });

    it("concurrency: a recompute triggering the overall cascade and a publish on a different subject of the same arm don't deadlock, and both land in the SAME consistent final state", async () => {
      const subjectA2 = await createScratchSubject("E2E Gap2Twin Conc SubjectA2");
      const subjectB2 = await createScratchSubject("E2E Gap2Twin Conc SubjectB2");
      const subjectC2 = await createScratchSubject("E2E Gap2Twin Conc SubjectC2");
      const [sA, sB] = await createScratchStudents(2, "Gap2TwinConc", gapTwoTwinConcurrencyArmId);

      // sA: fully scored + published in subjectA2 (only subject so far) ->
      // overall PUBLISHED, position 1.
      const a2Evals = await createEvaluationsForSubject(subjectA2, gapTwoTwinConcurrencyArmId);
      await scoreTotal(sunriseAdminToken, subjectA2, a2Evals, [{ studentId: sA, total: 100 }], gapTwoTwinConcurrencyArmId);
      const publishA2 = await request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: gapTwoTwinConcurrencyArmId, subjectId: subjectA2, termId: sunriseTermId });
      expect(publishA2.status).toBe(200);

      // sB: fully scored in subjectC2, left DRAFT — what the concurrent
      // publish() call will publish.
      const c2Evals = await createEvaluationsForSubject(subjectC2, gapTwoTwinConcurrencyArmId);
      await scoreTotal(sunriseAdminToken, subjectC2, c2Evals, [{ studentId: sB, total: 100 }], gapTwoTwinConcurrencyArmId);

      // subjectB2: a direct evaluation_scores write for sA only, bypassing
      // the HTTP save endpoint — no term_subject_result row for subjectB2
      // yet, for either student.
      const [subjectB2Eval] = await createEvaluationsForSubject(subjectB2, gapTwoTwinConcurrencyArmId, 1);
      const admin = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "admin@sunrise.test" } });
      await prisma.evaluationScore.create({
        data: { evaluationId: subjectB2Eval, studentId: sA, rawScore: 5, enteredBy: admin.id, enteredAt: new Date() },
      });

      // Fire concurrently: recompute(subjectB2) — a gap-2-twin candidate
      // for sA (published overall, first-ever subjectB2 row) — vs.
      // publish(subjectC2) for sB. Different subjects -> no subject-lock
      // contention; both want the class-arm lock (recompute conditionally,
      // publish unconditionally) -> must serialize, never deadlock.
      const [recomputeRes, publishRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/grades/recompute")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: gapTwoTwinConcurrencyArmId, subjectId: subjectB2, termId: sunriseTermId }),
        request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: gapTwoTwinConcurrencyArmId, subjectId: subjectC2, termId: sunriseTermId }),
      ]);
      expect(recomputeRes.status).toBe(200);
      expect(publishRes.status).toBe(200);

      const [sAOverall, sBOverall] = await Promise.all(
        [sA, sB].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );

      // recompute() touches the WHOLE roster, so sB also gains a blank
      // DRAFT subjectB2 row — regardless of which transaction's class-arm
      // lock acquisition won the race, whichever cascade runs SECOND reads
      // both subjects' current committed state, so there is exactly ONE
      // valid final state here (not two, unlike the saveGrid-vs-publish
      // race above) — no lost update either way.
      expect(sAOverall.status).toBe("PENDING_APPROVAL"); // subjectA2 PUBLISHED + subjectB2 DRAFT
      expect(sAOverall.overallPosition).toBeNull();
      expect(sAOverall.subjectsCount).toBe(2);
      expect(sBOverall.status).toBe("PENDING_APPROVAL"); // subjectB2 DRAFT + subjectC2 PUBLISHED
      expect(sBOverall.overallPosition).toBeNull();
      expect(sBOverall.subjectsCount).toBe(2);
    });
  });

  describe("Concurrency", () => {
    it("a publish and a saveGrid on the same grid, fired concurrently, don't corrupt each other", async () => {
      const subjectId = await createScratchSubject("E2E Concurrency SaveVsPublish");
      const [s0] = await createScratchStudents(1, "ConcSave");
      const [eval1, eval2] = await createEvaluationsForSubject(subjectId, scratchArmId, 2);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [{ studentId: s0, rawScore: 60 }]);
      // eval2 pre-seeded at 0 (not left blank) so the completeness gate is
      // already satisfied going into the race below — the race is about
      // whether the CONCURRENT EDIT (0 -> 20) lands before or after
      // publish(), same property as before, just no longer conflated with
      // "is this student publishable at all" (SPEC_V0.5.md §2.2).
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [{ studentId: s0, rawScore: 0 }]);
      // DRAFT, total (60+0)/2=30.

      const [publishRes, saveRes] = await Promise.all([
        request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: scratchArmId, subjectId, termId: sunriseTermId }),
        request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: scratchArmId, subjectId, evaluationId: eval2, termId: sunriseTermId, scores: [{ studentId: s0, rawScore: 20 }] }),
      ]);

      // Whichever transaction's advisory lock wins, the outcome must be
      // ONE of two internally-consistent states, never a torn value:
      // either the save landed first (total includes the edit, still
      // DRAFT when publish ran, so publish succeeds with the higher
      // total) or publish landed first (the edit then 409s against the
      // now-PUBLISHED row, total excludes it).
      expect(publishRes.status).toBe(200);
      expect([200, 409]).toContain(saveRes.status);

      const final = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(final.status).toBe("PUBLISHED");
      if (saveRes.status === 200) {
        expect(Number(final.totalScore)).toBe(40); // (60 + 20) / 2
      } else {
        expect(Number(final.totalScore)).toBe(30); // the edit was rejected
      }
      const eval2Score = await prisma.evaluationScore.findUnique({
        where: { evaluationId_studentId: { evaluationId: eval2, studentId: s0 } },
      });
      // Consistency check: the stored raw score always agrees with which
      // path the total reflects. eval2 always has a row (pre-seeded at 0
      // above) — the question is only whether the concurrent edit landed.
      if (saveRes.status === 200) {
        expect(Number(eval2Score?.rawScore)).toBe(20);
      } else {
        expect(Number(eval2Score?.rawScore)).toBe(0);
      }
    });

    it("two publishes for different subjects of the same class arm/term, fired concurrently, both land in the overall recompute", async () => {
      const subjectC = await createScratchSubject("E2E Concurrency C");
      const subjectD = await createScratchSubject("E2E Concurrency D");
      const [s0] = await createScratchStudents(1, "ConcPublish", overallArmId);
      const cEvals = await createEvaluationsForSubject(subjectC, overallArmId);
      const dEvals = await createEvaluationsForSubject(subjectD, overallArmId);

      await scoreTotal(sunriseAdminToken, subjectC, cEvals, [{ studentId: s0, total: 80 }], overallArmId);
      await scoreTotal(sunriseAdminToken, subjectD, dEvals, [{ studentId: s0, total: 40 }], overallArmId);
      // C: 80. D: 40. Both DRAFT (never published).

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
      const [eval1, eval2] = await createEvaluationsForSubject(subjectId, scratchArmId, 2);

      await scoreEvaluation(
        sunriseAdminToken,
        subjectId,
        eval1,
        students.map((studentId, i) => ({ studentId, rawScore: 5 + (i % 16) })),
      );
      await scoreEvaluation(
        sunriseAdminToken,
        subjectId,
        eval2,
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
