import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// Two dedicated scratch class arms (same isolation discipline as
// grades-publish.e2e-spec.ts): `resultsArmId` for the shape/RBAC/
// averaging tests (subject-level isolation via fresh scratch subjects is
// enough there), and `partialArmId` for the one test asserting ABSOLUTE
// subject/overall positions, which are ranked across the WHOLE
// (classArmId, termId) — reusing a real, already-scored arm like JSS 2 A
// would pull unrelated data into that ranking.
describe("GET /class-arms/:id/results (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  // teacherSubjectToken: assigned ONE subject in resultsArmId only.
  let teacherSubjectToken: string;
  // teacherClassToken: class-teacher of resultsArmId (full access, incl. overall).
  let teacherClassToken: string;
  // teacherUnrelatedToken: zero assignments anywhere in resultsArmId.
  let teacherUnrelatedToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let resultsArmId: string;
  let partialArmId: string;
  let ca1Id: string;
  let ca2Id: string;
  let examId: string;
  const [s0, s1] = [0, 1];
  let resultsStudentIds: string[];

  let hillcrestId: string;
  let hillcrestArmId: string;
  let hillcrestTermId: string;

  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdArmIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createArm(suffix: string): Promise<string> {
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    const arm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-CAR-${suffix}-${Date.now()}` },
    });
    createdArmIds.push(arm.id);
    return arm.id;
  }

  async function enrollStudents(count: number, prefix: string, classArmId: string): Promise<string[]> {
    const ids: string[] = [];
    for (let i = 0; i < count; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-CAR/${prefix}/${i}`,
          firstName: prefix,
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+234801${prefix.length}${String(i).padStart(6, "0")}`,
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

  async function createSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  async function score(
    token: string,
    subjectId: string,
    componentId: string,
    scores: { studentId: string; rawScore: number }[],
    classArmId: string,
  ) {
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(token))
      .send({ classArmId, subjectId, componentId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`score failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    teacherSubjectToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    teacherClassToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    teacherUnrelatedToken = await loginAs(app, "teacher3@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const sunriseSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = sunriseSession.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;

    const components = await prisma.assessmentComponent.findMany({ where: { schoolId: sunriseId, deletedAt: null }, orderBy: { sortOrder: "asc" } });
    ca1Id = components[0].id;
    ca2Id = components[1].id;
    examId = components[2].id;

    resultsArmId = await createArm("Results");
    resultsStudentIds = await enrollStudents(4, "CAR", resultsArmId);

    const teacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    const teacherClass = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher2@sunrise.test" } });
    const teacherSubjectSubjectId = await createSubject("E2E CAR TeacherLane");
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: teacherSubjectSubjectId, classArmId: resultsArmId, sessionId: sunriseSessionId, teacherUserId: teacher.id },
    });
    await prisma.classTeacherAssignment.create({
      data: { schoolId: sunriseId, classArmId: resultsArmId, sessionId: sunriseSessionId, teacherUserId: teacherClass.id },
    });
    // The teacher-lane subject IS scored — asserted against in the
    // filtering test below.
    await score(sunriseAdminToken, teacherSubjectSubjectId, ca1Id, [{ studentId: resultsStudentIds[s0], rawScore: 15 }], resultsArmId);

    // A second subject, NOT assigned to teacherSubjectToken — proves the
    // filter excludes it, not just includes the assigned one.
    const otherSubjectId = await createSubject("E2E CAR OtherLane");
    await score(sunriseAdminToken, otherSubjectId, ca1Id, [{ studentId: resultsStudentIds[s0], rawScore: 10 }], resultsArmId);

    partialArmId = await createArm("Partial");
    await enrollStudents(2, "CARPartial", partialArmId);

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;
  });

  afterAll(async () => {
    if (createdSubjectIds.length > 0) {
      await prisma.studentScore.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.termSubjectResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
      await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    }
    if (createdStudentIds.length > 0) {
      await prisma.termOverallResult.deleteMany({ where: { studentId: { in: createdStudentIds } } });
      await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
      await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    }
    if (createdArmIds.length > 0) {
      await prisma.classTeacherAssignment.deleteMany({ where: { classArmId: { in: createdArmIds } } });
      await prisma.classArm.deleteMany({ where: { id: { in: createdArmIds } } });
    }
    await app.close();
  });

  it("ADMIN sees the full shape: all subjects, per-subject class average as a hand-verified letter grade, overall present", async () => {
    const subjectId = await createSubject("E2E CAR HandVerified");
    // s0 total = 20 (CA1 20/20 *20 weight = 20). s1 total = 10 (CA1 10/20*20=10).
    // s2, s3 untouched -> excluded from the average denominator.
    await score(sunriseAdminToken, subjectId, ca1Id, [
      { studentId: resultsStudentIds[s0], rawScore: 20 },
      { studentId: resultsStudentIds[s1], rawScore: 10 },
    ], resultsArmId);
    // Also add an exam score to s0 so a mixed CA+exam total is exercised:
    // s0: CA1 20/20*20=20, Exam 60/100*60=36 -> total 56 (C5, 55-59).
    await score(sunriseAdminToken, subjectId, examId, [{ studentId: resultsStudentIds[s0], rawScore: 60 }], resultsArmId);
    // s1 stays CA1-only: total 10 (F9).
    // average = (56 + 10) / 2 = 33 -> F9 (0-39), hand-verified against the
    // seeded WAEC scale (prisma/seed.ts's WAEC_GRADE_BOUNDARIES).

    const response = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${resultsArmId}/results`)
      .query({ termId: sunriseTermId })
      .set(auth(sunriseAdminToken));

    expect(response.status).toBe(200);
    expect(response.body.students).toHaveLength(4);
    const subject = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectId);
    expect(subject).toBeDefined();
    expect(subject.results).toHaveLength(2); // s2/s3 excluded — never scored
    expect(subject.averageScore).toBe(33);
    expect(subject.averageGrade).toBe("F9");
    expect(response.body.overall).not.toBeNull();

    // Each row carries the id + auto/override grade split an override
    // dialog needs — not just the collapsed finalGrade.
    const s0Row = subject.results.find((r: { studentId: string }) => r.studentId === resultsStudentIds[s0]);
    expect(typeof s0Row.id).toBe("string");
    expect(s0Row.autoGrade).toBe("C5");
    expect(s0Row.overrideGrade).toBeNull();
    expect(s0Row.finalGrade).toBe("C5");
  });

  it("TEACHER assigned to exactly one subject sees ONLY that subject, and no overall column", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${resultsArmId}/results`)
      .query({ termId: sunriseTermId })
      .set(auth(teacherSubjectToken));

    expect(response.status).toBe(200);
    const subjectNames = response.body.subjects.map((s: { subjectName: string }) => s.subjectName);
    expect(subjectNames).toContain("E2E CAR TeacherLane");
    expect(subjectNames).not.toContain("E2E CAR OtherLane");
    expect(response.body.overall).toBeNull();
  });

  it("TEACHER who is class-teacher of the arm sees every subject and the overall column", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${resultsArmId}/results`)
      .query({ termId: sunriseTermId })
      .set(auth(teacherClassToken));

    expect(response.status).toBe(200);
    const subjectNames = response.body.subjects.map((s: { subjectName: string }) => s.subjectName);
    expect(subjectNames).toContain("E2E CAR TeacherLane");
    expect(subjectNames).toContain("E2E CAR OtherLane");
    expect(response.body.overall).not.toBeNull();
  });

  it("TEACHER with zero relationship to the arm is 403'd", async () => {
    const response = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${resultsArmId}/results`)
      .query({ termId: sunriseTermId })
      .set(auth(teacherUnrelatedToken));
    expect(response.status).toBe(403);
  });

  it("partial-term: null subjectPosition/overallPosition exactly where unpublished, real values where published", async () => {
    const students = await prisma.studentEnrollment.findMany({ where: { classArmId: partialArmId }, select: { studentId: true } });
    const [p0, p1] = students.map((e) => e.studentId);
    const subjectId = await createSubject("E2E CAR PartialTerm");
    await score(sunriseAdminToken, subjectId, ca1Id, [
      { studentId: p0, rawScore: 20 },
      { studentId: p1, rawScore: 10 },
    ], partialArmId);
    await score(sunriseAdminToken, subjectId, examId, [{ studentId: p0, rawScore: 100 }], partialArmId);
    await score(sunriseAdminToken, subjectId, ca2Id, [{ studentId: p0, rawScore: 0 }], partialArmId); // completeness gate
    // p0: PENDING_APPROVAL (exam scored). p1: DRAFT (no exam yet).

    const beforePublish = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${partialArmId}/results`)
      .query({ termId: sunriseTermId })
      .set(auth(sunriseAdminToken));
    const subjectBefore = beforePublish.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectId);
    for (const row of subjectBefore.results) {
      expect(row.subjectPosition).toBeNull();
    }
    // term_overall_results rows only exist once publish()/unpublish() has
    // run at least once for this arm+term (saveGrid never touches them) —
    // before any publish, this is legitimately an empty array, not rows
    // stuck at a null position.
    expect(beforePublish.body.overall).toEqual([]);

    const publishRes = await request(app.getHttpServer())
      .post("/api/v1/grades/publish")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: partialArmId, subjectId, termId: sunriseTermId });
    expect(publishRes.status).toBe(200);
    expect(publishRes.body.publishedCount).toBe(1); // only p0 was pending

    const afterPublish = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${partialArmId}/results`)
      .query({ termId: sunriseTermId })
      .set(auth(sunriseAdminToken));
    const subjectAfter = afterPublish.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectId);
    const p0Row = subjectAfter.results.find((r: { studentId: string }) => r.studentId === p0);
    const p1Row = subjectAfter.results.find((r: { studentId: string }) => r.studentId === p1);
    expect(p0Row.subjectPosition).toBe(1);
    expect(p0Row.status).toBe("PUBLISHED");
    expect(p1Row.subjectPosition).toBeNull(); // still DRAFT — never published
    expect(p1Row.status).toBe("DRAFT");
    // p0 has touched exactly ONE subject in this arm, and it's now fully
    // published — subjects_count counts EXISTING rows, not a curriculum
    // size (same rule already proven in grades-publish.e2e-spec.ts's
    // "Overall cascade" suite), so p0's overall is legitimately COMPLETE
    // and gets a real position, not stuck null. p1 never touched the exam
    // component at all, so has no term_overall_result row yet.
    const p0Overall = afterPublish.body.overall.find((o: { studentId: string }) => o.studentId === p0);
    expect(p0Overall.status).toBe("PUBLISHED");
    expect(p0Overall.overallPosition).toBe(1);
    // p1 has a term_subject_result (DRAFT — no exam score yet), so the
    // publish cascade's whole-arm overall recompute does produce a row for
    // them too, correctly stuck at DRAFT with no leaked position.
    const p1Overall = afterPublish.body.overall.find((o: { studentId: string }) => o.studentId === p1);
    expect(p1Overall.status).toBe("DRAFT");
    expect(p1Overall.overallPosition).toBeNull();
  });

  it("rejects unauthenticated requests", async () => {
    const response = await request(app.getHttpServer()).get(`/api/v1/class-arms/${resultsArmId}/results`).query({ termId: sunriseTermId });
    expect(response.status).toBe(401);
  });

  it("404s (not 403) cross-tenant, both directions", async () => {
    const a = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${hillcrestArmId}/results`)
      .query({ termId: hillcrestTermId })
      .set(auth(sunriseAdminToken));
    expect(a.status).toBe(404);

    const b = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${resultsArmId}/results`)
      .query({ termId: sunriseTermId })
      .set(auth(hillcrestAdminToken));
    expect(b.status).toBe(404);
  });
});
