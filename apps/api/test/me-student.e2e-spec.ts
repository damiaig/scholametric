import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.6 step 3 (SPEC_V0.6.md §2.3) — a STUDENT's own read views: GET
// /me/profile, /me/terms, /me/report-card. The worst-case-bug list: a
// draft/pending subject must be genuinely ABSENT from the response (not a
// hidden field), another student's data must be structurally unreachable
// (no id param exists anywhere on these routes), and cross-tenant holds
// the same way — TenantContext's schoolId comes solely from the verified
// JWT, never a request field.
describe("Student read views (e2e) — SPEC_V0.6.md §2.3, v0.6 step 3", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let studentArmId: string;
  let studentArmCreated = false;
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — THE LEAK FIX's own dedicated
  // class arm, isolated from studentArmId's shared roster (A/B/C/Draft) so
  // publishing subjectZ's evaluation only ever requires studentLeakId
  // decided, never rippling into anyone else's subjects[] array.
  let leakArmId: string;

  let subjectX: string; // published for both A and B, different scores -> distinct positions
  let subjectY: string; // A only, left DRAFT -> keeps A's overall from completing
  let subjectYEvalId: string; // v0.7 step 4 — the finer-grained-wall belt-and-suspenders check below
  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — THE LEAK FIX's own dedicated
  // subject: two evaluations, only one published. Deliberately a
  // SEPARATE student/subject from A/subjectX above, not mixed in — so
  // this fixture never ripples into any of subjectX's own assertions
  // (subject count, running-average math, etc.).
  let subjectZ: string;
  let zEvalDraftId: string;

  let studentAId: string; // "Mixed": subjectX published + subjectY draft -> overall stays non-published
  let studentBId: string; // "Full": subjectX published, only subject -> overall PUBLISHED
  let studentCId: string; // "Empty": enrolled, nothing entered this term
  let studentDraftId: string; // v0.7 step 5 — extreme, unpublished classmate score on subjectX (the class-analytics exclusion proof)
  let studentLeakId: string; // THE LEAK FIX's own dedicated student, scored on subjectZ only

  let tokenA: string;
  let tokenB: string;
  let tokenC: string;
  let tokenLeak: string;

  let hillcrestId: string;
  let hillcrestStudentId: string;
  let hillcrestToken: string;

  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = []; // Sunrise only — hillcrestStudentId cleaned separately
  const createdUserIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const SEED_PASSWORD = "Passw0rd!"; // matches test/utils/login.ts's loginAs()

  async function createSunriseSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  // v0.7 step 1 (SPEC_V0.7.md §2/§5): evaluations replace the fixed
  // CA1/CA2/Exam components — created directly via Prisma (no
  // create-evaluation HTTP endpoint yet, Step 2). classArmId defaults to
  // the shared studentArmId; THE LEAK FIX's dedicated fixture below uses
  // its OWN class arm instead, since the completeness gate is now
  // roster-wide (SPEC_V0.7.4.md §2 Q2) — publishing an evaluation in the
  // shared arm would require every OTHER student enrolled there decided
  // too, rippling into their own subjects[] arrays.
  async function createEvaluation(subjectId: string, name: string, classArmId: string = studentArmId): Promise<string> {
    const subjectTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    const evaluation = await prisma.evaluation.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId: sunriseSessionId, termId: sunriseTermId, name, description: name, createdBy: subjectTeacher.id },
    });
    return evaluation.id;
  }

  async function score(subjectId: string, evaluationId: string, scores: { studentId: string; rawScore?: number; isAbsent?: boolean }[], classArmId: string = studentArmId) {
    const subjectTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    await prisma.subjectTeacherAssignment.upsert({
      where: { subjectId_classArmId_sessionId: { subjectId, classArmId, sessionId: sunriseSessionId } },
      update: {},
      create: { schoolId: sunriseId, subjectId, classArmId, sessionId: sunriseSessionId, teacherUserId: subjectTeacher.id },
    });
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId, evaluationId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`score failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — publish moved to the individual
  // evaluation; a subject counts as published once >=1 of its evaluations
  // is. Callers that need the WHOLE subject published (matching the old
  // subject-level publish()'s effect) pass every one of its evaluation
  // ids here.
  async function publishEvaluations(evaluationIds: string[]) {
    for (const evaluationId of evaluationIds) {
      const response = await request(app.getHttpServer()).post(`/api/v1/grades/evaluations/${evaluationId}/publish`).set(auth(sunriseAdminToken));
      if (response.status !== 200) {
        throw new Error(`publish failed for ${evaluationId}: ${response.status} ${JSON.stringify(response.body)}`);
      }
    }
  }

  async function enrollSunrise(prefix: string, index: number, classArmId: string = studentArmId): Promise<string> {
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-MESTUDENT/${prefix}`,
        firstName: prefix,
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date(Date.UTC(2011, 0, 1 + index)),
        guardianName: "E2E Guardian",
        guardianPhone: `+2348028${String(index).padStart(6, "0")}`,
      },
    });
    await prisma.studentEnrollment.create({
      data: { schoolId: sunriseId, studentId: student.id, classArmId, sessionId: sunriseSessionId },
    });
    createdStudentIds.push(student.id);
    return student.id;
  }

  async function makePortalStudent(studentId: string, username: string): Promise<string> {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4); // low cost — test-only
    const user = await prisma.user.create({
      data: {
        schoolId: student.schoolId,
        role: UserRole.STUDENT,
        username,
        studentId,
        firstName: student.firstName,
        lastName: student.lastName,
        passwordHash,
        mustChangePassword: false,
      },
    });
    createdUserIds.push(user.id);
    return user.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;

    const jss3 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 3" } });
    studentArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss3.id, name: `E2E-MeStudent-${Date.now()}` } })).id;
    studentArmCreated = true;
    leakArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss3.id, name: `E2E-MeStudentLeak-${Date.now()}` } })).id;

    studentAId = await enrollSunrise("MeA", 0);
    studentBId = await enrollSunrise("MeB", 1);
    // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — studentCId is enrolled AFTER
    // subjectX's evaluations publish below (not here alongside A/B): the
    // completeness gate is roster-wide (every CURRENTLY ENROLLED student),
    // so publishing while C is already enrolled-but-unscored would 409.
    // C's whole fixture purpose is "enrolled with nothing entered at all"
    // (the empty-state test) — enrolling them post-publish keeps that
    // premise intact without needing a fabricated score/absence mark.

    subjectX = await createSunriseSubject("E2E MeStudent SubjectX");
    subjectY = await createSunriseSubject("E2E MeStudent SubjectY");

    // subjectX: both A and B scored (all 3 evaluations decided, one
    // absence each — completeness gate) + published — A higher (51,
    // position 1), B lower (46, position 2). One ABSENT evaluation each,
    // exercising the same "Abs vs blank vs real score" distinction
    // report-card.e2e-spec.ts already proves for staff — proving it
    // survives the STUDENT filter too.
    const [xEval1, xEval2, xEval3] = await Promise.all([
      createEvaluation(subjectX, "CA 1"),
      createEvaluation(subjectX, "CA 2"),
      createEvaluation(subjectX, "CA 3"),
    ]);
    await score(subjectX, xEval1, [{ studentId: studentAId, rawScore: 18 }, { studentId: studentBId, rawScore: 12 }]);
    await score(subjectX, xEval2, [{ studentId: studentAId, isAbsent: true }, { studentId: studentBId, isAbsent: true }]);
    await score(subjectX, xEval3, [{ studentId: studentAId, rawScore: 84 }, { studentId: studentBId, rawScore: 80 }]);
    // A: (18+84)/2=51 (eval2 absent, excluded). B: (12+80)/2=46.
    await publishEvaluations([xEval1, xEval2, xEval3]);

    studentCId = await enrollSunrise("MeC", 2);

    // v0.7 step 5 (SPEC_V0.7.md §4) — a THIRD student added to subjectX
    // AFTER publish already ran: the "straggler" case GET /grades/review
    // documents. v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q1): under the
    // per-evaluation model, a student decided on an ALREADY-PUBLISHED
    // evaluation derives PUBLISHED for that subject too — there's no more
    // "silently stays draft forever despite a decided score on a
    // published evaluation" loophole (that's the intended, more
    // consistent behavior; absent now covers the "doesn't apply to this
    // student" case a stale straggler used to). To keep studentDraftId a
    // genuine straggler here, their extreme score lives on a FOURTH,
    // dedicated evaluation of subjectX that's deliberately never
    // published — A/B are never scored on it, so it doesn't touch their
    // own totals, and studentDraftId is never decided on xEval1/2/3, so
    // their subjectX row stays DRAFT (total 0).
    studentDraftId = await enrollSunrise("MeDraft", 3);
    const xEval4 = await createEvaluation(subjectX, "CA 4 (Never Published)");
    await score(subjectX, xEval4, [{ studentId: studentDraftId, rawScore: 100 }]);

    // subjectY: A only, one evaluation scored -> DRAFT, never published.
    // This is what keeps A's OVERALL from ever reaching PUBLISHED
    // (computeOverallStatus requires EVERY subject published) — the exact
    // coupling verified in grade-computation.ts before building.
    subjectYEvalId = await createEvaluation(subjectY, "CA 1");
    await score(subjectY, subjectYEvalId, [{ studentId: studentAId, rawScore: 10 }]);

    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — THE LEAK FIX's own dedicated
    // fixture: subjectZ has TWO evaluations, only ONE published. The
    // subject is visible to studentLeakId (>=1 published evaluation), but
    // the DRAFT sibling's own score must never reach their response —
    // the safety centerpiece this step's diff review is built around.
    // studentLeakId is enrolled in its OWN dedicated leakArmId (not the
    // shared studentArmId) precisely so the roster-wide completeness gate
    // (SPEC_V0.7.4.md §2 Q2) only ever requires studentLeakId decided,
    // never rippling A/B/C/Draft's own subjects[] arrays.
    studentLeakId = await enrollSunrise("MeLeak", 4, leakArmId);
    subjectZ = await createSunriseSubject("E2E MeStudent SubjectZ");
    const [zEvalPublished, zEvalDraft] = await Promise.all([
      createEvaluation(subjectZ, "Z Published", leakArmId),
      createEvaluation(subjectZ, "Z Draft Sibling", leakArmId),
    ]);
    zEvalDraftId = zEvalDraft;
    await score(subjectZ, zEvalPublished, [{ studentId: studentLeakId, rawScore: 70 }], leakArmId);
    await score(subjectZ, zEvalDraft, [{ studentId: studentLeakId, rawScore: 33 }], leakArmId);
    await publishEvaluations([zEvalPublished]); // zEvalDraft stays DRAFT deliberately

    // B has ONLY subjectX, which is published -> computeOverallStatus sees
    // a single PUBLISHED status -> B's overall reaches PUBLISHED too, via
    // publish()'s own class-arm-wide recomputeOverallForClassArm call
    // above (no separate recompute needed here).
    const remarkResponse = await request(app.getHttpServer())
      .put(`/api/v1/students/${studentBId}/remarks/teacher`)
      .set(auth(sunriseAdminToken))
      .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Excellent term overall." });
    if (remarkResponse.status !== 200) {
      throw new Error(`remark write failed: ${remarkResponse.status} ${JSON.stringify(remarkResponse.body)}`);
    }

    await makePortalStudent(studentAId, "E2EMESTUDENTA");
    await makePortalStudent(studentBId, "E2EMESTUDENTB");
    await makePortalStudent(studentCId, "E2EMESTUDENTC");
    await makePortalStudent(studentLeakId, "E2EMESTUDENTLEAK");
    tokenA = await loginAs(app, "E2EMESTUDENTA", "sunrise");
    tokenB = await loginAs(app, "E2EMESTUDENTB", "sunrise");
    tokenC = await loginAs(app, "E2EMESTUDENTC", "sunrise");
    tokenLeak = await loginAs(app, "E2EMESTUDENTLEAK", "sunrise");

    // A dedicated Hillcrest student (no academic structure needed — only
    // /me/profile is exercised cross-tenant, and profile has no grades).
    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestStudent = await prisma.student.create({
      data: {
        schoolId: hillcrestId,
        admissionNumber: "E2E-MESTUDENT/Hill",
        firstName: "Hillcrest",
        lastName: "Student",
        gender: Gender.MALE,
        dateOfBirth: new Date("2012-06-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348029000000",
      },
    });
    hillcrestStudentId = hillcrestStudent.id;
    await makePortalStudent(hillcrestStudentId, "E2EMESTUDENTHILL");
    hillcrestToken = await loginAs(app, "E2EMESTUDENTHILL", "hillcrest");
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }); // before students — FK
    await prisma.termRemark.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    if (createdSubjectIds.length > 0) {
      const evaluations = await prisma.evaluation.findMany({ where: { subjectId: { in: createdSubjectIds } }, select: { id: true } });
      await prisma.evaluationScore.deleteMany({ where: { evaluationId: { in: evaluations.map((e) => e.id) } } });
      await prisma.evaluation.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.termSubjectResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    }
    await prisma.termOverallResult.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: [...createdStudentIds, hillcrestStudentId] } } });
    if (studentArmCreated) {
      await prisma.classArm.delete({ where: { id: studentArmId } });
    }
    if (leakArmId) {
      await prisma.classArm.delete({ where: { id: leakArmId } });
    }
    await app.close();
  });

  describe("GET /me/report-card", () => {
    it("shows the student's OWN published subject, with the real/absent/position breakdown intact", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenA));
      expect(response.status).toBe(200);
      expect(response.body.studentId).toBe(studentAId);
      expect(response.body.firstName).toBe("MeA");

      expect(response.body.subjects).toHaveLength(1);
      const subj = response.body.subjects[0];
      expect(subj.subjectId).toBe(subjectX);
      expect(subj.status).toBe("PUBLISHED");
      expect(subj.totalScore).toBe(51); // (18 + 84) / 2 — eval2's absence excluded, not averaged as 0
      expect(subj.subjectPosition).toBe(1); // A (51) beats B's total below

      // v0.7 step 4 (SPEC_V0.7.md §4): the real per-evaluation breakdown —
      // name/description/score for every evaluation, absence rendered
      // honestly (rawScore: null, isAbsent: true), never a 0.
      expect(subj.evaluations).toHaveLength(3);
      const ca1 = subj.evaluations.find((e: { name: string }) => e.name === "CA 1");
      const ca2 = subj.evaluations.find((e: { name: string }) => e.name === "CA 2");
      const ca3 = subj.evaluations.find((e: { name: string }) => e.name === "CA 3");
      expect(ca1).toMatchObject({ description: "CA 1", rawScore: 18, isAbsent: false });
      expect(ca2).toMatchObject({ description: "CA 2", rawScore: null, isAbsent: true });
      expect(ca3).toMatchObject({ description: "CA 3", rawScore: 84, isAbsent: false });
    });

    it("a DRAFT subject for the SAME student is ABSENT from subjects[], not a hidden/flagged row — and NONE of its evaluation data appears anywhere in the response", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenA));
      expect(response.status).toBe(200);
      const subjectIds = response.body.subjects.map((s: { subjectId: string }) => s.subjectId);
      expect(subjectIds).not.toContain(subjectY);
      expect(subjectIds).toContain(subjectX);

      // A's overall never reached PUBLISHED (subjectY still DRAFT) -> null,
      // never a partial/live computation standing in for it.
      expect(response.body.overall).toBeNull();
      // v0.7.2 step 1 (SPEC_V0.7.2.md §2) — THE additive proof, in the
      // SAME response as the assertion above: the official overall stayed
      // null (untouched), while the NEW runningAverageScore is
      // simultaneously non-null — 51 from subjectX alone (published);
      // subjectY's 10 (still DRAFT) contributes nothing. If the draft
      // subject leaked in, this would be (51+10)/2=30.5, not 51.
      expect(response.body.runningAverageScore).toBe(51);
      // v0.7.3 step 2 (SPEC_V0.7.3.md §3) — SAME response, SAME additive
      // proof extended: the class-wide pool is {A: 51, B: 46} — C has
      // nothing published, D's 100/100/100 on subjectX was NEVER published
      // (straggler) so it contributes nothing. mean(51, 46) = 48.5 — if
      // D's draft leaked in it'd be mean(51,46,100)=65.67, not 48.5.
      // A leads that pool (51 > 46) -> running position 1, even though
      // A's OFFICIAL overall (asserted null above) isn't ranked at all yet.
      expect(response.body.runningClassAverageScore).toBe(48.5);
      expect(response.body.runningPosition).toBe(1);
      // Remarks gate: no published overall -> no remarks, even though this
      // student could in principle have one written.
      expect(response.body.remarks.teacherRemark).toBeNull();

      // v0.7 step 4 (SPEC_V0.7.md §4) — the finer-grained wall,
      // belt-and-suspenders (mirrors v0.6's A-sees-only-A test): subjectY's
      // evaluation id, and A's own real score on it (10, decided but never
      // published), must not surface in ANY field of the response — not
      // just subjectY's absence from `subjects[]` at the top level.
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(subjectYEvalId);
      expect(serialized).not.toContain(subjectY);
      // v0.7.3 step 2 — the new class-wide queries read B's and D's rows
      // server-side to compute runningClassAverageScore/runningPosition;
      // confirm neither student's id ever reaches A's serialized response.
      expect(serialized).not.toContain(studentBId);
      expect(serialized).not.toContain(studentDraftId);
    });

    it("published OVERALL position matches the report card once every subject is published, and remarks appear", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenB));
      expect(response.status).toBe(200);
      expect(response.body.subjects).toHaveLength(1);
      expect(response.body.subjects[0].subjectPosition).toBe(2); // B (46) behind A's 51

      expect(response.body.overall).not.toBeNull();
      expect(response.body.overall.status).toBe("PUBLISHED");
      expect(response.body.overall.subjectsCount).toBe(1);
      // v0.7.2 step 1 — B's only subject is published, so the running
      // average matches the official overall here (46) — the two figures
      // agreeing once everything IS published is exactly what's expected;
      // they're independent computations that happen to converge.
      expect(response.body.runningAverageScore).toBe(46);
      // B is the ONLY student whose OFFICIAL overall reached PUBLISHED
      // (A's hasn't; C/D have none) -> alone in that pool -> position 1.
      expect(response.body.overall.overallPosition).toBe(1);

      // v0.7.3 step 2 (SPEC_V0.7.3.md §3) — the DIVERGENCE, by design: the
      // running pool is looser (≥1 published) and includes A too, whose
      // running average (51) beats B's (46) — so B's running position is
      // 2, even though B's OFFICIAL position (just asserted) is 1. Same
      // class-wide figure as A's response: mean(51, 46) = 48.5.
      expect(response.body.runningClassAverageScore).toBe(48.5);
      expect(response.body.runningPosition).toBe(2);

      expect(response.body.remarks.teacherRemark).toBe("Excellent term overall.");
    });

    it("another student's data is unreachable: A's token never returns B's row or vice versa", async () => {
      const asA = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenA));
      const asB = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenB));

      expect(asA.body.studentId).toBe(studentAId);
      expect(asB.body.studentId).toBe(studentBId);
      expect(asA.body.subjects[0].totalScore).toBe(51);
      expect(asB.body.subjects[0].totalScore).toBe(46);
      // Neither response carries the other's identity anywhere in it.
      expect(JSON.stringify(asA.body)).not.toContain(studentBId);
      expect(JSON.stringify(asB.body)).not.toContain(studentAId);
    });

    it("a raw extra studentId smuggled into the query string 400s (forbidNonWhitelisted) — there is no id param on this route", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId, studentId: studentBId })
        .set(auth(tokenA));
      expect(response.status).toBe(400);
    });

    it("empty state: enrolled with nothing published -> 200 { subjects: [], overall: null }, not an error", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenC));
      expect(response.status).toBe(200);
      expect(response.body.subjects).toEqual([]);
      expect(response.body.overall).toBeNull();
      // v0.7.2 step 1 — zero published subjects -> null, never a real 0
      // standing in for "nothing to average yet".
      expect(response.body.runningAverageScore).toBeNull();
      // v0.7.3 step 2 (SPEC_V0.7.3.md §3) — the CLASS figure is independent
      // of C's own state: A and B are still in the pool, so C sees the
      // same 48.5 as everyone else. But C themselves has zero published
      // subjects, so they're not IN that pool -> runningPosition null,
      // same "excluded, not ranked on partial" rule the official position
      // already uses, just with a looser bar (≥1, not every subject).
      expect(response.body.runningClassAverageScore).toBe(48.5);
      expect(response.body.runningPosition).toBeNull();
    });

    it("403s for TEACHER (this route is STUDENT-only)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });

    it("401 unauthenticated", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/report-card").query({ termId: sunriseTermId, sessionId: sunriseSessionId });
      expect(response.status).toBe(401);
    });

    // v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics: the two
    // non-negotiables. (1) An unpublished classmate's EXTREME score must
    // not feed the self-view caller's class average/best/worst — proven
    // against studentDraftId's 100s, added as a straggler after subjectX
    // was already published. (2) Anonymity is structural: the response
    // never carries the draft classmate's name or id anywhere, checked via
    // JSON.stringify on the WHOLE body, not just the fields we expect to
    // hold analytics.
    it("class average/best/worst EXCLUDE an unpublished classmate's extreme score for the self-view caller, while staff sees the real class — and the classmate's identity never leaks", async () => {
      const selfView = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenA));
      expect(selfView.status).toBe(200);
      const subj = selfView.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectX);

      // Subject-level: avg(A=51, B=46) = 48.5 — studentDraftId's 100 excluded.
      expect(subj.classAverageScore).toBe(48.5);

      const ca1 = subj.evaluations.find((e: { name: string }) => e.name === "CA 1");
      const ca2 = subj.evaluations.find((e: { name: string }) => e.name === "CA 2");
      const ca3 = subj.evaluations.find((e: { name: string }) => e.name === "CA 3");
      // CA1: A=18, B=12 (both published) -> avg 15, best 18, worst 12.
      expect(ca1).toMatchObject({ classAverageScore: 15, bestScore: 18, worstScore: 12 });
      // CA2: A and B are BOTH absent -> nothing decided among ELIGIBLE
      // (published) students -> null, even though studentDraftId DOES have
      // a decided (100) score there — ineligible, not just unlucky timing.
      expect(ca2).toMatchObject({ classAverageScore: null, bestScore: null, worstScore: null });
      // CA3: A=84, B=80 -> avg 82, best 84, worst 80 — never 100.
      expect(ca3).toMatchObject({ classAverageScore: 82, bestScore: 84, worstScore: 80 });

      // Structural anonymity: studentDraftId's firstName/admissionNumber/id
      // (all unique to them, unlike lastName "Student" which every fixture
      // student here shares) appear NOWHERE in the response.
      const serialized = JSON.stringify(selfView.body);
      expect(serialized).not.toContain("MeDraft");
      expect(serialized).not.toContain("E2E-MESTUDENT/MeDraft");
      expect(serialized).not.toContain(studentDraftId);

      // Staff sees the real, unfiltered class — including studentDraftId's
      // DRAFT subjectX row (total 0, since none of xEval1-3 are decided
      // for them — their extreme 100 lives on the never-published xEval4,
      // SPEC_V0.7.4.md §2 Q1: a student decided on an already-published
      // evaluation would derive published too, so a genuine straggler's
      // extreme score can only live on an evaluation they're never
      // decided-and-published on).
      const staffView = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentAId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(staffView.status).toBe(200);
      const staffSubj = staffView.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectX);
      // avg(51, 46, 0) = 32.333... -> 32.33 — staff has no eligibility
      // filter, so studentDraftId's DRAFT row (0) counts, unlike A's
      // self-view (48.5, asserted above) which excludes it entirely.
      expect(staffSubj.classAverageScore).toBeCloseTo(32.33, 2);
      const staffCa2 = staffSubj.evaluations.find((e: { name: string }) => e.name === "CA 2");
      // CA2: A and B are both absent, and studentDraftId was never scored
      // on this evaluation at all (only on xEval4) — nothing decided,
      // null for staff exactly as for self-view.
      expect(staffCa2).toMatchObject({ classAverageScore: null, bestScore: null, worstScore: null });
    });

    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — THE LEAK FIX, proven directly.
    // subjectZ is visible to studentLeakId (>=1 published evaluation),
    // but its DRAFT sibling evaluation's id/name/score must never reach
    // this response — not filtered client-side, structurally never
    // fetched (getReportCard's evaluations query gains the same
    // conditional status: PUBLISHED filter every other self-view query in
    // that method already uses).
    it("THE LEAK FIX: a visible subject's UNPUBLISHED sibling evaluation never reaches the student — its id, name, and score appear nowhere in the response", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenLeak));
      expect(response.status).toBe(200);

      const subj = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectZ);
      expect(subj).toBeDefined(); // subjectZ IS visible — it has >=1 published evaluation
      expect(subj.status).toBe("PUBLISHED");
      // Total is the average of PUBLISHED evaluations only (70), NOT
      // averaged with the draft sibling's 33 — a leak would make this
      // (70+33)/2=51.5, not 70.
      expect(subj.totalScore).toBe(70);

      // Only the published evaluation appears — the draft sibling is
      // structurally absent, not a hidden/flagged row.
      expect(subj.evaluations).toHaveLength(1);
      expect(subj.evaluations[0].name).toBe("Z Published");

      // Belt-and-suspenders: the draft sibling's id and name appear
      // NOWHERE in the response, not just absent from subjects[] (a raw
      // "33" substring check is skipped — too easy to false-positive
      // against an unrelated UUID elsewhere in the response).
      const serialized = JSON.stringify(response.body);
      expect(serialized).not.toContain(zEvalDraftId);
      expect(serialized).not.toContain("Z Draft Sibling");
    });
  });

  describe("cross-tenant: Sunrise and Hillcrest students each see only their own school", () => {
    it("a Hillcrest student's /me/profile returns their OWN data, never anything from Sunrise", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/profile").set(auth(hillcrestToken));
      expect(response.status).toBe(200);
      expect(response.body.studentId).toBe(hillcrestStudentId);
      expect(response.body.firstName).toBe("Hillcrest");
      expect(response.body.admissionNumber).toBe("E2E-MESTUDENT/Hill");
    });

    it("a Sunrise student's /me/profile returns their own data, distinct from Hillcrest's", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/profile").set(auth(tokenA));
      expect(response.status).toBe(200);
      expect(response.body.studentId).toBe(studentAId);
      expect(response.body.firstName).toBe("MeA");
    });
  });

  describe("GET /me/profile", () => {
    it("returns the caller's own basic profile, including current class arm", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/profile").set(auth(tokenA));
      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          studentId: studentAId,
          firstName: "MeA",
          lastName: "Student",
          admissionNumber: "E2E-MESTUDENT/MeA",
        }),
      );
      expect(response.body.currentClassArmLabel).toContain("JSS 3");
    });
  });

  describe("GET /me/terms", () => {
    it("lists only sessions/terms the caller was ever enrolled in", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/terms").set(auth(tokenA));
      expect(response.status).toBe(200);
      expect(response.body.sessions.length).toBeGreaterThan(0);
      const terms = response.body.sessions.flatMap((s: { terms: { id: string }[] }) => s.terms.map((t) => t.id));
      expect(terms).toContain(sunriseTermId);
    });
  });
});
