import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// SPEC_V0.5.1.md §2.5, v0.5.1 step 4: SCHOOL_ADMIN/PROPRIETOR may now pass
// PUT /grades/evaluation-scores' PUBLISHED-student gate (the same reviewed write path
// grades-grid.e2e-spec.ts already covers for the normal, non-published
// case) — TEACHER still 409s there unconditionally. Every scenario gets its
// own scratch session+term+class-arm+subject+students bundle in the REAL
// Sunrise tenant (same discipline as grades-publish.e2e-spec.ts) so a full-
// suite run never touches the seeded demo data.
describe("Mark absent after publish (e2e) — SPEC_V0.5.1.md §2.5, v0.5.1 step 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let jss2LevelId: string;
  let teacherUserId: string;

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
    evaluationIds: string[]; // [eval1, eval2, eval3]
    studentIds: string[]; // [high, mid, low]
  }

  // v0.7 step 1 (SPEC_V0.7.md §2/§5): evaluations replace the fixed
  // CA1/CA2/Exam components — created directly via Prisma (no
  // create-evaluation HTTP endpoint yet, Step 2).
  async function createEvaluationsFor(subjectId: string, classArmId: string, sessionId: string, termId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const name of ["CA 1", "CA 2", "CA 3"]) {
      const evaluation = await prisma.evaluation.create({
        data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name, description: name, createdBy: teacherUserId },
      });
      ids.push(evaluation.id);
    }
    return ids;
  }

  async function createScratchBundle(prefix: string): Promise<ScratchBundle> {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-MAP-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-MAP-${stamp}` },
    });
    createdClassArmIds.push(classArm.id);
    const subject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E MAP ${stamp}`, code: `MAP${stamp.slice(-6)}`.slice(0, 10).toUpperCase() },
    });
    createdSubjectIds.push(subject.id);
    // Step 1's rule: a subject only exists for a class once a teacher is
    // assigned — required for ANY grid write, admin included, not specific
    // to this step's own bypass.
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: subject.id, classArmId: classArm.id, sessionId: session.id, teacherUserId },
    });
    const evaluationIds = await createEvaluationsFor(subject.id, classArm.id, session.id, term.id);

    const studentIds: string[] = [];
    for (let i = 0; i < 3; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-MAP/${stamp}/${i}`,
          firstName: "MarkAbsent",
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348033${String(Date.now() + i).slice(-6)}`,
        },
      });
      createdStudentIds.push(student.id);
      await prisma.studentEnrollment.create({
        data: { schoolId: sunriseId, studentId: student.id, classArmId: classArm.id, sessionId: session.id },
      });
      studentIds.push(student.id);
    }

    return { sessionId: session.id, termId: term.id, classArmId: classArm.id, subjectId: subject.id, evaluationIds, studentIds };
  }

  function scoreBody(bundle: ScratchBundle, evaluationId: string, studentId: string, extra: { rawScore?: number | null; isAbsent?: boolean }) {
    return {
      classArmId: bundle.classArmId,
      subjectId: bundle.subjectId,
      evaluationId,
      termId: bundle.termId,
      scores: [{ studentId, ...extra }],
    };
  }

  // Native /100 average across 3 plain evaluations (SPEC_V0.7.md Q1) — no
  // weights. high: 30,30,90 -> avg 50 (top). mid: 40,40,40 -> avg 40. low:
  // 20,20,20 -> avg 20. Marking high's 3rd evaluation absent drops their
  // average to (30+30)/2=30 — below mid's 40, a genuine cohort re-rank,
  // same shape as the original weighted-exam proof.
  async function scoreAll(token: string, bundle: ScratchBundle, scores: { ca1: number; ca2: number; ca3: number }[]) {
    for (let i = 0; i < bundle.studentIds.length; i++) {
      const studentId = bundle.studentIds[i];
      const { ca1, ca2, ca3 } = scores[i];
      for (const [evaluationId, rawScore] of [
        [bundle.evaluationIds[0], ca1],
        [bundle.evaluationIds[1], ca2],
        [bundle.evaluationIds[2], ca3],
      ] as const) {
        const res = await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(token))
          .send(scoreBody(bundle, evaluationId, studentId, { rawScore }));
        if (res.status !== 200) throw new Error(`score failed: ${res.status} ${JSON.stringify(res.body)}`);
      }
    }
  }

  async function publishSubject(bundle: ScratchBundle) {
    const res = await request(app.getHttpServer())
      .post("/api/v1/grades/publish")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId });
    if (res.status !== 200) throw new Error(`publish failed: ${res.status} ${JSON.stringify(res.body)}`);
    return res.body;
  }

  async function resultFor(bundle: ScratchBundle, studentId: string) {
    return prisma.termSubjectResult.findUniqueOrThrow({
      where: { studentId_subjectId_termId_sessionId: { studentId, subjectId: bundle.subjectId, termId: bundle.termId, sessionId: bundle.sessionId } },
    });
  }

  async function overallFor(bundle: ScratchBundle, studentId: string) {
    return prisma.termOverallResult.findUniqueOrThrow({
      where: { studentId_termId_sessionId: { studentId, termId: bundle.termId, sessionId: bundle.sessionId } },
    });
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;

    teacherUserId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;
  });

  afterAll(async () => {
    await prisma.termUnlock.deleteMany({ where: { termId: { in: createdTermIds } } });
    const evaluations = await prisma.evaluation.findMany({ where: { termId: { in: createdTermIds } }, select: { id: true } });
    await prisma.evaluationScore.deleteMany({ where: { evaluationId: { in: evaluations.map((e) => e.id) } } });
    await prisma.evaluation.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.termSubjectResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.termOverallResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: createdClassArmIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  it("admin marks a published student absent: total drops, subject AND overall re-rank the WHOLE cohort, stays PUBLISHED, audited", async () => {
    const bundle = await createScratchBundle("MarkAbsent");
    const [high, mid, low] = bundle.studentIds;

    // high: (30+30+90)/3=50. mid: (40+40+40)/3=40. low: (20+20+20)/3=20.
    await scoreAll(sunriseAdminToken, bundle, [
      { ca1: 30, ca2: 30, ca3: 90 },
      { ca1: 40, ca2: 40, ca3: 40 },
      { ca1: 20, ca2: 20, ca3: 20 },
    ]);
    await publishSubject(bundle);

    const beforeHigh = await resultFor(bundle, high);
    const beforeMid = await resultFor(bundle, mid);
    const beforeLow = await resultFor(bundle, low);
    expect(beforeHigh.status).toBe("PUBLISHED");
    expect(Number(beforeHigh.totalScore)).toBe(50);
    expect(beforeHigh.subjectPosition).toBe(1);
    expect(beforeMid.subjectPosition).toBe(2);
    expect(beforeLow.subjectPosition).toBe(3);
    const beforeOverallHigh = await overallFor(bundle, high);
    expect(beforeOverallHigh.status).toBe("PUBLISHED");
    expect(beforeOverallHigh.overallPosition).toBe(1);

    // Mark `high` absent on their 3rd evaluation — their new average (30)
    // now falls BELOW mid's (40), a genuine cohort re-rank, not just their own.
    const markAbsent = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { isAbsent: true }));
    expect(markAbsent.status).toBe(200);

    const afterHigh = await resultFor(bundle, high);
    const afterMid = await resultFor(bundle, mid);
    const afterLow = await resultFor(bundle, low);

    // Stays published, not reverted — the core assertion of this step.
    expect(afterHigh.status).toBe("PUBLISHED");
    expect(afterHigh.publishedAt?.getTime()).toBe(beforeHigh.publishedAt?.getTime()); // preserved, not refreshed
    expect(Number(afterHigh.totalScore)).toBe(30); // (30 + 30) / 2 — 3rd evaluation absent, excluded

    // Whole-cohort re-rank: mid (40) now leads, high (30) drops to 2nd, low (20) stays last.
    expect(afterMid.subjectPosition).toBe(1);
    expect(afterHigh.subjectPosition).toBe(2);
    expect(afterLow.subjectPosition).toBe(3);

    // Overall recomputes too (single-subject cohort here, so it mirrors
    // the subject ranking exactly) — proves the class-arm-level cascade
    // fired, not just the one row's total.
    const afterOverallHigh = await overallFor(bundle, high);
    const afterOverallMid = await overallFor(bundle, mid);
    expect(afterOverallHigh.status).toBe("PUBLISHED");
    expect(afterOverallMid.overallPosition).toBe(1);
    expect(afterOverallHigh.overallPosition).toBe(2);

    // The CHECK constraint's own shape: a decided absence is null+true,
    // never both set (this step's write path didn't touch the upsert
    // logic itself, but proves the bypass still respects it).
    const score = await prisma.evaluationScore.findUniqueOrThrow({
      where: { evaluationId_studentId: { evaluationId: bundle.evaluationIds[2], studentId: high } },
    });
    expect(score.rawScore).toBeNull();
    expect(score.isAbsent).toBe(true);

    // Audited, with the sensitive bypass explicitly traceable.
    const auditRow = await prisma.auditLog.findFirstOrThrow({
      where: { schoolId: sunriseId, action: "grades.saveEvaluationScores", entityId: bundle.classArmId },
      orderBy: { createdAt: "desc" },
    });
    expect((auditRow.metadata as { publishedBypassStudentIds: string[] }).publishedBypassStudentIds).toEqual([high]);
  });

  it("admin then corrects back to a real score: symmetric restore, re-rank, stays published", async () => {
    const bundle = await createScratchBundle("UnAbsent");
    const [high, mid] = bundle.studentIds;

    await scoreAll(sunriseAdminToken, bundle, [
      { ca1: 30, ca2: 30, ca3: 90 },
      { ca1: 40, ca2: 40, ca3: 40 },
      { ca1: 20, ca2: 20, ca3: 20 },
    ]);
    await publishSubject(bundle);

    await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { isAbsent: true }));
    const mid1 = await resultFor(bundle, mid);
    expect(mid1.subjectPosition).toBe(1); // re-ranked as in the previous test

    // Correct back: the 3rd evaluation score WAS 90 (a data-entry mistake
    // calling it absent) — restore it.
    const restore = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { rawScore: 90 }));
    expect(restore.status).toBe(200);

    const afterHigh = await resultFor(bundle, high);
    const afterMid = await resultFor(bundle, mid);
    expect(afterHigh.status).toBe("PUBLISHED");
    expect(Number(afterHigh.totalScore)).toBe(50);
    expect(afterHigh.subjectPosition).toBe(1);
    expect(afterMid.subjectPosition).toBe(2);

    const score = await prisma.evaluationScore.findUniqueOrThrow({
      where: { evaluationId_studentId: { evaluationId: bundle.evaluationIds[2], studentId: high } },
    });
    expect(Number(score.rawScore)).toBe(90);
    expect(score.isAbsent).toBe(false);
  });

  it("TEACHER still 409s on both directions — the published lock is unchanged for them", async () => {
    const bundle = await createScratchBundle("TeacherBlocked");
    const [high] = bundle.studentIds;
    await scoreAll(sunriseAdminToken, bundle, [
      { ca1: 30, ca2: 30, ca3: 90 },
      { ca1: 40, ca2: 40, ca3: 40 },
      { ca1: 20, ca2: 20, ca3: 20 },
    ]);
    await publishSubject(bundle);

    const markAbsent = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseTeacherToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { isAbsent: true }));
    expect(markAbsent.status).toBe(409);
    expect(markAbsent.body.lockedStudentIds).toEqual([high]);

    const restore = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseTeacherToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { rawScore: 50 }));
    expect(restore.status).toBe(409);
    expect(restore.body.lockedStudentIds).toEqual([high]);

    const unchanged = await resultFor(bundle, high);
    expect(Number(unchanged.totalScore)).toBe(50);
  });

  it("a CLOSED term still blocks the admin correction pending unlock — the published-bypass never leaks into the closed-term gate", async () => {
    const bundle = await createScratchBundle("ClosedTerm");
    const [high] = bundle.studentIds;
    await scoreAll(sunriseAdminToken, bundle, [
      { ca1: 30, ca2: 30, ca3: 90 },
      { ca1: 40, ca2: 40, ca3: 40 },
      { ca1: 20, ca2: 20, ca3: 20 },
    ]);
    await publishSubject(bundle);

    const closeRes = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));
    expect(closeRes.status).toBe(200);

    const markAbsent = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { isAbsent: true }));
    expect(markAbsent.status).toBe(409);
    expect(markAbsent.body.termLocked).toBe(true);

    const unchanged = await resultFor(bundle, high);
    expect(Number(unchanged.totalScore)).toBe(50);
    expect(unchanged.status).toBe("PUBLISHED");

    // Unlocking this exact class+subject re-opens the SAME admin correction.
    const unlockRes = await request(app.getHttpServer())
      .post(`/api/v1/terms/${bundle.termId}/unlock`)
      .set(auth(sunriseAdminToken))
      .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Correcting a published absence" });
    expect(unlockRes.status).toBe(200);

    const markAbsentAfterUnlock = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { isAbsent: true }));
    expect(markAbsentAfterUnlock.status).toBe(200);
    const afterUnlock = await resultFor(bundle, high);
    expect(Number(afterUnlock.totalScore)).toBe(30);
    expect(afterUnlock.status).toBe("PUBLISHED");
  });

  it("the DB CHECK constraint still rejects a hand-crafted both-set row, entirely bypassing the DTO", async () => {
    const bundle = await createScratchBundle("CheckCanary");
    const [high] = bundle.studentIds;
    await expect(
      prisma.evaluationScore.upsert({
        where: { evaluationId_studentId: { evaluationId: bundle.evaluationIds[2], studentId: high } },
        update: { rawScore: 50, isAbsent: true },
        create: {
          evaluationId: bundle.evaluationIds[2],
          studentId: high,
          rawScore: 50,
          isAbsent: true,
          enteredBy: teacherUserId,
          enteredAt: new Date(),
        },
      }),
    ).rejects.toThrow(/constraint|check/i);
  });

  it("concurrency: an admin correction on one subject and a publish on a DIFFERENT subject of the same arm, fired concurrently, don't deadlock and both land correctly", async () => {
    const bundle = await createScratchBundle("Concurrency");
    const [high, mid, low] = bundle.studentIds;

    // subjectA (the bundle's own subject): scored + published, then corrected concurrently below.
    await scoreAll(sunriseAdminToken, bundle, [
      { ca1: 30, ca2: 30, ca3: 90 },
      { ca1: 40, ca2: 40, ca3: 40 },
      { ca1: 20, ca2: 20, ca3: 20 },
    ]);
    await publishSubject(bundle);

    // subjectB: a second subject on the SAME class arm, scored but left
    // DRAFT — published concurrently with subjectA's correction.
    const subjectB = await prisma.subject.create({ data: { schoolId: sunriseId, name: `E2E MAP ConcB ${Date.now()}`, code: `MAPB${Date.now()}`.slice(0, 10).toUpperCase() } });
    createdSubjectIds.push(subjectB.id);
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: subjectB.id, classArmId: bundle.classArmId, sessionId: bundle.sessionId, teacherUserId },
    });
    const subjectBEvaluationIds = await createEvaluationsFor(subjectB.id, bundle.classArmId, bundle.sessionId, bundle.termId);
    for (const studentId of [high, mid, low]) {
      for (const evaluationId of subjectBEvaluationIds) {
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: bundle.classArmId, subjectId: subjectB.id, evaluationId, termId: bundle.termId, scores: [{ studentId, rawScore: 60 }] });
      }
    }

    const [correctionRes, publishBRes] = await Promise.all([
      request(app.getHttpServer())
        .put("/api/v1/grades/evaluation-scores")
        .set(auth(sunriseAdminToken))
        .send(scoreBody(bundle, bundle.evaluationIds[2], high, { isAbsent: true })),
      request(app.getHttpServer())
        .post("/api/v1/grades/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: subjectB.id, termId: bundle.termId }),
    ]);

    expect(correctionRes.status).toBe(200);
    expect(publishBRes.status).toBe(200);

    const afterHigh = await resultFor(bundle, high);
    expect(afterHigh.status).toBe("PUBLISHED");
    expect(Number(afterHigh.totalScore)).toBe(30);

    const subjectBHigh = await prisma.termSubjectResult.findUniqueOrThrow({
      where: { studentId_subjectId_termId_sessionId: { studentId: high, subjectId: subjectB.id, termId: bundle.termId, sessionId: bundle.sessionId } },
    });
    expect(subjectBHigh.status).toBe("PUBLISHED");

    // Overall reflects BOTH subjects consistently — no lost update from
    // either transaction racing the other's class-arm-lock-held cascade.
    const overallHigh = await overallFor(bundle, high);
    expect(overallHigh.subjectsCount).toBe(2);
    expect(overallHigh.status).toBe("PUBLISHED");
  });

  it("404s (not 403) cross-tenant", async () => {
    const bundle = await createScratchBundle("CrossTenant");
    const [high] = bundle.studentIds;
    await scoreAll(sunriseAdminToken, bundle, [
      { ca1: 30, ca2: 30, ca3: 90 },
      { ca1: 40, ca2: 40, ca3: 40 },
      { ca1: 20, ca2: 20, ca3: 20 },
    ]);
    await publishSubject(bundle);

    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(hillcrestAdminToken))
      .send(scoreBody(bundle, bundle.evaluationIds[2], high, { isAbsent: true }));
    expect(response.status).toBe(404);
  });
});
