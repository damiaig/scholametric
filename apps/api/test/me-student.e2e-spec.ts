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
  let ca1Id: string;
  let ca2Id: string;
  let examId: string;

  let subjectX: string; // published for both A and B, different scores -> distinct positions
  let subjectY: string; // A only, left DRAFT -> keeps A's overall from completing

  let studentAId: string; // "Mixed": subjectX published + subjectY draft -> overall stays non-published
  let studentBId: string; // "Full": subjectX published, only subject -> overall PUBLISHED
  let studentCId: string; // "Empty": enrolled, nothing entered this term

  let tokenA: string;
  let tokenB: string;
  let tokenC: string;

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

  async function score(subjectId: string, componentId: string, scores: { studentId: string; rawScore?: number; isAbsent?: boolean }[]) {
    const subjectTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    await prisma.subjectTeacherAssignment.upsert({
      where: { subjectId_classArmId_sessionId: { subjectId, classArmId: studentArmId, sessionId: sunriseSessionId } },
      update: {},
      create: { schoolId: sunriseId, subjectId, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: subjectTeacher.id },
    });
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: studentArmId, subjectId, componentId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`score failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  async function publish(subjectId: string) {
    const response = await request(app.getHttpServer())
      .post("/api/v1/grades/publish")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: studentArmId, subjectId, termId: sunriseTermId });
    if (response.status !== 200) {
      throw new Error(`publish failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  async function enrollSunrise(prefix: string, index: number): Promise<string> {
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
      data: { schoolId: sunriseId, studentId: student.id, classArmId: studentArmId, sessionId: sunriseSessionId },
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

    const components = await prisma.assessmentComponent.findMany({ where: { schoolId: sunriseId, deletedAt: null }, orderBy: { sortOrder: "asc" } });
    ca1Id = components[0].id;
    ca2Id = components[1].id;
    examId = components[2].id;

    const jss3 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 3" } });
    studentArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss3.id, name: `E2E-MeStudent-${Date.now()}` } })).id;
    studentArmCreated = true;

    studentAId = await enrollSunrise("MeA", 0);
    studentBId = await enrollSunrise("MeB", 1);
    studentCId = await enrollSunrise("MeC", 2);

    subjectX = await createSunriseSubject("E2E MeStudent SubjectX");
    subjectY = await createSunriseSubject("E2E MeStudent SubjectY");

    // subjectX: both A and B scored + published — A higher (position 1),
    // B lower (position 2). One absent component on A, exercising the same
    // "Abs vs blank vs real score" distinction report-card.e2e-spec.ts
    // already proves for staff — proving it survives the STUDENT filter too.
    await score(subjectX, ca1Id, [{ studentId: studentAId, rawScore: 18 }, { studentId: studentBId, rawScore: 12 }]);
    await score(subjectX, ca2Id, [{ studentId: studentAId, isAbsent: true }, { studentId: studentBId, rawScore: 10 }]);
    await score(subjectX, examId, [{ studentId: studentAId, rawScore: 55 }, { studentId: studentBId, rawScore: 40 }]);
    await publish(subjectX);

    // subjectY: A only, CA1 scored, CA2/Exam never touched -> DRAFT,
    // never published. This is what keeps A's OVERALL from ever reaching
    // PUBLISHED (computeOverallStatus requires EVERY subject published) —
    // the exact coupling verified in grade-computation.ts before building.
    await score(subjectY, ca1Id, [{ studentId: studentAId, rawScore: 10 }]);

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
    tokenA = await loginAs(app, "E2EMESTUDENTA", "sunrise");
    tokenB = await loginAs(app, "E2EMESTUDENTB", "sunrise");
    tokenC = await loginAs(app, "E2EMESTUDENTC", "sunrise");

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
      await prisma.studentScore.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
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
      expect(subj.totalScore).toBe(51); // 18 + 0 (absent) + 33 (55*0.6)
      expect(subj.subjectPosition).toBe(1); // A (51) beats B's total below

      const ca2Row = subj.components.find((c: { componentId: string }) => c.componentId === ca2Id);
      expect(ca2Row.isAbsent).toBe(true);
      expect(ca2Row.rawScore).toBeNull();
    });

    it("a DRAFT subject for the SAME student is ABSENT from subjects[], not a hidden/flagged row", async () => {
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
      // Remarks gate: no published overall -> no remarks, even though this
      // student could in principle have one written.
      expect(response.body.remarks.teacherRemark).toBeNull();
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
