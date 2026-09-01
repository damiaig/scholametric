import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, GuardianRelationship, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 3 (SPEC_V0.7.md §4): the two exam read views — the per-term
// "Show exams" button (GET .../exams) and the whole-year Exams view
// (GET .../year-exams) — reused across staff (/students/:id/*), STUDENT
// (/me/*), and PARENT (/me/children/:childId/*). The centerpiece: the
// published-only wall must hold on EVERY self-view route, mirroring
// GET /students/:id/report-card's own filter (status: PUBLISHED in the
// Prisma where clause, never a post-fetch filter) — proven here by
// showing the exact same underlying data through a staff route (visible)
// and a self-view route (invisible) side by side.
describe("Exam views (e2e) — SPEC_V0.7.md §4, step 3", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let classArmId: string;
  let sessionId: string;
  let termFirstId: string;
  let termSecondId: string;
  let mathTeacherId: string;

  let publishedSubjectId: string; // scored + published in term FIRST
  let draftSubjectId: string; // scored, never published, term FIRST

  let studentId: string;
  let studentToken: string;
  let parentToken: string;

  // v0.7 step 5 (SPEC_V0.7.md §4) — comparative analytics fixture:
  // classmate2 is scored + published ALONGSIDE studentId on the same exam
  // (a normal, unremarkable score); classmate3 is a STRAGGLER, scored
  // AFTER publish() already ran, with a deliberately EXTREME score, so
  // its term_subject_exam_result starts (and stays) DRAFT — the exact
  // classmate whose data must never feed a self-view caller's analytics.
  let classmate2Id: string;
  let classmate3Id: string;

  const createdSessionIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdClassArmIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const SEED_PASSWORD = "Passw0rd!";

  async function createExam(subjectId: string, termId: string, name: string): Promise<string> {
    const exam = await prisma.exam.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name, createdBy: mathTeacherId },
    });
    return exam.id;
  }

  async function scoreAndMaybePublish(subjectId: string, examId: string, termId: string, rawScore: number, publish: boolean) {
    const saveRes = await request(app.getHttpServer())
      .put("/api/v1/exams/scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId, examId, termId, scores: [{ studentId, rawScore }] });
    if (saveRes.status !== 200) throw new Error(`score failed: ${saveRes.status} ${JSON.stringify(saveRes.body)}`);
    if (publish) {
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId, subjectId, termId });
      if (publishRes.status !== 200) throw new Error(`publish failed: ${publishRes.status} ${JSON.stringify(publishRes.body)}`);
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
    mathTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;

    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-ExamViews-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-09-01"), isCurrent: false },
    });
    sessionId = session.id;
    createdSessionIds.push(sessionId);

    const termFirst = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId, name: "FIRST", startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01") },
    });
    termFirstId = termFirst.id;
    const termSecond = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId, name: "SECOND", startsOn: new Date("2027-05-01"), endsOn: new Date("2027-08-01") },
    });
    termSecondId = termSecond.id;
    createdTermIds.push(termFirstId, termSecondId);

    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    const classArm = await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-ExamViews-${stamp}` } });
    classArmId = classArm.id;
    createdClassArmIds.push(classArmId);

    const publishedSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E ExamViews Published ${stamp}`, code: `XVP${stamp.slice(-5)}`.slice(0, 10).toUpperCase() },
    });
    publishedSubjectId = publishedSubject.id;
    const draftSubject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E ExamViews Draft ${stamp}`, code: `XVD${stamp.slice(-5)}`.slice(0, 10).toUpperCase() },
    });
    draftSubjectId = draftSubject.id;
    createdSubjectIds.push(publishedSubjectId, draftSubjectId);

    for (const subjectId of [publishedSubjectId, draftSubjectId]) {
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId, classArmId, sessionId, teacherUserId: mathTeacherId },
      });
    }

    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-XV/${stamp}`,
        firstName: "ExamViews",
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-03-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348034000000",
      },
    });
    studentId = student.id;
    createdStudentIds.push(studentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId, classArmId, sessionId } });

    // FIRST term: draftSubject scored FIRST (so its term_subject_exam_result
    // row exists BEFORE publishedSubject's publish() cascades upward —
    // recomputeExamOverallForClassArm only sees whatever rows already
    // exist at the moment it runs; scoring order here is what makes the
    // term-level aggregate correctly stay DRAFT, not a quirk to work
    // around). publishedSubject scored+published second.
    const draftExamFirst = await createExam(draftSubjectId, termFirstId, "Draft Subject Exam");
    await scoreAndMaybePublish(draftSubjectId, draftExamFirst, termFirstId, 40, false);
    const publishedExamFirst = await createExam(publishedSubjectId, termFirstId, "Term 1 Exam");

    // v0.7 step 5 — classmate2 enrolled + scored on the SAME exam BEFORE
    // publish() below, so both studentId and classmate2 land PUBLISHED
    // together (satisfying the completeness gate as of THIS publish call).
    const classmate2 = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-XV/Classmate2-${stamp}`,
        firstName: "Classmate2",
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-03-02"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348034000002",
      },
    });
    classmate2Id = classmate2.id;
    createdStudentIds.push(classmate2Id);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: classmate2Id, classArmId, sessionId } });
    const classmate2Save = await request(app.getHttpServer())
      .put("/api/v1/exams/scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId: publishedSubjectId, examId: publishedExamFirst, termId: termFirstId, scores: [{ studentId: classmate2Id, rawScore: 60 }] });
    if (classmate2Save.status !== 200) throw new Error(`classmate2 score failed: ${classmate2Save.status} ${JSON.stringify(classmate2Save.body)}`);

    await scoreAndMaybePublish(publishedSubjectId, publishedExamFirst, termFirstId, 82, true);

    // classmate3: the STRAGGLER — enrolled + scored AFTER publish() already
    // ran, with an extreme 100. Their term_subject_exam_result starts (and
    // stays) DRAFT; a broken published-only filter on the class analytics
    // would be unmissable, not a subtle few-point drift.
    const classmate3 = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: `E2E-XV/Classmate3Straggler-${stamp}`,
        firstName: "Classmate3Straggler",
        lastName: "Student",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-03-03"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348034000003",
      },
    });
    classmate3Id = classmate3.id;
    createdStudentIds.push(classmate3Id);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: classmate3Id, classArmId, sessionId } });
    const classmate3Save = await request(app.getHttpServer())
      .put("/api/v1/exams/scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId: publishedSubjectId, examId: publishedExamFirst, termId: termFirstId, scores: [{ studentId: classmate3Id, rawScore: 100 }] });
    if (classmate3Save.status !== 200) throw new Error(`classmate3 score failed: ${classmate3Save.status} ${JSON.stringify(classmate3Save.body)}`);

    // SECOND term: publishedSubject scored but left DRAFT (this term never publishes) —
    // proves a "partially published year" shows term FIRST but not term SECOND.
    const examSecond = await createExam(publishedSubjectId, termSecondId, "Term 2 Exam");
    await scoreAndMaybePublish(publishedSubjectId, examSecond, termSecondId, 55, false);

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: `E2EXV${stamp}`.slice(0, 20).toUpperCase(), studentId, firstName: "ExamViews", lastName: "Student", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, studentUser.username!, "sunrise");

    const guardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "ExamViews", lastName: "Guardian", phone: "+2348034000001" } });
    createdGuardianIds.push(guardian.id);
    await prisma.studentGuardian.create({ data: { schoolId: sunriseId, studentId, guardianId: guardian.id, relationship: GuardianRelationship.OTHER, isPrimary: true } });
    const parentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: `E2EXVP${stamp}`.slice(0, 20).toUpperCase(), guardianId: guardian.id, firstName: "ExamViews", lastName: "Parent", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(parentUser.id);
    parentToken = await loginAs(app, parentUser.username!, "sunrise");
  });

  afterAll(async () => {
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { guardianId: { in: createdGuardianIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    const exams = await prisma.exam.findMany({ where: { subjectId: { in: createdSubjectIds } }, select: { id: true } });
    await prisma.examScore.deleteMany({ where: { examId: { in: exams.map((e) => e.id) } } });
    await prisma.exam.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termExamResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.yearExamResult.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  describe("GET /students/:id/exams (staff)", () => {
    it("shows the published subject's exam breakdown and average", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toHaveLength(1);
      expect(response.body.exams[0].rawScore).toBe(82);
      expect(response.body.subjectExamAverage).toBe(82);
      expect(response.body.status).toBe("PUBLISHED");
    });

    it("v0.7 step 5: staff sees comparative analytics computed over the WHOLE class, including the straggler classmate's extreme score", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      // avg(82, 60, 100) = 80.666... -> 80.67 — the straggler counts for staff.
      expect(response.body.classAverageScore).toBeCloseTo(80.67, 2);
      expect(response.body.exams[0]).toMatchObject({ classAverageScore: expect.closeTo(80.67, 2), bestScore: 100, worstScore: 60 });
    });

    it("also shows the DRAFT (never-published) subject's real data to staff", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: draftSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toHaveLength(1);
      expect(response.body.exams[0].rawScore).toBe(40);
      expect(response.body.status).toBe("DRAFT");
    });

    it("404s (not 403) cross-tenant", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId });
      expect(response.status).toBe(401);
    });
  });

  describe("Published-only wall — /me/exams and /me/children/:childId/exams", () => {
    it("STUDENT sees the published subject's real data", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/exams")
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(studentToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toHaveLength(1);
      expect(response.body.exams[0].rawScore).toBe(82);
      expect(response.body.subjectExamAverage).toBe(82);
      expect(response.body.status).toBe("PUBLISHED");
    });

    it("STUDENT sees NOTHING for the unpublished subject — indistinguishable from never-entered", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/exams")
        .query({ subjectId: draftSubjectId, termId: termFirstId, sessionId })
        .set(auth(studentToken));
      expect(response.status).toBe(200);
      expect(response.body.exams).toEqual([]);
      expect(response.body.subjectExamAverage).toBeNull();
      expect(response.body.subjectExamGrade).toBeNull();
      expect(response.body.status).toBeNull();
    });

    it("PARENT sees the same published/unpublished split for their child", async () => {
      const publishedRes = await request(app.getHttpServer())
        .get("/api/v1/me/children")
        .set(auth(parentToken));
      expect(publishedRes.status).toBe(200);
      const childId = publishedRes.body.children[0].studentId;
      expect(childId).toBe(studentId);

      const published = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${childId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(parentToken));
      expect(published.status).toBe(200);
      expect(published.body.exams).toHaveLength(1);
      expect(published.body.status).toBe("PUBLISHED");

      const draft = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${childId}/exams`)
        .query({ subjectId: draftSubjectId, termId: termFirstId, sessionId })
        .set(auth(parentToken));
      expect(draft.status).toBe(200);
      expect(draft.body.exams).toEqual([]);
      expect(draft.body.status).toBeNull();
    });

    it("rejects unauthenticated requests on both self-view routes", async () => {
      const a = await request(app.getHttpServer())
        .get("/api/v1/me/exams")
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId });
      expect(a.status).toBe(401);

      const b = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId });
      expect(b.status).toBe(401);
    });

    // v0.7 step 5 (SPEC_V0.7.md §4) — the two non-negotiables, exam track.
    it("class average/best/worst EXCLUDE the straggler classmate's extreme (unpublished) score for STUDENT and PARENT, and the classmate's identity never leaks", async () => {
      const asStudent = await request(app.getHttpServer())
        .get("/api/v1/me/exams")
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(studentToken));
      expect(asStudent.status).toBe(200);
      // avg(82, 60) = 71 — classmate3's 100 excluded.
      expect(asStudent.body.classAverageScore).toBe(71);
      expect(asStudent.body.exams[0]).toMatchObject({ classAverageScore: 71, bestScore: 82, worstScore: 60 });

      const serializedStudent = JSON.stringify(asStudent.body);
      expect(serializedStudent).not.toContain("Classmate3Straggler");
      expect(serializedStudent).not.toContain(classmate3Id);

      const childrenRes = await request(app.getHttpServer()).get("/api/v1/me/children").set(auth(parentToken));
      const childId = childrenRes.body.children[0].studentId;
      const asParent = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${childId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(parentToken));
      expect(asParent.status).toBe(200);
      expect(asParent.body.classAverageScore).toBe(71);
      const serializedParent = JSON.stringify(asParent.body);
      expect(serializedParent).not.toContain("Classmate3Straggler");
      expect(serializedParent).not.toContain(classmate3Id);

      // Staff sees the real, unfiltered class — the extreme value included.
      const asStaff = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseAdminToken));
      expect(asStaff.body.exams[0].bestScore).toBe(100);
    });
  });

  describe("GET /students/:id/year-exams (staff) — the whole-year, partial-year case", () => {
    it("shows term FIRST's published subject, term FIRST's draft subject, and term SECOND's draft data — all real, staff sees everything", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/year-exams`)
        .query({ sessionId })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);

      const termFirst = response.body.terms.find((t: { termId: string }) => t.termId === termFirstId);
      const termSecond = response.body.terms.find((t: { termId: string }) => t.termId === termSecondId);
      expect(termFirst.subjects).toHaveLength(2);
      expect(termFirst.subjects.find((s: { subjectId: string }) => s.subjectId === publishedSubjectId).subjectExamAverage).toBe(82);
      expect(termFirst.subjects.find((s: { subjectId: string }) => s.subjectId === draftSubjectId).subjectExamAverage).toBe(40);

      expect(termSecond.subjects).toHaveLength(1);
      expect(termSecond.subjects[0].subjectExamAverage).toBe(55);
      expect(termSecond.status).toBeNull(); // term-level aggregate never recomputed for a still-all-draft term
    });
  });

  describe("Published-only wall — /me/year-exams and /me/children/:childId/year-exams (partial year)", () => {
    it("STUDENT sees term FIRST's published subject only — the draft subject in term FIRST and all of term SECOND are invisible", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/year-exams")
        .query({ sessionId })
        .set(auth(studentToken));
      expect(response.status).toBe(200);

      const termFirst = response.body.terms.find((t: { termId: string }) => t.termId === termFirstId);
      const termSecond = response.body.terms.find((t: { termId: string }) => t.termId === termSecondId);

      expect(termFirst.subjects).toHaveLength(1);
      expect(termFirst.subjects[0].subjectId).toBe(publishedSubjectId);
      expect(termFirst.subjects[0].subjectExamAverage).toBe(82);
      // Term FIRST's own cross-subject aggregate never published either
      // (draftSubjectId never published this term) — null, not a number.
      expect(termFirst.termExamAverage).toBeNull();
      expect(termFirst.status).toBeNull();

      // Term SECOND has nothing published at all — empty, not an error.
      expect(termSecond.subjects).toEqual([]);
      expect(termSecond.termExamAverage).toBeNull();
      expect(termSecond.status).toBeNull();

      // No term this session has ever been fully exam-published -> no year_exam_results row exists yet.
      expect(response.body.overallExamAverage).toBeNull();
      expect(response.body.yearExamPosition).toBeNull();
      expect(response.body.overallStatus).toBeNull();
    });

    it("PARENT sees the identical partial-year picture for their child", async () => {
      const childrenRes = await request(app.getHttpServer()).get("/api/v1/me/children").set(auth(parentToken));
      const childId = childrenRes.body.children[0].studentId;

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${childId}/year-exams`)
        .query({ sessionId })
        .set(auth(parentToken));
      expect(response.status).toBe(200);
      const termFirst = response.body.terms.find((t: { termId: string }) => t.termId === termFirstId);
      expect(termFirst.subjects).toHaveLength(1);
      expect(termFirst.subjects[0].subjectId).toBe(publishedSubjectId);
    });

    it("rejects unauthenticated requests on both self-view routes", async () => {
      const a = await request(app.getHttpServer()).get("/api/v1/me/year-exams").query({ sessionId });
      expect(a.status).toBe(401);

      const b = await request(app.getHttpServer()).get(`/api/v1/me/children/${studentId}/year-exams`).query({ sessionId });
      expect(b.status).toBe(401);
    });
  });

  describe("TEACHER read access (any relationship to the class arm, mirroring getReportCard)", () => {
    it("the assigned subject teacher can read both views for this student", async () => {
      const a = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/exams`)
        .query({ subjectId: publishedSubjectId, termId: termFirstId, sessionId })
        .set(auth(sunriseTeacherToken));
      expect(a.status).toBe(200);

      const b = await request(app.getHttpServer())
        .get(`/api/v1/students/${studentId}/year-exams`)
        .query({ sessionId })
        .set(auth(sunriseTeacherToken));
      expect(b.status).toBe(200);
    });
  });

  // v0.7 step 5 (SPEC_V0.7.md §4) — year_exam_results has NO class_arm_id
  // (it's a whole-session aggregate, not per-class-arm — a student could
  // in principle move class arms mid-year). This is the ONE analytics
  // level where "class membership" can't be a direct column filter and
  // must instead resolve via student_enrollments for this class arm +
  // session (getStudentYearExams's `classmates` query). A fully isolated,
  // dedicated fixture — one class arm, one subject/exam, two students,
  // BOTH published — proves the roster-join actually finds the right
  // classmate's score, not just that the feature happens to fall back to
  // null everywhere (which the main fixture above, where nothing ever
  // reaches a real YearExamResult, could never distinguish).
  describe("Comparative analytics — the YearExamResult roster-via-enrollment class-membership path", () => {
    let yerClassArmId: string;
    let yerSessionId: string;
    let yerTermId: string;
    let yerSubjectId: string;
    let yerStudentAId: string;
    let yerStudentBId: string;
    let yerTokenA: string;
    const yerCreatedUserIds: string[] = [];

    beforeAll(async () => {
      const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
      const yerSession = await prisma.academicSession.create({
        data: { schoolId: sunriseId, name: `E2E-YER-${stamp}`, startsOn: new Date("2028-01-01"), endsOn: new Date("2028-09-01"), isCurrent: false },
      });
      yerSessionId = yerSession.id;
      const yerTerm = await prisma.term.create({
        data: { schoolId: sunriseId, sessionId: yerSessionId, name: "FIRST", startsOn: new Date("2028-01-01"), endsOn: new Date("2028-04-01") },
      });
      yerTermId = yerTerm.id;
      const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
      const yerClassArm = await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2.id, name: `E2E-YER-${stamp}` } });
      yerClassArmId = yerClassArm.id;
      const yerSubject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: `E2E YER Subject ${stamp}`, code: `YER${stamp.slice(-5)}`.slice(0, 10).toUpperCase() },
      });
      yerSubjectId = yerSubject.id;
      await prisma.subjectTeacherAssignment.create({
        data: { schoolId: sunriseId, subjectId: yerSubjectId, classArmId: yerClassArmId, sessionId: yerSessionId, teacherUserId: mathTeacherId },
      });

      async function makeYerStudent(prefix: string, index: number): Promise<string> {
        const s = await prisma.student.create({
          data: {
            schoolId: sunriseId,
            admissionNumber: `E2E-YER/${prefix}`,
            firstName: prefix,
            lastName: "Student",
            gender: Gender.FEMALE,
            dateOfBirth: new Date(Date.UTC(2012, 0, 1 + index)),
            guardianName: "E2E Guardian",
            guardianPhone: `+2348035${String(index).padStart(6, "0")}`,
          },
        });
        await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: s.id, classArmId: yerClassArmId, sessionId: yerSessionId } });
        return s.id;
      }
      yerStudentAId = await makeYerStudent("YerA", 0);
      yerStudentBId = await makeYerStudent("YerB", 1);

      const yerExam = await prisma.exam.create({
        data: { schoolId: sunriseId, classArmId: yerClassArmId, subjectId: yerSubjectId, sessionId: yerSessionId, termId: yerTermId, name: "YER Exam", createdBy: mathTeacherId },
      });
      const saveRes = await request(app.getHttpServer())
        .put("/api/v1/exams/scores")
        .set(auth(sunriseAdminToken))
        .send({
          classArmId: yerClassArmId,
          subjectId: yerSubjectId,
          examId: yerExam.id,
          termId: yerTermId,
          scores: [
            { studentId: yerStudentAId, rawScore: 80 },
            { studentId: yerStudentBId, rawScore: 60 },
          ],
        });
      if (saveRes.status !== 200) throw new Error(`score failed: ${saveRes.status} ${JSON.stringify(saveRes.body)}`);
      // Publishing this ONE subject cascades term_exam_results (the only
      // subject this term -> immediately PUBLISHED) and year_exam_results
      // (>=1 published term this session -> a real row per student) —
      // recomputeYearExamResults doesn't require every term published.
      const publishRes = await request(app.getHttpServer())
        .post("/api/v1/exams/publish")
        .set(auth(sunriseAdminToken))
        .send({ classArmId: yerClassArmId, subjectId: yerSubjectId, termId: yerTermId });
      if (publishRes.status !== 200) throw new Error(`publish failed: ${publishRes.status} ${JSON.stringify(publishRes.body)}`);

      const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);
      const yerUserA = await prisma.user.create({
        data: {
          schoolId: sunriseId,
          role: UserRole.STUDENT,
          username: `E2EYERA${stamp}`.slice(0, 20).toUpperCase(),
          studentId: yerStudentAId,
          firstName: "YerA",
          lastName: "Student",
          passwordHash,
          mustChangePassword: false,
        },
      });
      yerCreatedUserIds.push(yerUserA.id);
      yerTokenA = await loginAs(app, yerUserA.username!, "sunrise");
    });

    afterAll(async () => {
      await prisma.refreshToken.deleteMany({ where: { userId: { in: yerCreatedUserIds } } });
      await prisma.user.deleteMany({ where: { id: { in: yerCreatedUserIds } } });
      const exams = await prisma.exam.findMany({ where: { subjectId: yerSubjectId }, select: { id: true } });
      await prisma.examScore.deleteMany({ where: { examId: { in: exams.map((e) => e.id) } } });
      await prisma.exam.deleteMany({ where: { subjectId: yerSubjectId } });
      await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: yerSubjectId } });
      await prisma.termExamResult.deleteMany({ where: { termId: yerTermId } });
      await prisma.yearExamResult.deleteMany({ where: { sessionId: yerSessionId } });
      await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: yerSubjectId } });
      await prisma.subject.delete({ where: { id: yerSubjectId } });
      await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: [yerStudentAId, yerStudentBId] } } });
      await prisma.student.deleteMany({ where: { id: { in: [yerStudentAId, yerStudentBId] } } });
      await prisma.classArm.delete({ where: { id: yerClassArmId } });
      await prisma.term.delete({ where: { id: yerTermId } });
      await prisma.academicSession.delete({ where: { id: yerSessionId } });
    });

    it("resolves 'class' membership via student_enrollments (year_exam_results has no class_arm_id of its own) — the general class average reflects the classmate's PUBLISHED score", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/me/year-exams")
        .query({ sessionId: yerSessionId })
        .set(auth(yerTokenA));
      expect(response.status).toBe(200);
      // A=80, B=60, both published -> avg 70. A wrong/empty roster-join
      // would leave this null or collapse it to A's own 80.
      expect(response.body.generalClassAverage).toBe(70);
      expect(response.body.overallExamAverage).toBe(80); // A's OWN average, unaffected
    });
  });
});
