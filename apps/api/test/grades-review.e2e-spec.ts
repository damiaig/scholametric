import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// One dedicated scratch arm, fixed roster of 4 students enrolled once in
// beforeAll — rosterSize must stay CONSTANT across every test in this file
// (it's a whole-arm count, not per-subject), so no test may enroll
// additional students later. Each test uses its own fresh scratch subject
// for score-level isolation, same discipline as grades-publish.e2e-spec.ts.
describe("GET /grades/review (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss2LevelId: string;
  let reviewArmId: string;
  let studentIds: string[];

  let hillcrestId: string;
  let hillcrestArmId: string;
  let hillcrestTermId: string;

  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];
  let teacherUserId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  // v0.7 step 1 (SPEC_V0.7.md §2/§5): evaluations replace the fixed
  // CA1/CA2/Exam components — 3 plain CA evaluations per subject, created
  // directly via Prisma (no create-evaluation HTTP endpoint yet, Step 2).
  async function createEvaluations(subjectId: string): Promise<string[]> {
    const ids: string[] = [];
    for (const name of ["CA 1", "CA 2", "CA 3"]) {
      const evaluation = await prisma.evaluation.create({
        data: { schoolId: sunriseId, classArmId: reviewArmId, subjectId, sessionId: sunriseSessionId, termId: sunriseTermId, name, description: name, createdBy: teacherUserId },
      });
      ids.push(evaluation.id);
    }
    return ids;
  }

  // SPEC_V0.5.1.md §2.1/§2.2: PUT /grades/evaluation-scores now 404s
  // without a subject_teacher_assignment for admin too — upsert one for
  // whatever subject this call is scoring (GET /grades/review has no
  // TEACHER path at all, so which teacher holds it doesn't affect any
  // RBAC assertion in this file).
  async function score(subjectId: string, evaluationId: string, scores: { studentId: string; rawScore: number }[]) {
    await prisma.subjectTeacherAssignment.upsert({
      where: { subjectId_classArmId_sessionId: { subjectId, classArmId: reviewArmId, sessionId: sunriseSessionId } },
      update: {},
      create: { schoolId: sunriseId, subjectId, classArmId: reviewArmId, sessionId: sunriseSessionId, teacherUserId },
    });
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: reviewArmId, subjectId, evaluationId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`score failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;

    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;
    reviewArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-Review-${Date.now()}` } })).id;

    studentIds = [];
    for (let i = 0; i < 4; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-REV/${i}`,
          firstName: "Review",
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348029${String(i).padStart(6, "0")}`,
        },
      });
      await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: student.id, classArmId: reviewArmId, sessionId: sunriseSessionId } });
      createdStudentIds.push(student.id);
      studentIds.push(student.id);
    }

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;

    teacherUserId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;
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
    if (reviewArmId) {
      await prisma.classArm.delete({ where: { id: reviewArmId } });
    }
    await app.close();
  });

  it("returns per-status COUNTS (not one enum), a hand-verified average, and rosterSize independent of who's scored", async () => {
    const subjectId = await createSubject("E2E Review Mixed");
    const [ca1, ca2, ca3] = await createEvaluations(subjectId);
    // s0: all 3 evaluations scored -> DRAFT (v0.7: no PENDING_APPROVAL
    // hop — everything not yet published is DRAFT).
    await score(subjectId, ca1, [{ studentId: studentIds[0], rawScore: 20 }]);
    await score(subjectId, ca2, [{ studentId: studentIds[0], rawScore: 60 }]);
    await score(subjectId, ca3, [{ studentId: studentIds[0], rawScore: 40 }]);
    // s1: all 3 evaluations scored too -> DRAFT.
    await score(subjectId, ca1, [{ studentId: studentIds[1], rawScore: 10 }]);
    await score(subjectId, ca2, [{ studentId: studentIds[1], rawScore: 10 }]);
    await score(subjectId, ca3, [{ studentId: studentIds[1], rawScore: 10 }]);
    // s2, s3: untouched entirely.
    // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q1) — averageScore reads
    // term_subject_result.totalScore, which is now the average of
    // PUBLISHED evaluations only. Nothing is published here, so both
    // students' totals stay 0 regardless of what they're scored —
    // average = (0 + 0) / 2 = 0 -> F9 (0-39).

    const response = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: reviewArmId, termId: sunriseTermId })
      .set(auth(sunriseAdminToken));
    expect(response.status).toBe(200);
    const subject = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectId);
    expect(subject.rosterSize).toBe(4);
    expect(subject.draftCount).toBe(2);
    expect(subject.pendingApprovalCount).toBe(0); // v0.7: always 0 now — kept for shape stability only
    expect(subject.publishedCount).toBe(0);
    expect(subject.averageScore).toBe(0);
    expect(subject.averageGrade).toBe("F9");
    // v0.7.4 step 1 (SPEC_V0.7.4.md §2) — this page is pure read-only
    // oversight now; canPublish is gone from the response entirely
    // (publish/unpublish happens at the evaluation surface). The old
    // canPublish-vs-real-publish() 409 tests are removed along with it —
    // the underlying evaluation completeness gate is already covered
    // exhaustively in grades-publish.e2e-spec.ts's own suite.
  });

  // v0.7.4 step 1 (SPEC_V0.7.4.md §2 Q2) — the completeness gate is now
  // roster-wide (every CURRENTLY ENROLLED student in the class arm), so
  // this test uses its OWN small, dedicated class arm rather than the
  // shared reviewArmId (whose rosterSize must stay constant at 4 for the
  // other tests in this file, and whose OTHER 3 students are never
  // scored on this subject).
  it("status= filter: 'at least one student in this status'", async () => {
    const statusFilterArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-ReviewStatusFilter-${Date.now()}` },
    });
    const statusFilterStudent = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-REV/StatusFilter-${Date.now()}`,
        firstName: "ReviewStatusFilter",
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date(Date.UTC(2012, 0, 1)),
        guardianName: "E2E Guardian",
        guardianPhone: `+2348029${String(Date.now()).slice(-6)}`,
      },
    });
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: statusFilterStudent.id, classArmId: statusFilterArm.id, sessionId: sunriseSessionId } });

    const subjectId = await createSubject("E2E Review StatusFilter");
    const ca1 = await prisma.evaluation.create({
      data: { schoolId: sunriseId, classArmId: statusFilterArm.id, subjectId, sessionId: sunriseSessionId, termId: sunriseTermId, name: "CA 1", description: "CA 1", createdBy: teacherUserId },
    });
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId, classArmId: statusFilterArm.id, sessionId: sunriseSessionId, teacherUserId },
    });
    const scoreRes = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: statusFilterArm.id, subjectId, evaluationId: ca1.id, termId: sunriseTermId, scores: [{ studentId: statusFilterStudent.id, rawScore: 20 }] });
    expect(scoreRes.status).toBe(200);
    const publishRes = await request(app.getHttpServer())
      .post(`/api/v1/grades/evaluations/${ca1.id}/publish`)
      .set(auth(sunriseAdminToken));
    expect(publishRes.status).toBe(200);

    const publishedOnly = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: statusFilterArm.id, termId: sunriseTermId, status: "PUBLISHED" })
      .set(auth(sunriseAdminToken));
    expect(publishedOnly.body.subjects.some((s: { subjectId: string }) => s.subjectId === subjectId)).toBe(true);

    const draftOnly = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: statusFilterArm.id, termId: sunriseTermId, status: "DRAFT" })
      .set(auth(sunriseAdminToken));
    expect(draftOnly.body.subjects.some((s: { subjectId: string }) => s.subjectId === subjectId)).toBe(false);

    await prisma.evaluationScore.deleteMany({ where: { evaluationId: ca1.id } });
    await prisma.evaluation.delete({ where: { id: ca1.id } });
    await prisma.termSubjectResult.deleteMany({ where: { subjectId } });
    await prisma.termOverallResult.deleteMany({ where: { studentId: statusFilterStudent.id } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: statusFilterStudent.id } });
    await prisma.student.delete({ where: { id: statusFilterStudent.id } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { classArmId: statusFilterArm.id } });
    await prisma.classArm.delete({ where: { id: statusFilterArm.id } });
  });

  it("403s a TEACHER categorically — no teacher path exists on this route", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: reviewArmId, termId: sunriseTermId })
      .set(auth(sunriseTeacherToken));
    expect(response.status).toBe(403);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/grades/review").query({ classArmId: reviewArmId, termId: sunriseTermId });
    expect(response.status).toBe(401);
  });

  it("404s (not 403) cross-tenant, both directions", async () => {
    const a = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: hillcrestArmId, termId: hillcrestTermId })
      .set(auth(sunriseAdminToken));
    expect(a.status).toBe(404);

    const b = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: reviewArmId, termId: sunriseTermId })
      .set(auth(hillcrestAdminToken));
    expect(b.status).toBe(404);
  });
});
