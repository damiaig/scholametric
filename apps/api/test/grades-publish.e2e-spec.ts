import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — the completeness gate now checks
// EVERY CURRENTLY ENROLLED student in the class arm (getRoster), not just
// "candidates" with an existing row for this subject (the old subject-
// level gate's carve-out, docs/DECISIONS.md — evaluations don't have that
// history problem: absent cleanly covers a latecomer/withdrawn edge case
// instead). That means a shared, ever-growing scratch class arm reused
// across many unrelated tests — safe under the old gate — would make
// EVERY publish in this file require EVERY OTHER test's scratch students
// to also be decided on that exact evaluation. So `armId` is a FRESH,
// empty class arm created before every single test (beforeEach) and torn
// down after (afterEach), never shared across two `it(...)` blocks.
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
  let sunriseJss2LevelId: string;
  let armId: string;
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
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — publish/unpublish now key off an
  // evaluation id in the URL, not a (classArmId, subjectId, termId) body —
  // the cross-tenant 404 tests need a REAL evaluation belonging to each
  // school. A dedicated scratch evaluation, created directly (Hillcrest
  // has no create-evaluation call site in this file), cleaned up in
  // afterAll.
  let hillcrestScratchEvaluationId: string | null = null;

  const createdStudentIds: string[] = [];
  const createdSubjectIds: string[] = [];
  let hillcrestScratchProprietorId: string | null = null;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createScratchStudents(count: number, prefix: string, classArmId: string = armId): Promise<string[]> {
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
    classArmId: string = armId,
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
    classArmId: string = armId,
  ) {
    for (const evaluationId of evaluationIds) {
      await scoreEvaluation(token, subjectId, evaluationId, entries.map((e) => ({ studentId: e.studentId, rawScore: e.total })), classArmId);
    }
  }

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — publish/unpublish moved to the
  // individual evaluation; these are the direct single-call replacements
  // for the old POST /grades/publish and POST /grades/unpublish (may
  // return a non-200, unlike the "whole subject" helpers below).
  function publishEvaluation(token: string, evaluationId: string) {
    return request(app.getHttpServer()).post(`/api/v1/grades/evaluations/${evaluationId}/publish`).set(auth(token)).send();
  }

  function unpublishEvaluation(token: string, evaluationId: string) {
    return request(app.getHttpServer()).post(`/api/v1/grades/evaluations/${evaluationId}/unpublish`).set(auth(token)).send();
  }

  // Replaces old POST /grades/publish's "publish the whole subject at
  // once" semantics: loops publishEvaluation across every evaluation of
  // the subject, so the subject ends up with EVERY evaluation published —
  // its derived total becomes the average across all of them (Q1),
  // matching what the old subject-level publish() produced. Returns the
  // LAST call's response: its subjectPositions/publishedCount reflect the
  // fully-settled state (recomputeStudents/re-rank re-derive from
  // whichever evaluations are CURRENTLY published, so the final
  // iteration's response is always the accurate one). Throws (not a
  // regular assertion) on a non-200 mid-loop — every call site that uses
  // this helper expects the whole sequence to succeed; a site testing a
  // failure calls publishEvaluation directly instead.
  async function publishAllEvaluations(token: string, evaluationIds: string[]) {
    let last: request.Response | undefined;
    for (const evaluationId of evaluationIds) {
      last = await publishEvaluation(token, evaluationId);
      if (last.status !== 200) {
        throw new Error(`publishAllEvaluations failed on ${evaluationId}: ${last.status} ${JSON.stringify(last.body)}`);
      }
    }
    return last!;
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
    sunriseJss2LevelId = jss2.id;

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

    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — a real, dedicated Hillcrest
    // evaluation for the cross-tenant publish/unpublish 404 tests (the
    // new endpoints key off an evaluation id, not a subject/classArm/term
    // body, so a genuine Hillcrest-owned evaluation is needed for the
    // "Sunrise caller can't touch it" direction).
    const hillcrestAdminUser = await prisma.user.findFirstOrThrow({ where: { schoolId: hillcrestId, email: "admin@hillcrest.test" } });
    hillcrestScratchEvaluationId = (
      await prisma.evaluation.create({
        data: {
          schoolId: hillcrestId,
          classArmId: hillcrestArmId,
          subjectId: hillcrestSubjectId,
          sessionId: hillcrestSession.id,
          termId: hillcrestTermId,
          name: "E2E Cross-Tenant Scratch",
          description: "E2E Cross-Tenant Scratch",
          createdBy: hillcrestAdminUser.id,
        },
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

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — see the class-level doc comment
  // above: a fresh, empty class arm per test, so the completeness gate's
  // "every roster student" is exactly the handful this ONE test created.
  beforeEach(async () => {
    armId = (
      await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: sunriseJss2LevelId, name: `E2E-${Date.now()}-${Math.random().toString(36).slice(2, 8)}` } })
    ).id;
  });

  afterEach(async () => {
    // FK-safe order: evaluationScore -> evaluation, then every other row
    // that references this class arm directly (termSubjectResult,
    // termOverallResult — yes, it has its own class_arm_id FK too, not
    // just studentId/termId/sessionId — subjectTeacherAssignment,
    // studentEnrollment), then the arm itself. Student rows aren't
    // deleted here — handled by the outer afterAll via createdStudentIds,
    // same as before this fix.
    const evaluations = await prisma.evaluation.findMany({ where: { classArmId: armId }, select: { id: true } });
    if (evaluations.length > 0) {
      await prisma.evaluationScore.deleteMany({ where: { evaluationId: { in: evaluations.map((e) => e.id) } } });
      await prisma.evaluation.deleteMany({ where: { id: { in: evaluations.map((e) => e.id) } } });
    }
    await prisma.termSubjectResult.deleteMany({ where: { classArmId: armId } });
    await prisma.termOverallResult.deleteMany({ where: { classArmId: armId } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { classArmId: armId } });
    await prisma.studentEnrollment.deleteMany({ where: { classArmId: armId } });
    await prisma.classArm.delete({ where: { id: armId } });
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
    if (hillcrestScratchProprietorId) {
      // Real login flow (loginAs) issued a refresh token for this user —
      // must go before the user row itself (refresh_tokens.user_id FK).
      await prisma.refreshToken.deleteMany({ where: { userId: hillcrestScratchProprietorId } });
      await prisma.user.delete({ where: { id: hillcrestScratchProprietorId } });
    }
    if (hillcrestScratchEvaluationId) {
      await prisma.evaluationScore.deleteMany({ where: { evaluationId: hillcrestScratchEvaluationId } });
      await prisma.evaluation.delete({ where: { id: hillcrestScratchEvaluationId } });
    }
    await app.close();
  });

  describe("POST /grades/evaluations/:id/publish", () => {
    it("happy path with a deliberate tie: shares a position, next rank skips", async () => {
      const subjectId = await createScratchSubject("E2E Publish Tie");
      const [s0, s1, s2] = await createScratchStudents(3, "Tie");
      const evaluationIds = await createEvaluationsForSubject(subjectId, armId);

      // s0, s1: 80 (tied). s2: 20. Every evaluation decided for everyone —
      // satisfies the completeness gate (SPEC_V0.7.4.md §2 Q2, evaluation-
      // scoped now) trivially. Same value on every evaluation (scoreTotal),
      // so publishing just ONE evaluation already gives each student their
      // final total — Q1's "average of published evaluations so far" is
      // just that one evaluation here.
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [
        { studentId: s0, total: 80 },
        { studentId: s1, total: 80 },
        { studentId: s2, total: 20 },
      ]);

      const response = await publishEvaluation(sunriseAdminToken, evaluationIds[0]); // SCHOOL_ADMIN may publish

      expect(response.status).toBe(200);
      expect(response.body.evaluationId).toBe(evaluationIds[0]);
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

      const persistedEvaluation = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluationIds[0] } });
      expect(persistedEvaluation.status).toBe("PUBLISHED");
      expect(persistedEvaluation.publishedAt).not.toBeNull();

      // The subject itself is DERIVED PUBLISHED too (Q1: >=1 published
      // evaluation), even though evaluationIds[1]/[2] are still DRAFT.
      const persisted = await prisma.termSubjectResult.findMany({ where: { subjectId }, orderBy: { subjectPosition: "asc" } });
      for (const row of persisted) {
        expect(row.status).toBe("PUBLISHED");
        expect(row.publishedAt).not.toBeNull();
      }

      const auditLog = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.publishEvaluation", entityId: armId },
        orderBy: { createdAt: "desc" },
      });
      expect(auditLog).not.toBeNull();
      expect((auditLog?.metadata as { subjectId: string }).subjectId).toBe(subjectId);
      expect((auditLog?.metadata as { evaluationId: string }).evaluationId).toBe(evaluationIds[0]);
      expect((auditLog?.metadata as { publishedCount: number }).publishedCount).toBe(3);
    });

    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — replaces the old "nothing to
    // do" 409: publish now always targets a real, existing evaluation
    // (the id is in the route), so the equivalent empty case is simply
    // "that evaluation doesn't exist."
    it("404s an evaluation that doesn't exist", async () => {
      const response = await publishEvaluation(sunriseAdminToken, "00000000-0000-0000-0000-000000000000");
      expect(response.status).toBe(404);
    });

    // v0.7.4 step 1 — a genuine behavior change from the old subject-level
    // publish(): re-publishing is no longer idempotent. Publish is now
    // per-evaluation and atomic (one flag), so "already published" is a
    // real conflict, not a no-op — unpublish first, per the 409 message.
    it("re-publishing an already-published evaluation 409s (no longer idempotent)", async () => {
      const subjectId = await createScratchSubject("E2E Publish Idempotent");
      const [s0] = await createScratchStudents(1, "Idem");
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);
      await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 100 }]);
      const first = await publishEvaluation(sunriseAdminToken, evaluationId);
      expect(first.status).toBe(200);
      expect(first.body.publishedCount).toBe(1);

      const second = await publishEvaluation(sunriseAdminToken, evaluationId);
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/already published/i);
    });

    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — the completeness gate is now
    // evaluation-scoped (Q2): can't publish THIS evaluation until every
    // roster student has a score-or-absent on IT, regardless of any
    // other evaluation's state.
    it("409s with incompleteStudentIds when a roster student has a blank on this evaluation", async () => {
      const subjectId = await createScratchSubject("E2E Publish Incomplete");
      const [complete, incomplete] = await createScratchStudents(2, "PublishIncomplete");
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);
      await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: complete, rawScore: 40 }]);
      // `incomplete` never scored, never marked absent on this evaluation.

      const response = await publishEvaluation(sunriseAdminToken, evaluationId);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/1 student/i);
      expect(response.body.incompleteStudentIds).toEqual([incomplete]);
    });

    // v0.7.3 step 1 (SPEC_V0.7.3.md §2) — publish is no longer director/
    // owner-only, but a TEACHER with no assignment for this exact subject
    // still 403s, unchanged from before this step (assertTeacherAssignment,
    // same helper/shape as every other teacher-scoped mutation).
    it("403s a TEACHER not assigned to teach this subject", async () => {
      const subjectId = await createScratchSubject("E2E Publish TeacherReject");
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);
      const response = await publishEvaluation(sunriseTeacherToken, evaluationId);
      expect(response.status).toBe(403);
    });

    // v0.7.3 step 1 — the actual new capability: an assigned TEACHER can
    // publish their own subject without an admin, with identical ranking/
    // audit-log behavior to an admin-triggered publish.
    it("an assigned TEACHER can publish their own subject's evaluation — same ranking/audit-log behavior as an admin-triggered publish", async () => {
      const subjectId = await createScratchSubject("E2E Publish TeacherOwn");
      const [s0, s1] = await createScratchStudents(2, "TeacherOwn");
      const evaluationIds = await createEvaluationsForSubject(subjectId, armId);
      // scoreTotal's ensureAssignment already wires this subject to
      // teacherUserId (sunriseTeacherToken's own user) — the same teacher
      // publishing it below.
      await scoreTotal(sunriseTeacherToken, subjectId, evaluationIds, [
        { studentId: s0, total: 70 },
        { studentId: s1, total: 50 },
      ]);

      const response = await publishEvaluation(sunriseTeacherToken, evaluationIds[0]);

      expect(response.status).toBe(200);
      expect(response.body.publishedCount).toBe(2);
      const persisted = await prisma.termSubjectResult.findMany({ where: { subjectId } });
      expect(persisted).toHaveLength(2);
      for (const row of persisted) {
        expect(row.status).toBe("PUBLISHED");
        expect(row.publishedAt).not.toBeNull();
      }

      const auditLog = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.publishEvaluation", entityId: armId, actorUserId: teacherUserId },
        orderBy: { createdAt: "desc" },
      });
      expect(auditLog).not.toBeNull();
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer()).post(`/api/v1/grades/evaluations/${hillcrestScratchEvaluationId}/publish`).send();
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const subjectId = await createScratchSubject("E2E Publish CrossTenant");
      const [sunriseEvaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);

      const a = await publishEvaluation(sunriseAdminToken, hillcrestScratchEvaluationId!);
      expect(a.status).toBe(404);

      const b = await publishEvaluation(hillcrestAdminToken, sunriseEvaluationId);
      expect(b.status).toBe(404);
    });
  });

  describe("POST /grades/evaluations/:id/unpublish", () => {
    it("happy path (PROPRIETOR): reverts to DRAFT, clears position and published_at", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish Happy");
      const [s0] = await createScratchStudents(1, "Unpub");
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);
      await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 80 }]);

      const publishRes = await publishEvaluation(sunriseAdminToken, evaluationId);
      expect(publishRes.status).toBe(200);

      // SCHOOL_ADMIN can publish but not unpublish — owner-only.
      const adminAttempt = await unpublishEvaluation(sunriseAdminToken, evaluationId);
      expect(adminAttempt.status).toBe(403);

      const unpublishRes = await unpublishEvaluation(sunriseProprietorToken, evaluationId);
      expect(unpublishRes.status).toBe(200);
      expect(unpublishRes.body.evaluationId).toBe(evaluationId);

      const revertedEvaluation = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluationId } });
      expect(revertedEvaluation.status).toBe("DRAFT");
      expect(revertedEvaluation.publishedAt).toBeNull();

      // This was the subject's ONLY evaluation, so the subject reverts to
      // DRAFT too (Q1: 0 published evaluations left).
      const reverted = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(reverted.status).toBe("DRAFT");
      expect(reverted.subjectPosition).toBeNull();
      expect(reverted.publishedAt).toBeNull();
      expect(Number(reverted.totalScore)).toBe(0); // no published evaluations left to average — unaffected raw score, but nothing counts

      const auditLog = await prisma.auditLog.findFirst({
        where: { schoolId: sunriseId, action: "grades.unpublishEvaluation", entityId: armId },
        orderBy: { createdAt: "desc" },
      });
      expect((auditLog?.metadata as { evaluationId: string }).evaluationId).toBe(evaluationId);
    });

    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — a genuine improvement over the
    // old subject-wide unpublish: unpublishing ONE evaluation only reverts
    // THAT one. A subject with OTHER published evaluations stays derived-
    // PUBLISHED, just with a recalculated total that no longer includes
    // this evaluation's contribution.
    it("unpublishing one evaluation of several leaves the subject PUBLISHED (other evaluations still published), with a recalculated total", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish Partial");
      const [s0] = await createScratchStudents(1, "UnpubPartial");
      const [eval1, eval2] = await createEvaluationsForSubject(subjectId, armId, 2);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [{ studentId: s0, rawScore: 60 }]);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [{ studentId: s0, rawScore: 40 }]);
      expect((await publishEvaluation(sunriseAdminToken, eval1)).status).toBe(200);
      expect((await publishEvaluation(sunriseAdminToken, eval2)).status).toBe(200);

      const beforeUnpublish = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(Number(beforeUnpublish.totalScore)).toBe(50); // (60 + 40) / 2

      const response = await unpublishEvaluation(sunriseProprietorToken, eval2);
      expect(response.status).toBe(200);

      const afterUnpublish = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(afterUnpublish.status).toBe("PUBLISHED"); // eval1 is still published
      expect(Number(afterUnpublish.totalScore)).toBe(60); // eval2's contribution excluded now
    });

    it("409s when this evaluation isn't currently published", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish Empty");
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);
      const response = await unpublishEvaluation(sunriseProprietorToken, evaluationId);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/nothing to unpublish/i);
    });

    // v0.7.3 step 1 (SPEC_V0.7.3.md §2 Q1) — a TEACHER may unpublish their
    // OWN assigned subject (to correct it, then re-publish) without an
    // admin. SCHOOL_ADMIN remains excluded (see the happy-path test above)
    // — this only ever adds a TEACHER-when-assigned branch.
    it("an assigned TEACHER can unpublish their own subject's evaluation", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish TeacherOwn");
      const [s0] = await createScratchStudents(1, "UnpubTeacherOwn");
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);
      await scoreEvaluation(sunriseTeacherToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 65 }]);
      const publishRes = await publishEvaluation(sunriseTeacherToken, evaluationId);
      expect(publishRes.status).toBe(200);

      const response = await unpublishEvaluation(sunriseTeacherToken, evaluationId);

      expect(response.status).toBe(200);
      const revertedEvaluation = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluationId } });
      expect(revertedEvaluation.status).toBe("DRAFT");
      const reverted = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(reverted.status).toBe("DRAFT");
    });

    it("403s a TEACHER not assigned to teach this subject", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish TeacherReject");
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);
      const response = await unpublishEvaluation(sunriseTeacherToken, evaluationId);
      expect(response.status).toBe(403);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const subjectId = await createScratchSubject("E2E Unpublish CrossTenant");
      const [sunriseEvaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);

      const a = await unpublishEvaluation(sunriseProprietorToken, hillcrestScratchEvaluationId!);
      expect(a.status).toBe(404);

      const b = await unpublishEvaluation(hillcrestProprietorToken, sunriseEvaluationId);
      expect(b.status).toBe(404);
    });
  });

  // v0.7.3 step 1 (SPEC_V0.7.3.md §2, Finding 1 from the plan) — publish()/
  // unpublish() had NO closed-term check at all before this step (unlike
  // every other mutation on this data, which already blocked a closed
  // term). This was an oversight, not a deliberate gap, and is fixed here
  // for EVERY role, not just the newly-added TEACHER path — the diff for
  // this fix is the same two-line pattern (term lock + resolveSliceLockState)
  // saveEvaluationScores already used, just previously missing on these two
  // methods. A fully isolated scratch session+term (never referenced by any
  // other test file) is used so closing it can never affect anything else
  // in the shared seeded database this whole e2e run reuses.
  describe("Closed-term gate on publish/unpublish (v0.7.3 step 1 fix)", () => {
    let closedTermSessionId: string;
    let closedTermId: string;

    beforeAll(async () => {
      const session = await prisma.academicSession.create({
        data: { schoolId: sunriseId, name: `E2E-ClosedTerm-${Date.now()}`, startsOn: new Date("2030-01-01"), endsOn: new Date("2030-12-31"), isCurrent: false },
      });
      closedTermSessionId = session.id;
      const term = await prisma.term.create({
        data: {
          schoolId: sunriseId,
          sessionId: closedTermSessionId,
          name: "FIRST",
          startsOn: new Date("2030-01-01"),
          endsOn: new Date("2030-04-01"),
          isCurrent: false,
          closedAt: new Date(),
        },
      });
      closedTermId = term.id;
    });

    afterAll(async () => {
      // Explicit, ahead of the outer describe's own afterAll (which also
      // cleans these same createdSubjectIds up, but only AFTER this block's
      // afterAll already runs) — deleting the term/session first would
      // otherwise 23503 against the FK these child rows still hold.
      await prisma.termSubjectResult.deleteMany({ where: { sessionId: closedTermSessionId } });
      await prisma.subjectTeacherAssignment.deleteMany({ where: { sessionId: closedTermSessionId } });
      await prisma.term.delete({ where: { id: closedTermId } });
      await prisma.academicSession.delete({ where: { id: closedTermSessionId } });
    });

    it("blocks an assigned TEACHER's publish — this gate did not exist for anyone before this fix", async () => {
      const subjectId = await createScratchSubject("E2E ClosedTerm Publish Teacher");
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId, classArmId: armId, sessionId: closedTermSessionId, teacherUserId },
      });
      const evaluation = await prisma.evaluation.create({
        data: { schoolId: sunriseId, classArmId: armId, subjectId, sessionId: closedTermSessionId, termId: closedTermId, name: "CA 1", description: "CA 1", createdBy: teacherUserId },
      });

      const response = await publishEvaluation(sunriseTeacherToken, evaluation.id);

      expect(response.status).toBe(409);
      expect(response.body.termLocked).toBe(true);
    });

    it("blocks SCHOOL_ADMIN's publish too — the fix applies to every role, not just the new TEACHER path", async () => {
      const subjectId = await createScratchSubject("E2E ClosedTerm Publish Admin");
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId, classArmId: armId, sessionId: closedTermSessionId, teacherUserId },
      });
      const evaluation = await prisma.evaluation.create({
        data: { schoolId: sunriseId, classArmId: armId, subjectId, sessionId: closedTermSessionId, termId: closedTermId, name: "CA 1", description: "CA 1", createdBy: teacherUserId },
      });

      const response = await publishEvaluation(sunriseAdminToken, evaluation.id);

      expect(response.status).toBe(409);
      expect(response.body.termLocked).toBe(true);
    });

    it("blocks PROPRIETOR's unpublish too, even on an evaluation published before the term was closed", async () => {
      const subjectId = await createScratchSubject("E2E ClosedTerm Unpublish");
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId, classArmId: armId, sessionId: closedTermSessionId, teacherUserId },
      });
      const [s0] = await createScratchStudents(1, "ClosedUnpub");
      // Simulates "published while the term was still open, then the term
      // was closed afterward" — publishEvaluation() can never reach
      // PUBLISHED under an already-closed term after this fix, so this
      // evaluation/result pair is created directly, matching this file's
      // own established direct-Prisma fixture precedent (see gap-2-TWIN's
      // setup above).
      const evaluation = await prisma.evaluation.create({
        data: {
          schoolId: sunriseId, classArmId: armId, subjectId, sessionId: closedTermSessionId, termId: closedTermId,
          name: "CA 1", description: "CA 1", createdBy: teacherUserId, status: "PUBLISHED", publishedAt: new Date(),
        },
      });
      await prisma.termSubjectResult.create({
        data: {
          schoolId: sunriseId,
          studentId: s0,
          subjectId,
          classArmId: armId,
          termId: closedTermId,
          sessionId: closedTermSessionId,
          totalScore: 80,
          finalGrade: "A1",
          status: "PUBLISHED",
          publishedAt: new Date(),
        },
      });

      const response = await unpublishEvaluation(sunriseProprietorToken, evaluation.id);

      expect(response.status).toBe(409);
      expect(response.body.termLocked).toBe(true);
    });
  });

  describe("PUT /grades/override", () => {
    it("409s while DRAFT — total isn't final yet", async () => {
      const subjectId = await createScratchSubject("E2E Override Draft");
      const [s0] = await createScratchStudents(1, "OvrDraft");
      const [eval1] = await createEvaluationsForSubject(subjectId, armId, 1);
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
      const evaluationIds = await createEvaluationsForSubject(subjectId, armId);
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [{ studentId: s0, total: 51 }]);
      // Publishing just evaluationIds[0] is enough: scoreTotal set the SAME
      // value on every evaluation, so the subject's derived total already
      // equals 51 with only one of them published.
      const publishRes = await publishEvaluation(sunriseAdminToken, evaluationIds[0]);
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

      // Unpublishing that same (only-published) evaluation reverts the
      // whole subject to DRAFT — same end state as the old subject-wide
      // unpublish() this test originally exercised.
      const unpublishRes = await unpublishEvaluation(sunriseProprietorToken, evaluationIds[0]);
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
      const evaluationIds = await createEvaluationsForSubject(subjectId, armId);
      await scoreTotal(sunriseAdminToken, subjectId, evaluationIds, [{ studentId: s0, total: 51 }]);
      const publishRes = await publishEvaluation(sunriseAdminToken, evaluationIds[0]);
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
      const [eval1] = await createEvaluationsForSubject(subjectId, armId, 1);
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
    // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — the old fixture had P take
    // ONLY a "solo" subject that T/Q/R never touched at all; that's no
    // longer reproducible via the real endpoint, since the completeness
    // gate now requires EVERY roster student decided on an evaluation
    // before it can publish (no more "candidates only" carve-out — see
    // the class-level doc comment on `armId`). Redesigned so every
    // student takes the SAME shared subject (satisfying that gate
    // trivially), and R alone carries a SECOND subject that's scored but
    // never published — R's own extra evaluation is never targeted by
    // publishEvaluation() in this test, so its roster-wide gate never
    // even fires; the core point (a student with an incomplete secondary
    // subject is excluded from ranking while classmates with a fully
    // published subject set rank normally) is unchanged.
    it("partial-term: a student with an incomplete secondary subject is excluded from overall ranking entirely", async () => {
      const sharedSubjectId = await createScratchSubject("E2E Overall Shared");
      const extraSubjectId = await createScratchSubject("E2E Overall Extra");
      const [p, t, q, r] = await createScratchStudents(4, "Overall", armId);

      // Every student takes the shared subject. P: 80 (rank 1). T: 60
      // (rank 2). R: 48 (rank 3, once R qualifies — see below). Q: 40.
      const sharedEvaluationIds = await createEvaluationsForSubject(sharedSubjectId, armId);
      await scoreTotal(
        sunriseAdminToken,
        sharedSubjectId,
        sharedEvaluationIds,
        [
          { studentId: p, total: 80 },
          { studentId: t, total: 60 },
          { studentId: q, total: 40 },
          { studentId: r, total: 48 },
        ],
        armId,
      );

      // R ALSO has a second subject, scored but never published — this is
      // what keeps R's overall genuinely incomplete (not just "R only
      // takes 1 subject", which — per term_overall_results.subjects_count
      // being a count of EXISTING rows, not a curriculum size — would
      // legitimately read as "complete" with only 1 subject). Nobody else
      // is scored on it, and it's never published, so its own
      // completeness gate is never exercised.
      const extraEvaluationIds = await createEvaluationsForSubject(extraSubjectId, armId, 1);
      await scoreEvaluation(sunriseAdminToken, extraSubjectId, extraEvaluationIds[0], [{ studentId: r, rawScore: 34 }], armId);
      // R's extra subject: 34, left DRAFT (never published).

      // Publishing just sharedEvaluationIds[0] is enough — scoreTotal set
      // the same value across every evaluation.
      const sharedPublish = await publishEvaluation(sunriseAdminToken, sharedEvaluationIds[0]);
      expect(sharedPublish.status).toBe(200);
      expect(sharedPublish.body.publishedCount).toBe(4);

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
      expect(qOverall.overallPosition).toBe(3); // R is excluded from the ranked cohort entirely, so Q is 3rd not 4th

      // R: excluded — subjects_count is 2 (shared + extra), but only 1 of
      // 2 is published, so overall stays PENDING_APPROVAL with NO leaked
      // position, even though R's own shared-subject result IS published.
      expect(rOverall.status).toBe("PENDING_APPROVAL");
      expect(rOverall.subjectsCount).toBe(2);
      expect(rOverall.overallPosition).toBeNull();

      // Unpublishing the shared evaluation reverts the WHOLE published
      // cohort (P, T, Q — R was already excluded) straight to DRAFT and
      // clears every position, since it was the sole published evaluation
      // behind each of their overalls.
      const unpublishShared = await unpublishEvaluation(sunriseProprietorToken, sharedEvaluationIds[0]);
      expect(unpublishShared.status).toBe(200);
      expect(unpublishShared.body.overallRevertedCount).toBe(3); // P, T, Q

      const [pAfter, tAfter, qAfter] = await Promise.all(
        [p, t, q].map((id) =>
          prisma.termOverallResult.findUniqueOrThrow({
            where: { studentId_termId_sessionId: { studentId: id, termId: sunriseTermId, sessionId: sunriseSessionId } },
          }),
        ),
      );
      expect(pAfter.status).toBe("DRAFT");
      expect(pAfter.overallPosition).toBeNull();
      expect(tAfter.status).toBe("DRAFT");
      expect(tAfter.overallPosition).toBeNull();
      expect(qAfter.status).toBe("DRAFT");
      expect(qAfter.overallPosition).toBeNull();
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
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — the gate moved from the whole
  // subject to the individual evaluation: you can't publish EVALUATION X
  // until every roster student has a score-or-absent on X specifically,
  // regardless of any other evaluation's state. Simpler than the old
  // subject-scoped version it replaces — one evaluation, the whole roster.
  describe("Completeness gate (SPEC_V0.7.4.md §2 Q2)", () => {
    it("blocks publishing THIS evaluation atomically when even one roster student has a blank on it — naming exactly that student, while a DIFFERENT evaluation of the same subject (fully decided) publishes independently", async () => {
      const subjectId = await createScratchSubject("E2E Completeness Blocks");
      const [complete, incomplete] = await createScratchStudents(2, "CompleteGate", armId);
      const [eval1, eval2] = await createEvaluationsForSubject(subjectId, armId, 2);

      // eval1: both students decided — publishable on its own.
      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [
        { studentId: complete, rawScore: 15 },
        { studentId: incomplete, rawScore: 10 },
      ], armId);
      // eval2: `complete` decided, `incomplete` deliberately blank — never
      // entered, never marked absent.
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [{ studentId: complete, rawScore: 60 }], armId);

      const eval1Publish = await publishEvaluation(sunriseAdminToken, eval1);
      expect(eval1Publish.status).toBe(200);

      const eval2Publish = await publishEvaluation(sunriseAdminToken, eval2);
      expect(eval2Publish.status).toBe(409);
      expect(eval2Publish.body.message).toMatch(/1 student/i);
      expect(eval2Publish.body.incompleteStudentIds).toEqual([incomplete]);

      // eval1's own publish is untouched by eval2's block — the gate is
      // scoped to the evaluation being published, not the whole subject.
      const persistedEval1 = await prisma.evaluation.findUniqueOrThrow({ where: { id: eval1 } });
      expect(persistedEval1.status).toBe("PUBLISHED");
      const persistedEval2 = await prisma.evaluation.findUniqueOrThrow({ where: { id: eval2 } });
      expect(persistedEval2.status).toBe("DRAFT");
    });

    it("resolving the blank with a real score unblocks publish for that evaluation", async () => {
      const subjectId = await createScratchSubject("E2E Completeness Resolve");
      const [s0, s1] = await createScratchStudents(2, "CompleteResolve", armId);
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);

      await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 15 }], armId);
      // s1's row on this evaluation still blank.

      const blocked = await publishEvaluation(sunriseAdminToken, evaluationId);
      expect(blocked.status).toBe(409);
      expect(blocked.body.incompleteStudentIds).toEqual([s1]);

      await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s1, rawScore: 8 }], armId);

      const allowed = await publishEvaluation(sunriseAdminToken, evaluationId);
      expect(allowed.status).toBe(200);
      expect(allowed.body.publishedCount).toBe(2);
    });

    it("an all-absent-on-one-evaluation roster still publishes that evaluation — absent is a decided outcome, not blank — and the subject total excludes it from the average once published", async () => {
      const subjectId = await createScratchSubject("E2E Completeness Absent");
      const [s0] = await createScratchStudents(1, "CompleteAbsent", armId);
      const [eval1, eval2, eval3] = await createEvaluationsForSubject(subjectId, armId);

      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [{ studentId: s0, rawScore: 15 }], armId);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [{ studentId: s0, rawScore: 87 }], armId);
      // eval3 marked ABSENT, not scored — a decided outcome, satisfies the gate.
      const absentRes = await request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: armId, subjectId, evaluationId: eval3, termId: sunriseTermId, scores: [{ studentId: s0, isAbsent: true }] });
      expect(absentRes.status).toBe(200);

      // Publish all three — eval3's absent mark satisfies its own gate.
      const response = await publishAllEvaluations(sunriseAdminToken, [eval1, eval2, eval3]);
      expect(response.body.publishedCount).toBe(1);
      const persistedEval3 = await prisma.evaluation.findUniqueOrThrow({ where: { id: eval3 } });
      expect(persistedEval3.status).toBe("PUBLISHED");
      // Total excludes the absent eval3 entirely: (15 + 87) / 2 = 51 — NOT a 0, NOT rescaled.
      expect(response.body.subjectPositions[0].totalScore).toBe(51);
    });
  });

  describe("saveGrid triggering an overall recompute (gap #2 fix)", () => {
    it("stale-rank reproduction: a brand-new subject for a published-overall student reverts their overall and re-ranks the rest of the cohort", async () => {
      const subjectA = await createScratchSubject("E2E Gap2 SubjectA");
      const [s0, s1, s2] = await createScratchStudents(3, "Gap2Stale", armId);
      const evaluationIds = await createEvaluationsForSubject(subjectA, armId);

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
        armId,
      );

      const publishRes = await publishEvaluation(sunriseAdminToken, evaluationIds[0]);
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
      const [subjectBEval] = await createEvaluationsForSubject(subjectB, armId, 1);
      const saveRes = await scoreEvaluation(sunriseAdminToken, subjectB, subjectBEval, [{ studentId: s1, rawScore: 5 }], armId);
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
      const [s0] = await createScratchStudents(1, "Gap2HotPath", armId);
      const [evaluationId] = await createEvaluationsForSubject(subjectId, armId, 1);

      // First save: CREATES the row. s0 has no term_overall_result at all
      // yet (never published anything) — "no overall row" must read as
      // not-published, not throw, and not spuriously create one.
      const createRes = await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 10 }], armId);
      expect(createRes.status).toBe(200);
      const afterCreate = await prisma.termOverallResult.findUnique({
        where: { studentId_termId_sessionId: { studentId: s0, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(afterCreate).toBeNull();

      // Second save: EDITS the same (existing) row. The perf-critical
      // assertion — this must stay a zero-extra-query, zero-extra-lock
      // no-op, proven behaviorally: still no term_overall_result row.
      const editRes = await scoreEvaluation(sunriseAdminToken, subjectId, evaluationId, [{ studentId: s0, rawScore: 15 }], armId);
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
      const [sA, sB] = await createScratchStudents(2, "Gap2Conc", armId);

      // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — the completeness gate is
      // now roster-wide (armId's doc comment), so BOTH sA and sB must be
      // decided on subjectA2/subjectC2 before either can publish, even
      // though only one of them is the "point" of each subject in this
      // test's narrative.
      const a2Evals = await createEvaluationsForSubject(subjectA2, armId);
      await scoreTotal(sunriseAdminToken, subjectA2, a2Evals, [
        { studentId: sA, total: 100 },
        { studentId: sB, total: 100 },
      ], armId);
      const publishA2 = await publishEvaluation(sunriseAdminToken, a2Evals[0]);
      expect(publishA2.status).toBe(200);

      // subjectC2: left DRAFT for now — this is what the concurrent
      // publish call will publish.
      const c2Evals = await createEvaluationsForSubject(subjectC2, armId);
      await scoreTotal(sunriseAdminToken, subjectC2, c2Evals, [
        { studentId: sA, total: 100 },
        { studentId: sB, total: 100 },
      ], armId);

      // Fire concurrently: sA's first-ever score in subject B2 (triggers
      // the gap-#2 recompute — sA's overall is currently PUBLISHED) vs.
      // publishing subject C2 for sB. Different subjects -> no subject-lock
      // contention; both want the class-arm lock -> must serialize, never
      // deadlock.
      const [subjectB2Eval] = await createEvaluationsForSubject(subjectB2, armId, 1);
      await ensureAssignment(subjectB2, armId); // subjectB2's first-ever write, via a raw PUT below (not scoreEvaluation)
      const [saveRes, publishRes] = await Promise.all([
        request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: armId, subjectId: subjectB2, evaluationId: subjectB2Eval, termId: sunriseTermId, scores: [{ studentId: sA, rawScore: 5 }] }),
        publishEvaluation(sunriseAdminToken, c2Evals[0]),
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
      // acquisition won the race: sA stays excluded (subject B2 is DRAFT —
      // never published, so sA's set is PUBLISHED+DRAFT+PUBLISHED, a mix);
      // sB has ALL three of its subjects published (subjectB2 was never
      // even created for sB — only sA touched it), so sB is the sole
      // ranked student.
      expect(sAOverall.status).toBe("PENDING_APPROVAL");
      expect(sAOverall.overallPosition).toBeNull();
      expect(sAOverall.subjectsCount).toBe(3); // subjectA2 + subjectB2(DRAFT) + subjectC2
      expect(sBOverall.status).toBe("PUBLISHED");
      expect(sBOverall.overallPosition).toBe(1);
      expect(sBOverall.subjectsCount).toBe(2); // subjectA2 + subjectC2 — never touched subjectB2
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
      const [s0, s1, s2] = await createScratchStudents(3, "Gap2TwinStale", armId);
      const evaluationIds = await createEvaluationsForSubject(subjectA, armId);

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
        armId,
      );
      const publishRes = await publishEvaluation(sunriseAdminToken, evaluationIds[0]);
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
      const [subjectBEval] = await createEvaluationsForSubject(subjectB, armId, 1);
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
        .send({ classArmId: armId, subjectId: subjectB, termId: sunriseTermId });
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
      const [sA, sB] = await createScratchStudents(2, "Gap2TwinConc", armId);

      // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — same roster-wide gate
      // reasoning as the gap-2 concurrency test above: both sA and sB
      // must be decided on subjectA2/subjectC2 before either can publish.
      const a2Evals = await createEvaluationsForSubject(subjectA2, armId);
      await scoreTotal(sunriseAdminToken, subjectA2, a2Evals, [
        { studentId: sA, total: 100 },
        { studentId: sB, total: 100 },
      ], armId);
      const publishA2 = await publishEvaluation(sunriseAdminToken, a2Evals[0]);
      expect(publishA2.status).toBe(200);

      // subjectC2: left DRAFT — what the concurrent publish call will publish.
      const c2Evals = await createEvaluationsForSubject(subjectC2, armId);
      await scoreTotal(sunriseAdminToken, subjectC2, c2Evals, [
        { studentId: sA, total: 100 },
        { studentId: sB, total: 100 },
      ], armId);

      // subjectB2: a direct evaluation_scores write for sA only, bypassing
      // the HTTP save endpoint — no term_subject_result row for subjectB2
      // yet, for either student.
      const [subjectB2Eval] = await createEvaluationsForSubject(subjectB2, armId, 1);
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
          .send({ classArmId: armId, subjectId: subjectB2, termId: sunriseTermId }),
        publishEvaluation(sunriseAdminToken, c2Evals[0]),
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
      // race above) — no lost update either way. Both students now share
      // the SAME shape: subjectA2 + subjectC2 published, subjectB2 DRAFT.
      expect(sAOverall.status).toBe("PENDING_APPROVAL");
      expect(sAOverall.overallPosition).toBeNull();
      expect(sAOverall.subjectsCount).toBe(3);
      expect(sBOverall.status).toBe("PENDING_APPROVAL");
      expect(sBOverall.overallPosition).toBeNull();
      expect(sBOverall.subjectsCount).toBe(3);
    });
  });

  describe("Concurrency", () => {
    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — the race is now scoped to ONE
    // evaluation (publish(eval2) vs. an edit of eval2's own score), not a
    // whole-subject publish vs. an edit of one of its evaluations.
    // SCHOOL_ADMIN bypasses the published-lock (SPEC_V0.5.1.md §2.5,
    // unchanged by this step) so the edit never 409s regardless of
    // ordering; whichever transaction commits SECOND reads the other's
    // already-committed write (same subject-lock, same recomputeStudents
    // call) — the final total converges to the SAME value no matter which
    // one wins the advisory-lock race, not a torn value.
    it("a publish and a saveGrid on the same evaluation, fired concurrently, don't corrupt each other", async () => {
      const subjectId = await createScratchSubject("E2E Concurrency SaveVsPublish");
      const [s0] = await createScratchStudents(1, "ConcSave");
      const [eval1, eval2] = await createEvaluationsForSubject(subjectId, armId, 2);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval1, [{ studentId: s0, rawScore: 60 }]);
      await scoreEvaluation(sunriseAdminToken, subjectId, eval2, [{ studentId: s0, rawScore: 0 }]);
      expect((await publishEvaluation(sunriseAdminToken, eval1)).status).toBe(200); // settled: eval1 published at 60

      const [publishRes, saveRes] = await Promise.all([
        publishEvaluation(sunriseAdminToken, eval2),
        request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: armId, subjectId, evaluationId: eval2, termId: sunriseTermId, scores: [{ studentId: s0, rawScore: 20 }] }),
      ]);

      expect(publishRes.status).toBe(200);
      expect(saveRes.status).toBe(200);

      const final = await prisma.termSubjectResult.findUniqueOrThrow({
        where: { studentId_subjectId_termId_sessionId: { studentId: s0, subjectId, termId: sunriseTermId, sessionId: sunriseSessionId } },
      });
      expect(final.status).toBe("PUBLISHED");
      expect(Number(final.totalScore)).toBe(40); // (60 + 20) / 2 — deterministic regardless of race order
      const eval2Score = await prisma.evaluationScore.findUnique({
        where: { evaluationId_studentId: { evaluationId: eval2, studentId: s0 } },
      });
      expect(Number(eval2Score?.rawScore)).toBe(20);
    });

    it("two publishes for different subjects of the same class arm/term, fired concurrently, both land in the overall recompute", async () => {
      const subjectC = await createScratchSubject("E2E Concurrency C");
      const subjectD = await createScratchSubject("E2E Concurrency D");
      const [s0] = await createScratchStudents(1, "ConcPublish", armId);
      const cEvals = await createEvaluationsForSubject(subjectC, armId);
      const dEvals = await createEvaluationsForSubject(subjectD, armId);

      await scoreTotal(sunriseAdminToken, subjectC, cEvals, [{ studentId: s0, total: 80 }], armId);
      await scoreTotal(sunriseAdminToken, subjectD, dEvals, [{ studentId: s0, total: 40 }], armId);
      // C: 80. D: 40. Both DRAFT (never published).

      const [resC, resD] = await Promise.all([
        publishEvaluation(sunriseAdminToken, cEvals[0]),
        publishEvaluation(sunriseProprietorToken, dEvals[0]),
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
      const [eval1, eval2] = await createEvaluationsForSubject(subjectId, armId, 2);

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
      const response = await publishEvaluation(sunriseAdminToken, eval1);
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
