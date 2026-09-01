import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 3 (SPEC_V0.7.md §3): GET/POST /exams, PATCH/DELETE /exams/:id
// — the exam-track authoring surface, mirroring
// evaluations-authoring.e2e-spec.ts almost exactly (same fixtures/
// fixture shape), except: no `description` field, `name` is optional
// (defaults to "Exam"), and the completeness/publish gate targets
// `term_subject_exam_results` instead of `term_subject_results`.
describe("Exam authoring (e2e) — SPEC_V0.7.md §3, step 3", () => {
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
  let hillcrestExamId: string;

  let scratchSubjectId: string; // assigned to mathTeacherId — general create/edit/delete probes
  let noAssignmentSubjectId: string; // zero teacher assignments at all

  const createdSessionIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdClassArmIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createExam(subjectId: string, classArmId: string, termId: string, sessionId: string, name?: string): Promise<string> {
    const exam = await prisma.exam.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name: name ?? null, createdBy: mathTeacherId },
    });
    return exam.id;
  }

  interface ScratchBundle {
    sessionId: string;
    termId: string;
    classArmId: string;
    subjectId: string;
    studentIds: string[];
  }

  async function createScratchBundle(prefix: string, studentCount = 3): Promise<ScratchBundle> {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-ExamAuth-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-ExamAuth-${stamp}` },
    });
    createdClassArmIds.push(classArm.id);
    const subject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E ExamAuth ${stamp}`, code: `XA${stamp.slice(-6)}`.slice(0, 10).toUpperCase() },
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
          admissionNumber: `E2E-XA/${stamp}/${i}`,
          firstName: "ExamAuth",
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
    hillcrestExamId = (
      await prisma.exam.create({
        data: {
          schoolId: hillcrestId,
          classArmId: hillcrestArmId,
          subjectId: hillcrestSubjectId,
          sessionId: hillcrestSession.id,
          termId: hillcrestTermId,
          name: "Exam",
          createdBy: hillcrestAdmin.id,
        },
      })
    ).id;

    const scratchSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: "E2E Exam Authoring Scratch", code: "E2EXAS" },
    });
    scratchSubjectId = scratchSubject.id;
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: scratchSubjectId, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
    });

    const noAssignmentSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: "E2E Exam Authoring No Assignment", code: "E2EXAN" },
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
    await prisma.examScore.deleteMany({ where: { exam: { subjectId: scratchSubjectId } } });
    await prisma.exam.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: scratchSubjectId } });
    await prisma.subject.delete({ where: { id: scratchSubjectId } });
    await prisma.subject.delete({ where: { id: noAssignmentSubjectId } });
    await prisma.examScore.deleteMany({ where: { examId: hillcrestExamId } });
    await prisma.exam.deleteMany({ where: { id: hillcrestExamId } });

    const bundleExams = await prisma.exam.findMany({ where: { termId: { in: createdTermIds } }, select: { id: true } });
    await prisma.examScore.deleteMany({ where: { examId: { in: bundleExams.map((e) => e.id) } } });
    await prisma.exam.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.termSubjectExamResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.termExamResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  describe("GET /exams", () => {
    it("lists exams for a TEACHER's own assignment, newest-created-last", async () => {
      const first = await createExam(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "E2E List First");
      const second = await createExam(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "E2E List Second");
      try {
        const response = await request(app.getHttpServer())
          .get("/api/v1/exams")
          .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId })
          .set(auth(sunriseMathTeacherToken));
        expect(response.status).toBe(200);
        const ids = response.body.exams.map((e: { id: string }) => e.id);
        expect(ids.indexOf(first)).toBeLessThan(ids.indexOf(second));
        expect(response.body.termClosed).toBe(false);
        expect(response.body.locked).toBe(false);
      } finally {
        await prisma.exam.deleteMany({ where: { id: { in: [first, second] } } });
      }
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/exams")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER on a same-tenant subject they aren't assigned to", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/exams")
        .query({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId })
        .set(auth(sunriseEnglishTeacherToken));
      expect(response.status).toBe(403);
    });

    it("404s (not 403) SCHOOL_ADMIN against a subject with no teacher assigned at all", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/exams")
        .query({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(404);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .get("/api/v1/exams")
        .query({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId })
        .set(auth(sunriseAdminToken));
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .get("/api/v1/exams")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId })
        .set(auth(hillcrestAdminToken));
      expect(b.status).toBe(404);
    });

    it("400s on a missing query param", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/exams")
        .query({ classArmId: jss2AArmId, subjectId: scratchSubjectId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(400);
    });
  });

  describe("POST /exams", () => {
    it("a TEACHER creates an exam with a name", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "Mid-term Exam" });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Mid-term Exam");
      expect(response.body.createdBy).toBe(mathTeacherId);

      const persisted = await prisma.exam.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(persisted.name).toBe("Mid-term Exam");
      expect(persisted.deletedAt).toBeNull();
      await prisma.exam.delete({ where: { id: response.body.id } });
    });

    it("omitting name defaults the display name to 'Exam' — stored as null", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId });
      expect(response.status).toBe(201);
      expect(response.body.name).toBe("Exam");

      const persisted = await prisma.exam.findUniqueOrThrow({ where: { id: response.body.id } });
      expect(persisted.name).toBeNull();
      await prisma.exam.delete({ where: { id: response.body.id } });
    });

    it("SCHOOL_ADMIN and PROPRIETOR can also create (matching the scoring endpoint's roles)", async () => {
      const adminRes = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "Admin-created" });
      expect(adminRes.status).toBe(201);
      await prisma.exam.delete({ where: { id: adminRes.body.id } });

      const proprietorRes = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "Proprietor-created" });
      expect(proprietorRes.status).toBe(201);
      await prisma.exam.delete({ where: { id: proprietorRes.body.id } });
    });

    it("400s a name over the 200-character cap", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x".repeat(201) });
      expect(response.status).toBe(400);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x" });
      expect(response.status).toBe(401);
    });

    it("403s a TEACHER not assigned to this subject", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseEnglishTeacherToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x" });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) SCHOOL_ADMIN/PROPRIETOR against a subject with no teacher assigned at all", async () => {
      const adminRes = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId, name: "x" });
      expect(adminRes.status).toBe(404);

      const proprietorRes = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseProprietorToken))
        .send({ classArmId: jss2AArmId, subjectId: noAssignmentSubjectId, termId: sunriseTermId, name: "x" });
      expect(proprietorRes.status).toBe(404);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId, name: "x" });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .post("/api/v1/exams")
        .set(auth(hillcrestAdminToken))
        .send({ classArmId: jss2AArmId, subjectId: scratchSubjectId, termId: sunriseTermId, name: "x" });
      expect(b.status).toBe(404);
    });

    it("409s creating a new exam once this subject's exam results are already published — unpublish-first", async () => {
      const publishSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Exam Authoring Publish Probe", code: "E2EXAP" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: publishSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const examId = await createExam(publishSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId);
        const [student] = jss2ARoster;
        await request(app.getHttpServer())
          .put("/api/v1/exams/scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, examId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 80 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/exams/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        const response = await request(app.getHttpServer())
          .post("/api/v1/exams")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId, name: "Late addition" });
        expect(response.status).toBe(409);
      } finally {
        await prisma.examScore.deleteMany({ where: { exam: { subjectId: publishSubject.id } } });
        await prisma.exam.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subject.delete({ where: { id: publishSubject.id } });
      }
    });
  });

  describe("PATCH /exams/:id", () => {
    it("a TEACHER edits the name freely while DRAFT", async () => {
      const examId = await createExam(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "Before edit");
      try {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/exams/${examId}`)
          .set(auth(sunriseMathTeacherToken))
          .send({ name: "After edit" });
        expect(response.status).toBe(200);
        expect(response.body.name).toBe("After edit");
      } finally {
        await prisma.exam.delete({ where: { id: examId } });
      }
    });

    it("400s when name is omitted", async () => {
      const examId = await createExam(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId);
      try {
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/exams/${examId}`)
          .set(auth(sunriseAdminToken))
          .send({});
        expect(response.status).toBe(400);
      } finally {
        await prisma.exam.delete({ where: { id: examId } });
      }
    });

    it("rejects unauthenticated requests", async () => {
      const examId = await createExam(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId);
      try {
        const response = await request(app.getHttpServer()).patch(`/api/v1/exams/${examId}`).send({ name: "x" });
        expect(response.status).toBe(401);
      } finally {
        await prisma.exam.delete({ where: { id: examId } });
      }
    });

    it("404s a nonexistent id", async () => {
      const response = await request(app.getHttpServer())
        .patch("/api/v1/exams/00000000-0000-0000-0000-000000000000")
        .set(auth(sunriseAdminToken))
        .send({ name: "x" });
      expect(response.status).toBe(404);
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/exams/${hillcrestExamId}`)
        .set(auth(sunriseAdminToken))
        .send({ name: "x" });
      expect(response.status).toBe(404);
    });

    it("edit after publish: 403s TEACHER and SCHOOL_ADMIN, 200s PROPRIETOR", async () => {
      const publishSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Exam Authoring Edit-After-Publish", code: "E2EXAE" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: publishSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const examId = await createExam(publishSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId);
        const [student] = jss2ARoster;
        await request(app.getHttpServer())
          .put("/api/v1/exams/scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, examId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 60 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/exams/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        const teacherRes = await request(app.getHttpServer())
          .patch(`/api/v1/exams/${examId}`)
          .set(auth(sunriseMathTeacherToken))
          .send({ name: "Teacher attempt" });
        expect(teacherRes.status).toBe(403);

        const adminRes = await request(app.getHttpServer())
          .patch(`/api/v1/exams/${examId}`)
          .set(auth(sunriseAdminToken))
          .send({ name: "Admin attempt" });
        expect(adminRes.status).toBe(403);

        const proprietorRes = await request(app.getHttpServer())
          .patch(`/api/v1/exams/${examId}`)
          .set(auth(sunriseProprietorToken))
          .send({ name: "Proprietor edit" });
        expect(proprietorRes.status).toBe(200);
        expect(proprietorRes.body.name).toBe("Proprietor edit");
      } finally {
        await prisma.examScore.deleteMany({ where: { exam: { subjectId: publishSubject.id } } });
        await prisma.exam.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subject.delete({ where: { id: publishSubject.id } });
      }
    });
  });

  describe("DELETE /exams/:id", () => {
    it("403s TEACHER and SCHOOL_ADMIN categorically, regardless of DRAFT/PUBLISHED state — PROPRIETOR-only", async () => {
      const examId = await createExam(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId, "E2E Delete RBAC");
      try {
        const teacherRes = await request(app.getHttpServer())
          .delete(`/api/v1/exams/${examId}`)
          .set(auth(sunriseMathTeacherToken));
        expect(teacherRes.status).toBe(403);

        const adminRes = await request(app.getHttpServer())
          .delete(`/api/v1/exams/${examId}`)
          .set(auth(sunriseAdminToken));
        expect(adminRes.status).toBe(403);

        const stillThere = await prisma.exam.findUnique({ where: { id: examId } });
        expect(stillThere?.deletedAt).toBeNull();
      } finally {
        await prisma.exam.delete({ where: { id: examId } });
      }
    });

    it("PROPRIETOR deletes a DRAFT exam: soft-deletes, recomputes, and excludes it from every subsequent average", async () => {
      const deleteSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Exam Authoring Delete Recompute", code: "E2EXAD" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: deleteSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const keepId = await createExam(deleteSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId, "Keep");
        const removeId = await createExam(deleteSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId, "Remove");
        const [student] = jss2ARoster;

        await request(app.getHttpServer())
          .put("/api/v1/exams/scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: deleteSubject.id, examId: keepId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 20 }] });
        await request(app.getHttpServer())
          .put("/api/v1/exams/scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: deleteSubject.id, examId: removeId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 10 }] });

        const before = await prisma.termSubjectExamResult.findUniqueOrThrow({
          where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: deleteSubject.id, termId: sunriseTermId, sessionId: sunriseSessionId } },
        });
        expect(Number(before.totalScore)).toBe(15); // (20 + 10) / 2

        const deleteRes = await request(app.getHttpServer())
          .delete(`/api/v1/exams/${removeId}`)
          .set(auth(sunriseProprietorToken));
        expect(deleteRes.status).toBe(200);

        const deleted = await prisma.exam.findUniqueOrThrow({ where: { id: removeId } });
        expect(deleted.deletedAt).not.toBeNull();

        const after = await prisma.termSubjectExamResult.findUniqueOrThrow({
          where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: deleteSubject.id, termId: sunriseTermId, sessionId: sunriseSessionId } },
        });
        expect(Number(after.totalScore)).toBe(20);

        const recomputeRes = await request(app.getHttpServer())
          .post("/api/v1/exams/recompute")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: deleteSubject.id, termId: sunriseTermId });
        expect(recomputeRes.status).toBe(200);
        const afterRecompute = await prisma.termSubjectExamResult.findUniqueOrThrow({
          where: { studentId_subjectId_termId_sessionId: { studentId: student.id, subjectId: deleteSubject.id, termId: sunriseTermId, sessionId: sunriseSessionId } },
        });
        expect(Number(afterRecompute.totalScore)).toBe(20);
      } finally {
        await prisma.examScore.deleteMany({ where: { exam: { subjectId: deleteSubject.id } } });
        await prisma.exam.deleteMany({ where: { subjectId: deleteSubject.id } });
        await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: deleteSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: deleteSubject.id } });
        await prisma.subject.delete({ where: { id: deleteSubject.id } });
      }
    });

    it("409s deleting while this subject's exam results are published, even for PROPRIETOR — no force-delete-through-published path", async () => {
      const publishSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: "E2E Exam Authoring Delete-While-Published", code: "E2EXADP" },
      });
      try {
        await prisma.subjectTeacherAssignment.create({
          data: { schoolId: sunriseId, subjectId: publishSubject.id, classArmId: jss2AArmId, sessionId: sunriseSessionId, teacherUserId: mathTeacherId },
        });
        const examId = await createExam(publishSubject.id, jss2AArmId, sunriseTermId, sunriseSessionId);
        const [student] = jss2ARoster;
        await request(app.getHttpServer())
          .put("/api/v1/exams/scores")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, examId, termId: sunriseTermId, scores: [{ studentId: student.id, rawScore: 70 }] });
        const publishRes = await request(app.getHttpServer())
          .post("/api/v1/exams/publish")
          .set(auth(sunriseAdminToken))
          .send({ classArmId: jss2AArmId, subjectId: publishSubject.id, termId: sunriseTermId });
        expect(publishRes.status).toBe(200);

        const response = await request(app.getHttpServer())
          .delete(`/api/v1/exams/${examId}`)
          .set(auth(sunriseProprietorToken));
        expect(response.status).toBe(409);

        const stillThere = await prisma.exam.findUniqueOrThrow({ where: { id: examId } });
        expect(stillThere.deletedAt).toBeNull();
      } finally {
        await prisma.examScore.deleteMany({ where: { exam: { subjectId: publishSubject.id } } });
        await prisma.exam.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: publishSubject.id } });
        await prisma.subject.delete({ where: { id: publishSubject.id } });
      }
    });

    it("rejects unauthenticated requests", async () => {
      const examId = await createExam(scratchSubjectId, jss2AArmId, sunriseTermId, sunriseSessionId);
      try {
        const response = await request(app.getHttpServer()).delete(`/api/v1/exams/${examId}`);
        expect(response.status).toBe(401);
      } finally {
        await prisma.exam.delete({ where: { id: examId } });
      }
    });

    it("404s a nonexistent id", async () => {
      const response = await request(app.getHttpServer())
        .delete("/api/v1/exams/00000000-0000-0000-0000-000000000000")
        .set(auth(sunriseProprietorToken));
      expect(response.status).toBe(404);
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/exams/${hillcrestExamId}`)
        .set(auth(sunriseProprietorToken));
      expect(response.status).toBe(404);
    });
  });

  describe("Closed-term gating on the authoring surface", () => {
    it("create/edit/delete 409 while closed, unlock allows all three, relock blocks again — GET list reflects lock state at every stage", async () => {
      const bundle = await createScratchBundle("closed-term-round-trip");
      const keepExamId = await createExam(bundle.subjectId, bundle.classArmId, bundle.termId, bundle.sessionId, "Kept Across Close");

      const listState = () =>
        request(app.getHttpServer())
          .get("/api/v1/exams")
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
        .post("/api/v1/exams")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId, name: "Blocked create" });
      expect(createBlocked.status).toBe(409);
      expect(createBlocked.body.termLocked).toBe(true);

      const editBlocked = await request(app.getHttpServer())
        .patch(`/api/v1/exams/${keepExamId}`)
        .set(auth(sunriseMathTeacherToken))
        .send({ name: "Blocked edit" });
      expect(editBlocked.status).toBe(409);
      expect(editBlocked.body.termLocked).toBe(true);

      const deleteBlocked = await request(app.getHttpServer())
        .delete(`/api/v1/exams/${keepExamId}`)
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
        .post("/api/v1/exams")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId, name: "Allowed create" });
      expect(createAllowed.status).toBe(201);

      const editAllowed = await request(app.getHttpServer())
        .patch(`/api/v1/exams/${keepExamId}`)
        .set(auth(sunriseMathTeacherToken))
        .send({ name: "Allowed edit" });
      expect(editAllowed.status).toBe(200);

      const deleteAllowed = await request(app.getHttpServer())
        .delete(`/api/v1/exams/${createAllowed.body.id}`)
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
        .post("/api/v1/exams")
        .set(auth(sunriseMathTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, termId: bundle.termId, name: "Blocked again" });
      expect(createBlockedAgain.status).toBe(409);
      expect(createBlockedAgain.body.termLocked).toBe(true);
    });
  });
});
