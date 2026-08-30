import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("GET /students/:id/results (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let teacherClassToken: string; // class-teacher of studentArmId
  let teacherSubjectToken: string; // subject-teacher of ONE subject there
  let teacherUnrelatedToken: string; // zero relationship
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let studentArmId: string;
  let targetStudentId: string;
  let classmateId: string;
  let untouchedStudentId: string; // enrolled, never scored anything -> overall: null
  let subjectId: string;
  let otherSubjectId: string; // taught by nobody assigned here — proves "full access, not filtered"

  let hillcrestId: string;
  let hillcrestStudentId: string;
  let hillcrestTermId: string;
  let hillcrestSessionId: string;

  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];
  let studentArmCreated = false;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  // v0.7 step 1 (SPEC_V0.7.md §2/§5): evaluations replace the fixed
  // CA1/CA2/Exam components — created directly via Prisma (no
  // create-evaluation HTTP endpoint yet, Step 2).
  async function createEvaluation(subjectIdArg: string, name: string, createdBy: string): Promise<string> {
    const evaluation = await prisma.evaluation.create({
      data: { schoolId: sunriseId, classArmId: studentArmId, subjectId: subjectIdArg, sessionId: sunriseSessionId, termId: sunriseTermId, name, description: name, createdBy },
    });
    return evaluation.id;
  }

  async function score(subjectIdArg: string, evaluationId: string, scores: { studentId: string; rawScore: number }[]) {
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: studentArmId, subjectId: subjectIdArg, evaluationId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`score failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    teacherClassToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    teacherSubjectToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    teacherUnrelatedToken = await loginAs(app, "teacher3@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;

    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    studentArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-StudentResults-${Date.now()}` } })).id;
    studentArmCreated = true;

    async function enroll(prefix: string, index: number): Promise<string> {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-SR/${prefix}`,
          firstName: prefix,
          lastName: "Student",
          gender: Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + index)),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348028${String(index).padStart(6, "0")}`,
        },
      });
      await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: student.id, classArmId: studentArmId, sessionId: sunriseSessionId } });
      createdStudentIds.push(student.id);
      return student.id;
    }
    targetStudentId = await enroll("Target", 0);
    classmateId = await enroll("Classmate", 1);
    untouchedStudentId = await enroll("Untouched", 2);

    const teacherClass = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher2@sunrise.test" } });
    await prisma.classTeacherAssignment.create({
      data: { schoolId: sunriseId, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: teacherClass.id },
    });

    subjectId = await createSubject("E2E SR Mathematics");
    otherSubjectId = await createSubject("E2E SR OtherSubject");
    const teacherSubject = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    // Assigned to `subjectId` only — the "full access, not filtered" proof
    // depends on this teacher ALSO seeing otherSubjectId, which they don't teach.
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: teacherSubject.id },
    });
    // otherSubjectId is taught by teacherClass instead (SPEC_V0.5.1.md
    // §2.1/§2.2: grid entry now requires SOME assignment, even for admin)
    // — teacherClass already has full access via class-teacher status, so
    // this doesn't change what any relationship-based assertion below
    // expects; teacherSubject still doesn't teach it, which is the actual
    // "full access, not filtered" proof.
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: otherSubjectId, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: teacherClass.id },
    });

    // Target: eval1=52, eval2=60 -> total (52+60)/2=56 (C5, 55-59).
    const eval1 = await createEvaluation(subjectId, "CA 1", teacherSubject.id);
    const eval2 = await createEvaluation(subjectId, "CA 2", teacherSubject.id);
    await score(subjectId, eval1, [{ studentId: targetStudentId, rawScore: 52 }]);
    await score(subjectId, eval2, [{ studentId: targetStudentId, rawScore: 60 }]);
    // Classmate: eval1=10 only, eval2 never entered -> total 10 (F9).
    await score(subjectId, eval1, [{ studentId: classmateId, rawScore: 10 }]);
    // Class average for this subject = (56 + 10) / 2 = 33 -> F9 — distinct
    // from the target's own finalGrade (C5), proving this is a real
    // class-wide average, not an echo of the student's own grade.

    // Target also touched otherSubjectId, taught only by teacherSubject's
    // colleague (nobody assigned here) — this row must still appear for
    // ANY teacher with a relationship to the arm (full access, not filtered).
    const otherEval = await createEvaluation(otherSubjectId, "CA 1", teacherClass.id);
    await score(otherSubjectId, otherEval, [{ studentId: targetStudentId, rawScore: 15 }]);

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    hillcrestSessionId = hillcrestSession.id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSessionId, name: "FIRST" } })).id;
    hillcrestStudentId = (await prisma.student.findFirstOrThrow({ where: { schoolId: hillcrestId } })).id;
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
    if (studentArmCreated) {
      await prisma.classTeacherAssignment.deleteMany({ where: { classArmId: studentArmId } });
      await prisma.classArm.delete({ where: { id: studentArmId } });
    }
    await app.close();
  });

  it("ADMIN sees the student's full results with a hand-verified class average grade", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${targetStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
      .set(auth(sunriseAdminToken));
    expect(response.status).toBe(200);
    const subject = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectId);
    expect(subject.totalScore).toBe(56);
    expect(subject.finalGrade).toBe("C5");
    expect(subject.classAverageScore).toBe(33);
    expect(subject.classAverageGrade).toBe("F9");
    expect(response.body.subjects).toHaveLength(2); // subjectId + otherSubjectId
  });

  it("overall is null when a student has zero results this term (nothing entered at all)", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${untouchedStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
      .set(auth(sunriseAdminToken));
    expect(response.status).toBe(200);
    expect(response.body.subjects).toHaveLength(0);
    expect(response.body.overall).toBeNull();
  });

  it("TEACHER who is class-teacher of the arm sees the student's FULL results, all subjects", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${targetStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
      .set(auth(teacherClassToken));
    expect(response.status).toBe(200);
    expect(response.body.subjects).toHaveLength(2);
  });

  it("TEACHER with only a SUBJECT assignment (not class-teacher) still sees the student's FULL results — deliberately not filtered per subject", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${targetStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
      .set(auth(teacherSubjectToken));
    expect(response.status).toBe(200);
    const subjectNames = response.body.subjects.map((s: { subjectName: string }) => s.subjectName);
    expect(subjectNames).toContain("E2E SR Mathematics");
    // The proof: this teacher does NOT teach otherSubjectId, yet it's
    // still visible — "any relationship -> full access", not per-subject.
    expect(subjectNames).toContain("E2E SR OtherSubject");
  });

  it("TEACHER with zero relationship to the student's class arm is 403'd", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${targetStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
      .set(auth(teacherUnrelatedToken));
    expect(response.status).toBe(403);
  });

  it("404s when the student has no enrollment for the given session", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${targetStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: hillcrestSessionId })
      .set(auth(sunriseAdminToken));
    // hillcrestSessionId doesn't even resolve within Sunrise's tenant scope
    // for the term check — this exercises the same 404-before-403 ordering.
    expect(response.status).toBe(404);
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/students/${targetStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: sunriseSessionId });
    expect(response.status).toBe(401);
  });

  it("404s (not 403) cross-tenant, both directions", async () => {
    const a = await request(app.getHttpServer())
      .get(`/api/v1/students/${hillcrestStudentId}/results`)
      .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
      .set(auth(sunriseAdminToken));
    expect(a.status).toBe(404);

    const b = await request(app.getHttpServer())
      .get(`/api/v1/students/${targetStudentId}/results`)
      .query({ termId: hillcrestTermId, sessionId: hillcrestSessionId })
      .set(auth(hillcrestAdminToken));
    expect(b.status).toBe(404);
  });
});
