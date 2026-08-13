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
  let reviewArmId: string;
  let studentIds: string[];
  let ca1Id: string;
  let examId: string;

  let hillcrestId: string;
  let hillcrestArmId: string;
  let hillcrestTermId: string;

  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  async function score(subjectId: string, componentId: string, scores: { studentId: string; rawScore: number }[]) {
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: reviewArmId, subjectId, componentId, termId: sunriseTermId, scores });
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

    const components = await prisma.assessmentComponent.findMany({ where: { schoolId: sunriseId, deletedAt: null }, orderBy: { sortOrder: "asc" } });
    ca1Id = components[0].id;
    examId = components[2].id;

    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
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
    if (reviewArmId) {
      await prisma.classArm.delete({ where: { id: reviewArmId } });
    }
    await app.close();
  });

  it("returns per-status COUNTS (not one enum), a hand-verified average, and rosterSize independent of who's scored", async () => {
    const subjectId = await createSubject("E2E Review Mixed");
    // s0: CA1+Exam -> PENDING_APPROVAL, total 20+36=56.
    await score(subjectId, ca1Id, [{ studentId: studentIds[0], rawScore: 20 }]);
    await score(subjectId, examId, [{ studentId: studentIds[0], rawScore: 60 }]);
    // s1: CA1 only -> DRAFT, total 10.
    await score(subjectId, ca1Id, [{ studentId: studentIds[1], rawScore: 10 }]);
    // s2, s3: untouched entirely.
    // average = (56 + 10) / 2 = 33 -> F9 (0-39).

    const response = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: reviewArmId, termId: sunriseTermId })
      .set(auth(sunriseAdminToken));
    expect(response.status).toBe(200);
    const subject = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectId);
    expect(subject.rosterSize).toBe(4);
    expect(subject.draftCount).toBe(1);
    expect(subject.pendingApprovalCount).toBe(1);
    expect(subject.publishedCount).toBe(0);
    expect(subject.averageScore).toBe(33);
    expect(subject.averageGrade).toBe("F9");
    expect(subject.canPublish).toBe(true); // pendingApprovalCount > 0
  });

  it("canPublish: false is verified against the REAL publish() 409, not just asserted in isolation", async () => {
    const subjectId = await createSubject("E2E Review CanPublishFalse");
    // Only a CA score, no exam -> stays DRAFT. Nothing eligible to publish.
    await score(subjectId, ca1Id, [{ studentId: studentIds[0], rawScore: 10 }]);

    const reviewRes = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: reviewArmId, termId: sunriseTermId })
      .set(auth(sunriseAdminToken));
    const subject = reviewRes.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectId);
    expect(subject.canPublish).toBe(false);

    const publishRes = await request(app.getHttpServer())
      .post("/api/v1/grades/publish")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: reviewArmId, subjectId, termId: sunriseTermId });
    expect(publishRes.status).toBe(409);
  });

  it("status= filter: 'at least one student in this status'", async () => {
    const subjectId = await createSubject("E2E Review StatusFilter");
    await score(subjectId, ca1Id, [{ studentId: studentIds[0], rawScore: 20 }]);
    await score(subjectId, examId, [{ studentId: studentIds[0], rawScore: 60 }]);
    const publishRes = await request(app.getHttpServer())
      .post("/api/v1/grades/publish")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: reviewArmId, subjectId, termId: sunriseTermId });
    expect(publishRes.status).toBe(200);
    // Now this subject has 1 PUBLISHED + 3 never-touched (no rows at all,
    // so they don't count toward draft/pending/published either).

    const publishedOnly = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: reviewArmId, termId: sunriseTermId, status: "PUBLISHED" })
      .set(auth(sunriseAdminToken));
    expect(publishedOnly.body.subjects.some((s: { subjectId: string }) => s.subjectId === subjectId)).toBe(true);

    const draftOnly = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: reviewArmId, termId: sunriseTermId, status: "DRAFT" })
      .set(auth(sunriseAdminToken));
    expect(draftOnly.body.subjects.some((s: { subjectId: string }) => s.subjectId === subjectId)).toBe(false);
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
