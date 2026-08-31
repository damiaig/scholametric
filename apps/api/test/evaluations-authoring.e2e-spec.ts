import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 2 (SPEC_V0.7.md §3): GET/POST /grades/evaluations, PATCH/DELETE
// /grades/evaluations/:id — the authoring surface Step 1 deferred. Reuses
// the real seeded Sunrise/Hillcrest schools and the shared scratch-subject
// pattern from evaluations-engine.e2e-spec.ts for most probes; the
// closed-term round trip needs its OWN session+term+class-arm bundle
// (mirroring terms.e2e-spec.ts's createScratchBundle) since term close is
// one-way and must never touch the school's real, shared First Term.
describe("Evaluation authoring (e2e) — SPEC_V0.7.md §3, step 2", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseMathTeacherToken: string; // teacher@sunrise.test — assigned to scratchSubjectId below
  let sunriseEnglishTeacherToken: string; // teacher2@sunrise.test — assigned English only, unassigned probe
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss2AArmId: string;
  let jss2LevelId: string;
  let mathTeacherId: string;
  let jss2ARoster: { id: string }[];

  let hillcrestId: string;
  let hillcrestTermId: string;
  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestEvaluationId: string;

  let scratchSubjectId: string; // assigned to mathTeacherId — general create/edit/delete probes
  let noAssignmentSubjectId: string; // zero teacher assignments at all

  const createdSessionIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdClassArmIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createEvaluation(subjectId: string, classArmId: string, termId: string, sessionId: string, name = "CA 1"): Promise<string> {
    const evaluation = await prisma.evaluation.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name, description: name, createdBy: mathTeacherId },
    });
    return evaluation.id;
  }

  interface ScratchBundle {
    sessionId: string;
    termId: string;
    classArmId: string;
    subjectId: string;
    studentIds: string[];
  }

  // Own session/term/class-arm/subject/roster, fully isolated — needed only
  // for the closed-term round trip (term close is one-way, no reopen).
  async function createScratchBundle(prefix: string, studentCount = 3): Promise<ScratchBundle> {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-EvalAuth-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-EvalAuth-${stamp}` },
    });
    createdClassArmIds.push(classArm.id);
    const subject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E EvalAuth ${stamp}`, code: `EA${stamp.slice(-6)}`.slice(0, 10).toUpperCase() },
    });
    createdSubjectIds.push(subject.id);
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: subject.id, classArmId: classArm.id, sessionId: session.id, teacherUserId: mathTeacherId },
    });

    const studentIds: string[] = [];
    for (let i = 0; i < studentCount; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-EA/${stamp}/${i}`,
          firstName: "EvalAuth",
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348032${String(Date.now() + i).slice(-6)}`,
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

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseMathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    sunriseEnglishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;

    const mathTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    mathTeacherId = mathTeacher.id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;
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
          sessionId: hillcrestSession.id,
          termId: hillcrestTermId,
          name: "CA 1",
          description: "CA 1",
          createdBy: hillcrestAdmin.id,
        },
      })
    ).id;

    const scratchSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: "E2E Eval Authoring Scratch", code: "E2EEAS" },
    });
    scratchSubjectId = scratchSubject.id;
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: scratchSubjectId, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
    });

    const noAssignmentSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: "E2E Eval Authoring No Assignment", code: "E2EEAN" },
    });
    noAssignmentSubjectId = noAssignmentSubject.id;

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
  });

  afterAll(async () => {
    await prisma.termUnlock.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.evaluationScore.deleteMany({ where: { evaluation: { subjectId: scratchSubjectId } } });
    await prisma.evaluation.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.termSubjectResult.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subject.delete({ where: { id: scratchSubjectId } });
    await prisma.subject.delete({ where: { id: noAssignmentSubjectId } });
    await prisma.evaluationScore.deleteMany({ where: { evaluationId: hillcrestEvaluationId } });
    await prisma.evaluation.deleteMany({ where: { id: hillcrestEvaluationId } });

    const bundleEvaluations = await prisma.evaluation.findMany({ where: { termId: { in: createdTermIds } }, select: { id: true } });
    await prisma.evaluationScore.deleteMany({ where: { evaluationId: { in: bundleEvaluations.map((e) => e.id) } } });
    await prisma.evaluation.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.termSubjectResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.termOverallResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  describe("GET /grades/evaluations", () => {
    it("lists evaluations for a TEACHER's own assignment, newest-created-last", async () => {
      const first = await createEvaluation(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "E2E List First");
      const second = await createEvaluation(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "E2E List Second");
      try {
        const response = await request(app.getHttpServer())
          .get("/api/v1/grades/evaluations")
          .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId })
          .set(auth(sunriseMathTeacherToken));
        expect(response.status).toBe(200);
        const ids = response.body.evaluations.map((e: { id: string }) => e.id);
        expect(ids.indexOf(first)).toBeLessThan(ids.indexOf(second));
        expect(response.body.termClosed).toBe(false);
        expect(response.body.locked).toBe(false);
      } finally {
        await prisma.evaluation.deleteMany({ where: { id: { in: [first, second] } } });
      }
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluations")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER on a same-tenant subject they aren't assigned to", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluations")
        .query({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId })
        .set(auth(sunriseEnglishTeacherToken));
      expect(response.status).toBe(403);
    });

    it("404s (not 403) SCHOOL_ADMIN against a subject with no teacher assigned at all", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluations")
        .query({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(404);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluations")
        .query({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId })
        .set(auth(sunriseAdminToken));
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluations")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId })
        .set(auth(hillcrestAdminToken));
      expect(b.status).toBe(404);
    });

    it("400s on a missing query param", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/grades/evaluations")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(400);
    });
  });

  describe("POST /grades/evaluations", () => {
    it("a TEACHER creates an evaluation with a name and description", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "Mid-term Test", description: "Covers chapters 1-4" });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Mid-term Test");
      expect(response.body.description).toBe("Covers chapters 1-4");
      expect(response.body.createdBy).toBe(mathTeacherId);

      const persisted = await prisma.evaluation.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(persisted.name).toBe("Mid-term Test");
      expect(persisted.deletedAt).toBeNull();
      await prisma.evaluation.delete({ where: { id: response.body.id } });
    });

    it("SCHOOL_ADMIN and PROPRIETOR can also create (matching the scoring endpoint's roles)", async () => {
      const adminRes = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "Admin-created", description: "Admin stepping in" });
      expect(adminRes.status).toBe(201);
      await prisma.evaluation.delete({ where: { id: adminRes.body.id } });

      const proprietorRes = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "Proprietor-created", description: "Owner stepping in" });
      expect(proprietorRes.status).toBe(201);
      await prisma.evaluation.delete({ where: { id: proprietorRes.body.id } });
    });

    it("400s a missing name, writing nothing", async () => {
      const before = await prisma.evaluation.count({ where: { subjectId: scratchSubjectId } });
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, description: "No name given" });
      expect(response.status).toBe(400);
      expect(await prisma.evaluation.count({ where: { subjectId: scratchSubjectId } })).toBe(before);
    });

    it("400s a name over the 200-character cap", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x".repeat(201), description: "ok" });
      expect(response.status).toBe(400);
    });

    it("400s a description over the 2000-character cap", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "ok", description: "x".repeat(2001) });
      expect(response.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x", description: "y" });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER not assigned to this subject", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseEnglishTeacherToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x", description: "y" });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) SCHOOL_ADMIN/PROPRIETOR against a subject with no teacher assigned at all", async () => {
      const adminRes = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId, name: "x", description: "y" });
      expect(adminRes.status).toBe(404);

      const proprietorRes = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId, name: "x", description: "y" });
      expect(proprietorRes.status).toBe(404);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId, name: "x", description: "y" });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(hillcrestAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x", description: "y" });
      expect(b.status).toBe(404);
    });

    it("409s creating a new evaluation once this subject's results are already published — unpublish-first", async () => {
      const publishSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Eval Authoring Publish Probe", code: "E2EEAP" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: publishSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const evaluationId = await createEvaluation(publishSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId);
        const [student] = jss2ARoster;
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, evaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 80 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        const response = await request(app.getHttpServer())
          .post("/api/v1/grades/evaluations")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId, name: "Late addition", description: "Should be blocked" });
        expect(response.status).toBe(409);
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluation: { subjectId: publishSubject.id } } });
        await prisma.evaluation.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.termSubjectResult.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subject.delete({ where: { id: publishSubject.id } });
      }
    });
  });

  describe("PATCH /grades/evaluations/:id", () => {
    it("a TEACHER edits name/description freely while DRAFT", async () => {
      const evaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "Before edit");
      try {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseMathTeacherToken))
          .send({ name: "After edit", description: "Updated description" });
        expect(response.status).toBe(200);
        expect(response.body.name).toBe("After edit");
        expect(response.body.description).toBe("Updated description");
      } finally {
        await prisma.evaluation.delete({ where: { id: evaluationId } });
      }
    });

    it("400s when neither name nor description is provided", async () => {
      const evaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId);
      try {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseAdminToken))
          .send({});
        expect(response.status).toBe(400);
      } finally {
        await prisma.evaluation.delete({ where: { id: evaluationId } });
      }
    });

    it("rejects unauthenticated requests", async () => {
      const evaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId);
      try {
        const response = await request(app.getHttpServer()).patch(`/api/v1/grades/evaluations/${evaluationId}`).send({ name: "x" });
        expect(response.status).toBe(401);
      } finally {
        await prisma.evaluation.delete({ where: { id: evaluationId } });
      }
    });

    it("404s a nonexistent id", async () => {
      const response = await request(app.getHttpServer())
        .patch("/api/v1/grades/evaluations/00000000-0000-0000-0000-000000000000")
        .set(auth(sunriseAdminToken))
        .send({ name: "x" });
      expect(response.status).toBe(404);
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/grades/evaluations/${hillcrestEvaluationId}`)
        .set(auth(sunriseAdminToken))
        .send({ name: "x" });
      expect(response.status).toBe(404);
    });

    it("edit after publish: 403s TEACHER and SCHOOL_ADMIN, 200s PROPRIETOR (mirrors override()'s data-dependent role narrowing)", async () => {
      const publishSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Eval Authoring Edit-After-Publish", code: "E2EEAE" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: publishSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const evaluationId = await createEvaluation(publishSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId);
        const [student] = jss2ARoster;
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, evaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 60 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        const teacherRes = await request(app.getHttpServer())
          .patch(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseMathTeacherToken))
          .send({ name: "Teacher attempt" });
        expect(teacherRes.status).toBe(403);

        const adminRes = await request(app.getHttpServer())
          .patch(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseAdminToken))
          .send({ name: "Admin attempt" });
        expect(adminRes.status).toBe(403);

        const proprietorRes = await request(app.getHttpServer())
          .patch(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseProprietorToken))
          .send({ name: "Proprietor edit" });
        expect(proprietorRes.status).toBe(200);
        expect(proprietorRes.body.name).toBe("Proprietor edit");
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluation: { subjectId: publishSubject.id } } });
        await prisma.evaluation.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.termSubjectResult.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subject.delete({ where: { id: publishSubject.id } });
      }
    });
  });

  describe("DELETE /grades/evaluations/:id", () => {
    it("403s TEACHER and SCHOOL_ADMIN categorically, regardless of DRAFT/PUBLISHED state — PROPRIETOR-only", async () => {
      const evaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "E2E Delete RBAC");
      try {
        const teacherRes = await request(app.getHttpServer())
          .delete(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseMathTeacherToken));
        expect(teacherRes.status).toBe(403);

        const adminRes = await request(app.getHttpServer())
          .delete(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseAdminToken));
        expect(adminRes.status).toBe(403);

        const stillThere = await prisma.evaluation.findUnique({ where: { id: evaluationId } });
        expect(stillThere?.deletedAt).toBeNull();
      } finally {
        await prisma.evaluation.delete({ where: { id: evaluationId } });
      }
    });

    it("PROPRIETOR deletes a DRAFT evaluation: soft-deletes, recomputes, and excludes it from every subsequent average", async () => {
      const deleteSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Eval Authoring Delete Recompute", code: "E2EEAD" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: deleteSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const keepId = await createEvaluation(deleteSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId, "Keep");
        const removeId = await createEvaluation(deleteSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId, "Remove");
        const [student] = jss2ARoster;

        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: deleteSubject.id, evaluationId: keepId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 20 }] });
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: deleteSubject.id, evaluationId: removeId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 10 }] });

        const before = await prisma.termSubjectResult.findUniqueOrThrow({
          where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: deleteSubject.id, termId: sunriseTermId, sessionId: sunriseSessionId } },
        });
        expect(Number(before.totalScore)).toBe(15); // (20 + 10) / 2

        const deleteRes = await request(app.getHttpServer())
          .delete(`/api/v1/grades/evaluations/${removeId}`)
          .set(auth(sunriseProprietorToken));
        expect(deleteRes.status).toBe(200);

        const deleted = await prisma.evaluation.findUniqueOrThrow({ where: { id: removeId } });
        expect(deleted.deletedAt).not.toBeNull();

        const after = await prisma.termSubjectResult.findUniqueOrThrow({
          where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: deleteSubject.id, termId: sunriseTermId, sessionId: sunriseSessionId } },
        });
        // Only "Keep" (20) counts now — the deleted evaluation's score no
        // longer contributes at all, not just to this call but to every
        // subsequent recompute (deletedAt: null is already the filter every
        // recompute/completeness function applies).
        expect(Number(after.totalScore)).toBe(20);

        const recomputeRes = await request(app.getHttpServer())
          .post("/api/v1/grades/recompute")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: deleteSubject.id, termId: sunriseTermId });
        expect(recomputeRes.status).toBe(200);
        const afterRecompute = await prisma.termSubjectResult.findUniqueOrThrow({
          where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: deleteSubject.id, termId: sunriseTermId, sessionId: sunriseSessionId } },
        });
        expect(Number(afterRecompute.totalScore)).toBe(20);
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluation: { subjectId: deleteSubject.id } } });
        await prisma.evaluation.deleteMany({ where: { subjectId: deleteSubject.id } });
        await prisma.termSubjectResult.deleteMany({ where: { subjectId: deleteSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: deleteSubject.id } });
        await prisma.subject.delete({ where: { id: deleteSubject.id } });
      }
    });

    it("409s deleting while this subject's results are published, even for PROPRIETOR — no force-delete-through-published path", async () => {
      const publishSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Eval Authoring Delete-While-Published", code: "E2EEADP" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: publishSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const evaluationId = await createEvaluation(publishSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId);
        const [student] = jss2ARoster;
        await request(app.getHttpServer())
          .put("/api/v1/grades/evaluation-scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, evaluationId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 70 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/grades/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/grades/evaluations/${evaluationId}`)
          .set(auth(sunriseProprietorToken));
        expect(response.status).toBe(409);

        const stillThere = await prisma.evaluation.findUniqueOrThrow({ where: { id: evaluationId } });
        expect(stillThere.deletedAt).toBeNull();
      } finally {
        await prisma.evaluationScore.deleteMany({ where: { evaluation: { subjectId: publishSubject.id } } });
        await prisma.evaluation.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.termSubjectResult.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subject.delete({ where: { id: publishSubject.id } });
      }
    });

    it("rejects unauthenticated requests", async () => {
      const evaluationId = await createEvaluation(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId);
      try {
        const response = await request(app.getHttpServer()).delete(`/api/v1/grades/evaluations/${evaluationId}`);
        expect(response.status).toBe(401);
      } finally {
        await prisma.evaluation.delete({ where: { id: evaluationId } });
      }
    });

    it("404s a nonexistent id", async () => {
      const response = await request(app.getHttpServer())
        .delete("/api/v1/grades/evaluations/00000000-0000-0000-0000-000000000000")
        .set(auth(sunriseProprietorToken));
      expect(response.status).toBe(404);
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/grades/evaluations/${hillcrestEvaluationId}`)
        .set(auth(sunriseProprietorToken));
      expect(response.status).toBe(404);
    });
  });

  // SPEC_V0.5.md §2.3 (v0.5 step 3), enforced here for the authoring surface
  // for the first time: the closed-term lock governs create/edit/delete
  // exactly like it already governs score entry, via the SAME
  // resolveSliceLockState + GET-list-reflects-lock-state contract the
  // frontend picker relies on to render a blocked state BEFORE submit.
  describe("Closed-term gating on the authoring surface", () => {
    it("create/edit/delete 409 while closed, unlock allows all three, relock blocks again — GET list reflects lock state at every stage", async () => {
      const bundle = await createScratchBundle("closed-term-round-trip");
      const keepEvaluationId = await createEvaluation(bundle.subjectId, bundle.classArmId, bundle.termId, bundle.sessionId, "Kept Across Close");

      const listState = () =>
        request(app.getHttpServer())
          .get("/api/v1/grades/evaluations")
          .query({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId })
          .set(auth(sunriseMathTeacherToken));

      const openState = await listState();
      expect(openState.body.termClosed).toBe(false);
      expect(openState.body.locked).toBe(false);
      expect(openState.body.unlockReason).toBeNull();

      const closeRes = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));
      expect(closeRes.status).toBe(200);

      const closedLockedState = await listState();
      expect(closedLockedState.body.termClosed).toBe(true);
      expect(closedLockedState.body.locked).toBe(true);
      expect(closedLockedState.body.unlockReason).toBeNull();

      const createBlocked = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId, name: "Blocked create", description: "Should 409" });
      expect(createBlocked.status).toBe(409);
      expect(createBlocked.body.termLocked).toBe(true);

      const editBlocked = await request(app.getHttpServer())
        .patch(`/api/v1/grades/evaluations/${keepEvaluationId}`)
        .set(auth(sunriseMathTeacherToken))
        .send({ name: "Blocked edit" });
      expect(editBlocked.status).toBe(409);
      expect(editBlocked.body.termLocked).toBe(true);

      const deleteBlocked = await request(app.getHttpServer())
        .delete(`/api/v1/grades/evaluations/${keepEvaluationId}`)
        .set(auth(sunriseProprietorToken));
      expect(deleteBlocked.status).toBe(409);
      expect(deleteBlocked.body.termLocked).toBe(true);

      const unlockRes = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Principal approved a late correction" });
      expect(unlockRes.status).toBe(200);

      const closedUnlockedState = await listState();
      expect(closedUnlockedState.body.termClosed).toBe(true);
      expect(closedUnlockedState.body.locked).toBe(false);
      expect(closedUnlockedState.body.unlockReason).toBe("Principal approved a late correction");

      const createAllowed = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId, name: "Allowed create", description: "Unlocked" });
      expect(createAllowed.status).toBe(201);

      const editAllowed = await request(app.getHttpServer())
        .patch(`/api/v1/grades/evaluations/${keepEvaluationId}`)
        .set(auth(sunriseMathTeacherToken))
        .send({ name: "Allowed edit" });
      expect(editAllowed.status).toBe(200);

      const deleteAllowed = await request(app.getHttpServer())
        .delete(`/api/v1/grades/evaluations/${createAllowed.body.id}`)
        .set(auth(sunriseProprietorToken));
      expect(deleteAllowed.status).toBe(200);

      const relockRes = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/relock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId });
      expect(relockRes.status).toBe(200);

      const relockedState = await listState();
      expect(relockedState.body.termClosed).toBe(true);
      expect(relockedState.body.locked).toBe(true);
      expect(relockedState.body.unlockReason).toBeNull();

      const createBlockedAgain = await request(app.getHttpServer())
        .post("/api/v1/grades/evaluations")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId, name: "Blocked again", description: "Relocked" });
      expect(createBlockedAgain.status).toBe(409);
      expect(createBlockedAgain.body.termLocked).toBe(true);
    });
  });
});
