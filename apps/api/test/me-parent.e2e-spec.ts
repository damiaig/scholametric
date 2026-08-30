import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, GuardianRelationship, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.6 step 4 (SPEC_V0.6.md §2.4) — a PARENT's own read views:
// GET /me/children (+ /:childId/profile, /:childId/terms, /:childId/
// report-card). Reuses Step 3's published-only path (grades.service.ts's
// getReportCard, widened to publishedOnlyForSelfView) unchanged; the one
// genuinely new surface is validating a requested childId against the
// caller's own directly-linked children (resolveOwnChildIds/
// assertChildBelongsToCaller in me.service.ts) BEFORE any grade query.
describe("Parent read views (e2e) — SPEC_V0.6.md §2.4, v0.6 step 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let studentArmId: string;
  let studentArmCreated = false;

  let subjectX: string; // published for both A and B, different scores -> distinct positions
  let subjectY: string; // A only, left DRAFT -> keeps A's overall from completing

  let studentAId: string; // "Mixed" — parent1's child #1
  let studentBId: string; // "Full" — parent1's child #2, overall PUBLISHED + remark
  let notCoveredStudentId: string; // linked to g2 only, NOT to g1 — child_not_covered analogue
  let otherFamilyStudentId: string; // a REAL student in a wholly different family (g3)

  let guardian1Id: string; // parent1's anchor guardian
  let guardian2Id: string; // shares a link with notCoveredStudentId, not parent1's own guardianId
  let guardian3Id: string; // otherFamilyStudentId's own, unrelated guardian

  let tokenParent1: string;
  let tokenStudentA: string; // a STUDENT-role login for A, for the role-boundary test

  let hillcrestId: string;
  let hillcrestStudentId: string;

  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = []; // Sunrise only — hillcrestStudentId cleaned separately
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const SEED_PASSWORD = "Passw0rd!"; // matches test/utils/login.ts's loginAs()

  async function createSunriseSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  // v0.7 step 1 (SPEC_V0.7.md §2/§5): evaluations replace the fixed
  // CA1/CA2/Exam components — created directly via Prisma (no
  // create-evaluation HTTP endpoint yet, Step 2).
  async function createEvaluation(subjectId: string, name: string): Promise<string> {
    const subjectTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    const evaluation = await prisma.evaluation.create({
      data: { schoolId: sunriseId, classArmId: studentArmId, subjectId, sessionId: sunriseSessionId, termId: sunriseTermId, name, description: name, createdBy: subjectTeacher.id },
    });
    return evaluation.id;
  }

  async function score(subjectId: string, evaluationId: string, scores: { studentId: string; rawScore?: number; isAbsent?: boolean }[]) {
    const subjectTeacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    await prisma.subjectTeacherAssignment.upsert({
      where: { subjectId_classArmId_sessionId: { subjectId, classArmId: studentArmId, sessionId: sunriseSessionId } },
      update: {},
      create: { schoolId: sunriseId, subjectId, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: subjectTeacher.id },
    });
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: studentArmId, subjectId, evaluationId, termId: sunriseTermId, scores });
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
        admissionNumber: `E2E-MEPARENT/${prefix}`,
        firstName: prefix,
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date(Date.UTC(2011, 0, 1 + index)),
        guardianName: "E2E Guardian",
        guardianPhone: `+2348030${String(index).padStart(6, "0")}`,
      },
    });
    await prisma.studentEnrollment.create({
      data: { schoolId: sunriseId, studentId: student.id, classArmId: studentArmId, sessionId: sunriseSessionId },
    });
    createdStudentIds.push(student.id);
    return student.id;
  }

  async function makeGuardian(schoolId: string, firstName: string, lastName: string, phoneSuffix: string): Promise<string> {
    const guardian = await prisma.guardian.create({ data: { schoolId, firstName, lastName, phone: `+234804${phoneSuffix}` } });
    createdGuardianIds.push(guardian.id);
    return guardian.id;
  }

  async function linkGuardian(studentId: string, guardianId: string, isPrimary: boolean) {
    const student = await prisma.student.findUniqueOrThrow({ where: { id: studentId } });
    await prisma.studentGuardian.create({
      data: { schoolId: student.schoolId, studentId, guardianId, relationship: GuardianRelationship.OTHER, isPrimary },
    });
  }

  async function makePortalUser(
    role: "STUDENT" | "PARENT",
    schoolId: string,
    username: string,
    link: { studentId?: string; guardianId?: string },
    firstName: string,
    lastName: string,
  ): Promise<string> {
    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4); // low cost — test-only
    const user = await prisma.user.create({
      data: {
        schoolId,
        role: role as UserRole,
        username,
        studentId: link.studentId,
        guardianId: link.guardianId,
        firstName,
        lastName,
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

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;
    sunriseTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: sunriseSessionId, name: "FIRST" } })).id;

    const jss3 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 3" } });
    studentArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss3.id, name: `E2E-MeParent-${Date.now()}` } })).id;
    studentArmCreated = true;

    studentAId = await enrollSunrise("PA", 0);
    studentBId = await enrollSunrise("PB", 1);
    notCoveredStudentId = await enrollSunrise("PNotCovered", 2);
    otherFamilyStudentId = await enrollSunrise("POtherFamily", 3);

    subjectX = await createSunriseSubject("E2E MeParent SubjectX");
    subjectY = await createSunriseSubject("E2E MeParent SubjectY");

    // subjectX: A and B scored (all 3 evaluations decided, one absence each
    // — completeness gate) + published — same shape as Step 3's own proof,
    // now reached via the PARENT route instead of a STUDENT token.
    const [xEval1, xEval2, xEval3] = await Promise.all([
      createEvaluation(subjectX, "CA 1"),
      createEvaluation(subjectX, "CA 2"),
      createEvaluation(subjectX, "CA 3"),
    ]);
    await score(subjectX, xEval1, [{ studentId: studentAId, rawScore: 18 }, { studentId: studentBId, rawScore: 12 }]);
    await score(subjectX, xEval2, [{ studentId: studentAId, isAbsent: true }, { studentId: studentBId, isAbsent: true }]);
    await score(subjectX, xEval3, [{ studentId: studentAId, rawScore: 84 }, { studentId: studentBId, rawScore: 80 }]);
    // A: (18+84)/2=51. B: (12+80)/2=46.
    await publish(subjectX);

    // subjectY: A only, one evaluation scored -> DRAFT, never published.
    // Keeps A's overall from ever reaching PUBLISHED.
    const yEval1 = await createEvaluation(subjectY, "CA 1");
    await score(subjectY, yEval1, [{ studentId: studentAId, rawScore: 10 }]);

    // B has ONLY subjectX (published) -> B's overall reaches PUBLISHED too
    // (publish()'s own class-arm-wide recompute, no extra call needed).
    const remarkResponse = await request(app.getHttpServer())
      .put(`/api/v1/students/${studentBId}/remarks/teacher`)
      .set(auth(sunriseAdminToken))
      .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Excellent term overall." });
    if (remarkResponse.status !== 200) {
      throw new Error(`remark write failed: ${remarkResponse.status} ${JSON.stringify(remarkResponse.body)}`);
    }

    // Family graph: g1 is parent1's anchor guardian, DIRECTLY linked to A
    // and B — both "mine". g2 shares ONLY notCoveredStudentId, which has
    // NO link to g1 at all — the child_not_covered analogue (built the
    // same way portal-accounts.e2e-spec.ts's own test does: a student
    // reachable only through a guardian that ISN'T the anchor). g3 is a
    // wholly separate, unrelated family's anchor for otherFamilyStudentId
    // — a REAL, existing student id that simply belongs to nobody parent1
    // guardians, proving the allow-list (not mere existence) is what 404s.
    guardian1Id = await makeGuardian(sunriseId, "Ngozi", "Parent", "000001");
    await linkGuardian(studentAId, guardian1Id, true);
    await linkGuardian(studentBId, guardian1Id, true);

    guardian2Id = await makeGuardian(sunriseId, "Other", "Guardian", "000002");
    await linkGuardian(notCoveredStudentId, guardian2Id, true);

    guardian3Id = await makeGuardian(sunriseId, "Unrelated", "Family", "000003");
    await linkGuardian(otherFamilyStudentId, guardian3Id, true);

    await makePortalUser("PARENT", sunriseId, "E2EMEPARENT1", { guardianId: guardian1Id }, "Ngozi", "Parent");
    tokenParent1 = await loginAs(app, "E2EMEPARENT1", "sunrise");

    await makePortalUser("STUDENT", sunriseId, "E2EMEPARENTCHILDA", { studentId: studentAId }, "PA", "Student");
    tokenStudentA = await loginAs(app, "E2EMEPARENTCHILDA", "sunrise");

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestStudent = await prisma.student.create({
      data: {
        schoolId: hillcrestId,
        admissionNumber: "E2E-MEPARENT/Hill",
        firstName: "Hillcrest",
        lastName: "Student",
        gender: Gender.MALE,
        dateOfBirth: new Date("2012-06-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348040000000",
      },
    });
    hillcrestStudentId = hillcrestStudent.id;
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } }); // before students/guardians — FK
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
    await prisma.studentGuardian.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: [...createdStudentIds, hillcrestStudentId] } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    if (studentArmCreated) {
      await prisma.classArm.delete({ where: { id: studentArmId } });
    }
    await app.close();
  });

  describe("GET /me/children", () => {
    it("lists exactly the parent's own directly-linked children — multi-child, no cross-contamination", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/children").set(auth(tokenParent1));
      expect(response.status).toBe(200);
      const ids = response.body.children.map((c: { studentId: string }) => c.studentId);
      expect(ids.sort()).toEqual([studentAId, studentBId].sort());
      expect(ids).not.toContain(notCoveredStudentId);
      expect(ids).not.toContain(otherFamilyStudentId);
    });

    it("a child_not_covered child (linked to a DIFFERENT guardian, not this parent's anchor) never appears", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/children").set(auth(tokenParent1));
      const ids = response.body.children.map((c: { studentId: string }) => c.studentId);
      expect(ids).not.toContain(notCoveredStudentId);
    });

    it("403s for STUDENT (this route is PARENT-only)", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/children").set(auth(tokenStudentA));
      expect(response.status).toBe(403);
    });

    it("401 unauthenticated", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/me/children");
      expect(response.status).toBe(401);
    });
  });

  describe("GET /me/children/:childId/report-card", () => {
    it("shows child A's own published subject; the draft subject for the SAME child is absent (reuses Step 3's published-only path)", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentAId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));
      expect(response.status).toBe(200);
      expect(response.body.studentId).toBe(studentAId);

      const subjectIds = response.body.subjects.map((s: { subjectId: string }) => s.subjectId);
      expect(subjectIds).toContain(subjectX);
      expect(subjectIds).not.toContain(subjectY); // DRAFT — never published

      const subjX = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectX);
      expect(subjX.totalScore).toBe(51); // (18 + 84) / 2 — the absent evaluation excluded, not averaged as 0
      expect(subjX.subjectPosition).toBe(1);
      expect(response.body.overall).toBeNull(); // subjectY still DRAFT -> overall never published
    });

    it("shows child B's published OVERALL position and remark once every subject is published", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentBId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));
      expect(response.status).toBe(200);
      expect(response.body.studentId).toBe(studentBId);
      expect(response.body.subjects[0].totalScore).toBe(46);
      expect(response.body.subjects[0].subjectPosition).toBe(2); // behind A's 51

      expect(response.body.overall).not.toBeNull();
      expect(response.body.overall.status).toBe("PUBLISHED");
      expect(response.body.remarks.teacherRemark).toBe("Excellent term overall.");
    });

    it("multi-child switch: A and B are each correct and never cross-contaminated", async () => {
      const asA = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentAId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));
      const asB = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentBId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));

      expect(asA.body.studentId).toBe(studentAId);
      expect(asB.body.studentId).toBe(studentBId);
      expect(JSON.stringify(asA.body)).not.toContain(studentBId);
      expect(JSON.stringify(asB.body)).not.toContain(studentAId);
    });

    it("a REAL student id belonging to a DIFFERENT family 404s — the allow-list rejects it, not mere existence-checking", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${otherFamilyStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));
      expect(response.status).toBe(404);
    });

    it("the child_not_covered student 404s if requested directly by id", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${notCoveredStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));
      expect(response.status).toBe(404);
    });

    it("cross-tenant: a Sunrise parent's childId attempt against a Hillcrest student 404s", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${hillcrestStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));
      expect(response.status).toBe(404);
    });

    it("403s for STUDENT (childId routes are PARENT-only)", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentAId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenStudentA));
      expect(response.status).toBe(403);
    });
  });

  describe("PARENT cannot use Step 3's param-less /me/report-card", () => {
    it("403s a PARENT token — a parent has no single 'self' student", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/report-card")
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(tokenParent1));
      expect(response.status).toBe(403);
    });
  });

  describe("GET /me/children/:childId/profile and /terms", () => {
    it("returns the requested child's own profile", async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentAId}/profile`).set(auth(tokenParent1));
      expect(response.status).toBe(200);
      expect(response.body.studentId).toBe(studentAId);
      expect(response.body.firstName).toBe("PA");
    });

    it("returns the requested child's own terms", async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentAId}/terms`).set(auth(tokenParent1));
      expect(response.status).toBe(200);
      const terms = response.body.sessions.flatMap((s: { terms: { id: string }[] }) => s.terms.map((t) => t.id));
      expect(terms).toContain(sunriseTermId);
    });

    it("404s /profile for a child not belonging to this parent", async () => {
      const response = await request(app.getHttpServer()).get(`/api/v1/me/children/${otherFamilyStudentId}/profile`).set(auth(tokenParent1));
      expect(response.status).toBe(404);
    });
  });
});
