import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Report card + remarks (e2e) — SPEC_V0.5.md §2.4, v0.5 step 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let teacherClassToken: string; // class-teacher of studentArmId
  let teacherSubjectToken: string; // subject-teacher of subjectA only — not class-teacher
  let teacherUnrelatedToken: string; // zero relationship
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let studentArmId: string;
  let targetStudentId: string; // main assembly proof: absent + blank + real score, across two subjects
  let partialStudentId: string; // partial-term: one published, one not -> null overall position
  let remarksStudentId: string; // dedicated, score-free, for remark round-trip tests
  let subjectA: string; // published for both target + partial
  let subjectB: string; // target only, left DRAFT — the blank-component proof
  let subjectC: string; // partial only, left PENDING_APPROVAL — the partial-term proof

  let hillcrestId: string;
  let hillcrestStudentId: string;
  let hillcrestTermId: string;
  let hillcrestSessionId: string;

  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];
  let studentArmCreated = false;
  let teacherSubjectId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createSubject(name: string): Promise<string> {
    const subject = await prisma.subject.create({ data: { schoolId: sunriseId, name, code: name.slice(0, 6).toUpperCase() } });
    createdSubjectIds.push(subject.id);
    return subject.id;
  }

  // v0.7 step 1 (SPEC_V0.7.md §2/§5): evaluations replace the fixed
  // CA1/CA2/Exam components — created directly via Prisma (no
  // create-evaluation HTTP endpoint yet, Step 2).
  async function createEvaluation(subjectIdArg: string, name: string): Promise<string> {
    const evaluation = await prisma.evaluation.create({
      data: { schoolId: sunriseId, classArmId: studentArmId, subjectId: subjectIdArg, sessionId: sunriseSessionId, termId: sunriseTermId, name, description: name, createdBy: teacherSubjectId },
    });
    return evaluation.id;
  }

  // SPEC_V0.5.1.md §2.1/§2.2: PUT /grades/evaluation-scores now 404s
  // without a subject_teacher_assignment for admin too — upsert one for
  // whatever subject this call is scoring, same pattern as grades-publish's
  // ensureAssignment.
  async function score(subjectIdArg: string, evaluationId: string, scores: { studentId: string; rawScore?: number; isAbsent?: boolean }[]) {
    await prisma.subjectTeacherAssignment.upsert({
      where: { subjectId_classArmId_sessionId: { subjectId: subjectIdArg, classArmId: studentArmId, sessionId: sunriseSessionId } },
      update: {},
      create: { schoolId: sunriseId, subjectId: subjectIdArg, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: teacherSubjectId },
    });
    const response = await request(app.getHttpServer())
      .put("/api/v1/grades/evaluation-scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: studentArmId, subjectId: subjectIdArg, evaluationId, termId: sunriseTermId, scores });
    if (response.status !== 200) {
      throw new Error(`score failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
  }

  async function enroll(prefix: string, index: number): Promise<string> {
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-RC/${prefix}`,
        firstName: prefix,
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date(Date.UTC(2012, 0, 1 + index)),
        guardianName: "E2E Guardian",
        guardianPhone: `+2348027${String(index).padStart(6, "0")}`,
      },
    });
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: student.id, classArmId: studentArmId, sessionId: sunriseSessionId } });
    createdStudentIds.push(student.id);
    return student.id;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
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
    studentArmId = (await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-ReportCard-${Date.now()}` } })).id;
    studentArmCreated = true;

    targetStudentId = await enroll("Target", 0);
    partialStudentId = await enroll("Partial", 1);
    remarksStudentId = await enroll("Remarks", 2);

    const teacherClass = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher2@sunrise.test" } });
    await prisma.classTeacherAssignment.create({
      data: { schoolId: sunriseId, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: teacherClass.id },
    });

    subjectA = await createSubject("E2E RC SubjectA");
    subjectB = await createSubject("E2E RC SubjectB");
    subjectC = await createSubject("E2E RC SubjectC");
    const teacherSubject = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    teacherSubjectId = teacherSubject.id;
    // Subject-only assignment on subjectA — NOT class-teacher. Proves the
    // read/write split: this teacher can READ the report card (any
    // relationship) but cannot write the teacher remark (class-teacher only).
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: subjectA, classArmId: studentArmId, sessionId: sunriseSessionId, teacherUserId: teacherSubject.id },
    });

    // subjectA: fully decided (score/absent) for both target and partial —
    // publishable. target: eval1=18, eval2 ABSENT, eval3=84 -> (18+84)/2=51
    // (the exact hand-verified step-1 example). partial: eval1=15, eval2=0
    // (decided, contributes 0), eval3=75 -> (15+0+75)/3=30.
    const [aEval1, aEval2, aEval3] = await Promise.all([
      createEvaluation(subjectA, "CA 1"),
      createEvaluation(subjectA, "CA 2"),
      createEvaluation(subjectA, "CA 3"),
    ]);
    await score(subjectA, aEval1, [{ studentId: targetStudentId, rawScore: 18 }, { studentId: partialStudentId, rawScore: 15 }]);
    await score(subjectA, aEval2, [{ studentId: targetStudentId, isAbsent: true }, { studentId: partialStudentId, rawScore: 0 }]);
    await score(subjectA, aEval3, [{ studentId: targetStudentId, rawScore: 84 }, { studentId: partialStudentId, rawScore: 75 }]);
    const publishRes = await request(app.getHttpServer())
      .post("/api/v1/grades/publish")
      .set(auth(sunriseAdminToken))
      .send({ classArmId: studentArmId, subjectId: subjectA, termId: sunriseTermId });
    if (publishRes.status !== 200) {
      throw new Error(`publish failed: ${publishRes.status} ${JSON.stringify(publishRes.body)}`);
    }

    // subjectB: target only, one evaluation scored, others genuinely never
    // touched (blank) -> DRAFT, never published. The blank-vs-absent proof.
    const bEval1 = await createEvaluation(subjectB, "CA 1");
    await score(subjectB, bEval1, [{ studentId: targetStudentId, rawScore: 10 }]);

    // subjectC: partial only, scored but never published -> keeps partial's
    // overall from being fully published (the partial-term proof;
    // computeOverallStatus still reports PENDING_APPROVAL for a student
    // with a mix of PUBLISHED and DRAFT subjects, even though no
    // individual SUBJECT row can be PENDING_APPROVAL anymore — v0.7).
    const cEval1 = await createEvaluation(subjectC, "CA 1");
    await score(subjectC, cEval1, [{ studentId: partialStudentId, rawScore: 40 }]);

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    hillcrestSessionId = hillcrestSession.id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSessionId, name: "FIRST" } })).id;
    hillcrestStudentId = (await prisma.student.findFirstOrThrow({ where: { schoolId: hillcrestId } })).id;
  });

  afterAll(async () => {
    if (createdStudentIds.length > 0) {
      await prisma.termRemark.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    }
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

  describe("GET /students/:id/report-card", () => {
    it("assembles totalScore/status/grade/position correctly, with an ABSENT evaluation excluded (not averaged as 0)", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${targetStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe("Target");
      expect(response.body.admissionNumber).toBe("E2E-RC/Target");
      expect(response.body.classArmId).toBe(studentArmId);

      const subjA = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectA);
      expect(subjA.status).toBe("PUBLISHED");
      expect(subjA.totalScore).toBe(51); // (18 + 84) / 2 — the absent evaluation excluded, not averaged as 0
      expect(subjA.finalGrade).toBe("C6"); // WAEC 50-54
      expect(subjA.subjectPosition).toBe(1); // 51 beats partial's 30

      // v0.7 step 4 (SPEC_V0.7.md §4): the real per-evaluation breakdown —
      // name/description/score for every evaluation, absence rendered
      // honestly (rawScore: null, isAbsent: true), never a 0.
      expect(subjA.evaluations).toHaveLength(3);
      const ca1 = subjA.evaluations.find((e: { name: string }) => e.name === "CA 1");
      const ca2 = subjA.evaluations.find((e: { name: string }) => e.name === "CA 2");
      const ca3 = subjA.evaluations.find((e: { name: string }) => e.name === "CA 3");
      expect(ca1).toMatchObject({ description: "CA 1", rawScore: 18, isAbsent: false });
      expect(ca2).toMatchObject({ description: "CA 2", rawScore: null, isAbsent: true });
      expect(ca3).toMatchObject({ description: "CA 3", rawScore: 84, isAbsent: false });

      // v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics, staff view:
      // computed over the WHOLE class (target + partial), unfiltered by
      // anyone's publish state. subjectA's class average is (51+30)/2.
      expect(subjA.classAverageScore).toBe(40.5);
      // CA1: target=18, partial=15 -> avg 16.5, best 18, worst 15.
      expect(ca1).toMatchObject({ classAverageScore: 16.5, bestScore: 18, worstScore: 15 });
      // CA2: target is ABSENT (excluded); partial's real 0 is the only
      // decided score -> avg/best/worst all 0, not null (a real 0 is a
      // real data point, distinct from "nothing decided").
      expect(ca2).toMatchObject({ classAverageScore: 0, bestScore: 0, worstScore: 0 });
      // CA3: target=84, partial=75 -> avg 79.5, best 84, worst 75.
      expect(ca3).toMatchObject({ classAverageScore: 79.5, bestScore: 84, worstScore: 75 });

      // Staff sees the breakdown regardless of publish state — subjectB
      // below is still DRAFT, and its evaluation is visible all the same.
      const subjB = response.body.subjects.find((s: { subjectId: string }) => s.subjectId === subjectB);
      expect(subjB.status).toBe("DRAFT");
      expect(subjB.evaluations).toHaveLength(1);
      expect(subjB.evaluations[0]).toMatchObject({ name: "CA 1", description: "CA 1", rawScore: 10, isAbsent: false });
      // Only one student (target) has ever been scored on subjectB — the
      // class average with a single data point is just that data point.
      expect(subjB.classAverageScore).toBe(10);
      expect(subjB.evaluations[0]).toMatchObject({ classAverageScore: 10, bestScore: 10, worstScore: 10 });

      // v0.7.2 step 1 (SPEC_V0.7.2.md §2) — staff-view parity: staff sees
      // BOTH subjectA (published) and subjectB (still DRAFT) in
      // subjects[] above, but the running average must still only count
      // the published one. 51, not (51+10)/2=30.5 — proves the
      // published-only filter is applied uniformly regardless of who's
      // asking, not just for the self-view caller who never sees the
      // draft subject at all.
      expect(response.body.runningAverageScore).toBe(51);
    });

    it("partial-term: a student with one published + one still-pending subject has a null overall position", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${partialStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.subjects).toHaveLength(2);
      expect(response.body.overall.status).toBe("PENDING_APPROVAL");
      expect(response.body.overall.overallPosition).toBeNull();
      expect(response.body.overall.subjectsCount).toBe(2);
      // v0.7.2 step 1 — the official overall is PENDING_APPROVAL (mixed
      // statuses, not null here since staff sees a computed row either
      // way) while the running average is a DIFFERENT, independent
      // number: 30 from subjectA alone (published); subjectC's 40 (still
      // DRAFT) contributes nothing. Proves the two figures diverge
      // correctly when they should, not just agree when everything's
      // published (see the other test's 46/51 cases).
      expect(response.body.runningAverageScore).toBe(30);
    });

    it("TEACHER with any relationship to the class arm can read (same rule as the Results tab)", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${targetStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(teacherSubjectToken));
      expect(response.status).toBe(200);
    });

    it("TEACHER with zero relationship is 403'd", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${targetStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(teacherUnrelatedToken));
      expect(response.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${targetStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId });
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .get(`/api/v1/students/${hillcrestStudentId}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .get(`/api/v1/students/${targetStudentId}/report-card`)
        .query({ termId: hillcrestTermId, sessionId: hillcrestSessionId })
        .set(auth(hillcrestAdminToken));
      expect(b.status).toBe(404);
    });
  });

  describe("PUT /students/:id/remarks/teacher", () => {
    it("the class teacher can write it; a subject-only teacher (not class-teacher) is 403'd", async () => {
      const blocked = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/teacher`)
        .set(auth(teacherSubjectToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Should not land" });
      expect(blocked.status).toBe(403);

      const allowed = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/teacher`)
        .set(auth(teacherClassToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Works hard, improving steadily." });
      expect(allowed.status).toBe(200);
      expect(allowed.body.teacherRemark).toBe("Works hard, improving steadily.");
      expect(allowed.body.teacherRemarkBy).not.toBeNull();
      expect(allowed.body.teacherRemarkAt).not.toBeNull();
    });

    it("SCHOOL_ADMIN/PROPRIETOR may also write it (no check, same as elsewhere in this service)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/students/${targetStudentId}/remarks/teacher`)
        .set(auth(sunriseAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Admin-entered remark." });
      expect(response.status).toBe(200);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/teacher`)
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Nope" });
      expect(response.status).toBe(401);
    });

    it("400s when the remark key is omitted entirely (required-but-nullable)", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/teacher`)
        .set(auth(sunriseAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId });
      expect(response.status).toBe(400);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .put(`/api/v1/students/${hillcrestStudentId}/remarks/teacher`)
        .set(auth(sunriseAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Cross tenant" });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/teacher`)
        .set(auth(hillcrestAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Cross tenant" });
      expect(b.status).toBe(404);
    });
  });

  describe("PUT /students/:id/remarks/principal", () => {
    it("SCHOOL_ADMIN/PROPRIETOR may write it; a TEACHER is 403'd categorically — even the real class teacher", async () => {
      const blocked = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/principal`)
        .set(auth(teacherClassToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Should not land" });
      expect(blocked.status).toBe(403);

      const allowed = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/principal`)
        .set(auth(sunriseProprietorToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "A pleasure to have in school." });
      expect(allowed.status).toBe(200);
      expect(allowed.body.principalRemark).toBe("A pleasure to have in school.");
      expect(allowed.body.principalRemarkBy).not.toBeNull();
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/principal`)
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Nope" });
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer())
        .put(`/api/v1/students/${hillcrestStudentId}/remarks/principal`)
        .set(auth(sunriseAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Cross tenant" });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .put(`/api/v1/students/${remarksStudentId}/remarks/principal`)
        .set(auth(hillcrestAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Cross tenant" });
      expect(b.status).toBe(404);
    });
  });

  describe("Remark upsert semantics", () => {
    it("round-trips into the report card, and clearing (remark: null) nulls the stamps too", async () => {
      const student = await enroll("RoundTrip", 10);

      const setRes = await request(app.getHttpServer())
        .put(`/api/v1/students/${student}/remarks/teacher`)
        .set(auth(teacherClassToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Initial remark." });
      expect(setRes.status).toBe(200);

      const cardAfterSet = await request(app.getHttpServer())
        .get(`/api/v1/students/${student}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(cardAfterSet.body.remarks.teacherRemark).toBe("Initial remark.");
      expect(cardAfterSet.body.remarks.teacherRemarkBy).toEqual({ firstName: "Ngozi", lastName: "Chukwuma" });
      expect(cardAfterSet.body.remarks.teacherRemarkAt).not.toBeNull();

      const clearRes = await request(app.getHttpServer())
        .put(`/api/v1/students/${student}/remarks/teacher`)
        .set(auth(teacherClassToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: null });
      expect(clearRes.status).toBe(200);
      expect(clearRes.body.teacherRemark).toBeNull();
      expect(clearRes.body.teacherRemarkBy).toBeNull();
      expect(clearRes.body.teacherRemarkAt).toBeNull();

      const cardAfterClear = await request(app.getHttpServer())
        .get(`/api/v1/students/${student}/report-card`)
        .query({ termId: sunriseTermId, sessionId: sunriseSessionId })
        .set(auth(sunriseAdminToken));
      expect(cardAfterClear.body.remarks.teacherRemark).toBeNull();
      expect(cardAfterClear.body.remarks.teacherRemarkBy).toBeNull();
    });

    it("clearing one remark leaves the OTHER remark and its stamps completely untouched — both directions", async () => {
      const student = await enroll("OneSided", 11);

      await request(app.getHttpServer())
        .put(`/api/v1/students/${student}/remarks/teacher`)
        .set(auth(teacherClassToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Teacher's note." });
      const principalSet = await request(app.getHttpServer())
        .put(`/api/v1/students/${student}/remarks/principal`)
        .set(auth(sunriseAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Principal's note." });
      const principalSnapshot = {
        principalRemark: principalSet.body.principalRemark,
        principalRemarkBy: principalSet.body.principalRemarkBy,
        principalRemarkAt: principalSet.body.principalRemarkAt,
      };

      // Clear the TEACHER side only.
      const afterTeacherClear = await request(app.getHttpServer())
        .put(`/api/v1/students/${student}/remarks/teacher`)
        .set(auth(teacherClassToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: null });
      expect(afterTeacherClear.body.teacherRemark).toBeNull();
      expect(afterTeacherClear.body.principalRemark).toBe(principalSnapshot.principalRemark);
      expect(afterTeacherClear.body.principalRemarkBy).toBe(principalSnapshot.principalRemarkBy);
      expect(afterTeacherClear.body.principalRemarkAt).toBe(principalSnapshot.principalRemarkAt);

      // Re-set the teacher remark, snapshot it, then clear the PRINCIPAL side only.
      const teacherReSet = await request(app.getHttpServer())
        .put(`/api/v1/students/${student}/remarks/teacher`)
        .set(auth(teacherClassToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: "Teacher's note, take two." });
      const teacherSnapshot = {
        teacherRemark: teacherReSet.body.teacherRemark,
        teacherRemarkBy: teacherReSet.body.teacherRemarkBy,
        teacherRemarkAt: teacherReSet.body.teacherRemarkAt,
      };

      const afterPrincipalClear = await request(app.getHttpServer())
        .put(`/api/v1/students/${student}/remarks/principal`)
        .set(auth(sunriseAdminToken))
        .send({ termId: sunriseTermId, sessionId: sunriseSessionId, remark: null });
      expect(afterPrincipalClear.body.principalRemark).toBeNull();
      expect(afterPrincipalClear.body.teacherRemark).toBe(teacherSnapshot.teacherRemark);
      expect(afterPrincipalClear.body.teacherRemarkBy).toBe(teacherSnapshot.teacherRemarkBy);
      expect(afterPrincipalClear.body.teacherRemarkAt).toBe(teacherSnapshot.teacherRemarkAt);
    });
  });
});
