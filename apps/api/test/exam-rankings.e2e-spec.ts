import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.7 step 1 (SPEC_V0.7.md §5, Q6) — the three confirmed rankings:
// (a) class ranking on evaluation term average (TermOverallResult,
// unchanged mechanism — already proven throughout grades-publish.e2e-
// spec.ts). This file proves (b) and (c), the two new exam-track
// aggregates: TermExamResult.examPosition (per-term, cross-subject) and
// YearExamResult.yearExamPosition (whole-year, across all three terms —
// purely derived, recomputed progressively as each term's exam track
// publishes, no separate manual publish action of its own).
describe("Exam rankings (e2e) — SPEC_V0.7.md §5, Q6 rankings (b) and (c)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let sunriseProprietorToken: string;
  let sunriseId: string;
  let jss2LevelId: string;
  let teacherUserId: string;

  const createdSessionIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdClassArmIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  async function createExamFor(subjectId: string, classArmId: string, sessionId: string, termId: string, name = "Exam"): Promise<string> {
    const exam = await prisma.exam.create({
      data: { schoolId: sunriseId, classArmId, subjectId, sessionId, termId, name, createdBy: teacherUserId },
    });
    return exam.id;
  }

  async function createSubjectAssigned(classArmId: string, sessionId: string, name: string): Promise<string> {
    const subject = await prisma.subject.create({
      data: { schoolId: sunriseId, name, code: name.replace(/\s/g, "").slice(0, 10).toUpperCase() },
    });
    createdSubjectIds.push(subject.id);
    await prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: subject.id, classArmId, sessionId, teacherUserId },
    });
    return subject.id;
  }

  // v0.7.4 step 2 (SPEC_V0.7.4.md §3) — replaces the retired direct
  // POST /exams/publish with the two-step workflow: TEACHER submits (own
  // assignment, createSubjectAssigned always assigns teacherUserId), then
  // admin approves. `scores` must cover every CURRENTLY ENROLLED roster
  // student for this subject's exams (the roster-wide completeness gate,
  // Q5) — a caller wanting to exclude a student from a later subject's
  // gate must withdraw them first (see the ranking (b) test below).
  async function scoreAndPublishExam(classArmId: string, subjectId: string, termId: string, examId: string, scores: { studentId: string; rawScore?: number; isAbsent?: boolean }[]) {
    const saveRes = await request(app.getHttpServer())
      .put("/api/v1/exams/scores")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId, examId, termId, scores });
    if (saveRes.status !== 200) throw new Error(`score failed: ${saveRes.status} ${JSON.stringify(saveRes.body)}`);

    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/exams/submit-for-approval")
      .set(auth(sunriseTeacherToken))
      .send({ classArmId, subjectId, termId });
    if (submitRes.status !== 200) throw new Error(`submit failed: ${submitRes.status} ${JSON.stringify(submitRes.body)}`);

    const publishRes = await request(app.getHttpServer())
      .post("/api/v1/exams/approve")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId, termId });
    if (publishRes.status !== 200) throw new Error(`approve failed: ${publishRes.status} ${JSON.stringify(publishRes.body)}`);
    return publishRes;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;
    teacherUserId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;
  });

  afterAll(async () => {
    await prisma.examScore.deleteMany({ where: { exam: { subjectId: { in: createdSubjectIds } } } });
    await prisma.exam.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termSubjectExamResult.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.termExamResult.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.yearExamResult.deleteMany({ where: { sessionId: { in: createdSessionIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: createdSubjectIds } } });
    await prisma.subject.deleteMany({ where: { id: { in: createdSubjectIds } } });
    await prisma.classArm.deleteMany({ where: { id: { in: createdClassArmIds } } });
    await prisma.term.deleteMany({ where: { id: { in: createdTermIds } } });
    await prisma.academicSession.deleteMany({ where: { id: { in: createdSessionIds } } });
    await app.close();
  });

  it("ranking (b): term_exam_results ranks cross-subject, only among students fully exam-published for that term", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-ExRank-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-ExRank-${stamp}` } });
    createdClassArmIds.push(classArm.id);

    const students: string[] = [];
    for (const label of ["A", "B", "C"]) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId, admissionNumber: `E2E-EXR/${stamp}/${label}`, firstName: "ExamRank", lastName: label,
          gender: Gender.FEMALE, dateOfBirth: new Date("2012-01-01"), guardianName: "E2E Guardian", guardianPhone: `+2348036${stamp.slice(-6)}${label}`,
        },
      });
      createdStudentIds.push(student.id);
      await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: student.id, classArmId: classArm.id, sessionId: session.id } });
      students.push(student.id);
    }
    const [a, b, c] = students;

    const subjectX = await createSubjectAssigned(classArm.id, session.id, `E2E ExRank X ${stamp}`);
    const subjectY = await createSubjectAssigned(classArm.id, session.id, `E2E ExRank Y ${stamp}`);
    const examX = await createExamFor(subjectX, classArm.id, session.id, term.id);
    const examY = await createExamFor(subjectY, classArm.id, session.id, term.id);

    // A and B take both subjects (fully exam-published, ranked). C takes
    // only subjectX. v0.7.4 step 2 (SPEC_V0.7.4.md §3 Q5): the roster-wide
    // completeness gate means a currently-enrolled student can no longer
    // be silently left off a subject's publish the way the old carve-out
    // gate allowed — C must actually leave the roster (withdraw) before
    // subjectY publishes, reproducing "took fewer subjects this term" the
    // only way the new gate permits. C's already-published subjectX
    // result is untouched by the withdrawal (recomputeExamOverallForClassArm
    // reads every existing term_subject_exam_result row for the class
    // arm/term, not just currently-enrolled students).
    await scoreAndPublishExam(classArm.id, subjectX, term.id, examX, [
      { studentId: a, rawScore: 80 },
      { studentId: b, rawScore: 60 },
      { studentId: c, rawScore: 90 },
    ]);

    const withdrawC = await request(app.getHttpServer())
      .post(`/api/v1/students/${c}/withdraw`)
      .set(auth(sunriseAdminToken))
      .send({ reason: "E2E: leaves roster before subjectY publishes" });
    expect(withdrawC.status).toBe(200);

    await scoreAndPublishExam(classArm.id, subjectY, term.id, examY, [
      { studentId: a, rawScore: 40 },
      { studentId: b, rawScore: 80 },
    ]);

    const results = await prisma.termExamResult.findMany({ where: { termId: term.id } });
    const byStudent = new Map(results.map((r) => [r.studentId, r]));

    // A: (80+40)/2=60. B: (60+80)/2=70. Both fully published (2 of 2).
    expect(byStudent.get(a)?.status).toBe("PUBLISHED");
    expect(Number(byStudent.get(a)?.averageScore)).toBe(60);
    expect(byStudent.get(b)?.status).toBe("PUBLISHED");
    expect(Number(byStudent.get(b)?.averageScore)).toBe(70);

    // C: only subjectX published (1 of 1 EXISTING row — but subjectY was
    // never even attempted, so C's own subjectX result is fully
    // published while C simply has no second subject at all this term).
    // subjects_count reflects existing rows only (1), all published ->
    // C IS fully published too, ranked alongside A and B.
    expect(byStudent.get(c)?.status).toBe("PUBLISHED");
    expect(byStudent.get(c)?.subjectsCount).toBe(1);
    expect(Number(byStudent.get(c)?.averageScore)).toBe(90);

    // Ranked across all three fully-published students: C (90) > B (70) > A (60).
    expect(byStudent.get(c)?.examPosition).toBe(1);
    expect(byStudent.get(b)?.examPosition).toBe(2);
    expect(byStudent.get(a)?.examPosition).toBe(3);
  });

  it("ranking (c): year_exam_results recomputes progressively across terms, ranks only students with >=1 published term, no row for zero", async () => {
    const stamp = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-YearRank-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-12-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term1 = await prisma.term.create({ data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01") } });
    const term2 = await prisma.term.create({ data: { schoolId: sunriseId, sessionId: session.id, name: "SECOND", startsOn: new Date("2027-05-01"), endsOn: new Date("2027-08-01") } });
    createdTermIds.push(term1.id, term2.id);
    const classArm = await prisma.classArm.create({ data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-YearRank-${stamp}` } });
    createdClassArmIds.push(classArm.id);

    // v0.7.4 step 2 (SPEC_V0.7.4.md §3 Q5) — only A and B are enrolled
    // (and thus roster-checked) up front; C isn't created/enrolled until
    // right before subjectZ, below. The old carve-out completeness gate
    // let an already-enrolled-but-untouched C sit out subjectX/subjectY
    // for free; the new roster-wide gate would require C decided on both
    // if they were enrolled this whole time (they'd block every publish
    // in between) — delaying C's enrollment is the only way to reproduce
    // "joins the cohort partway through the year" now.
    const students: string[] = [];
    for (const label of ["A", "B"]) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId, admissionNumber: `E2E-YR/${stamp}/${label}`, firstName: "YearRank", lastName: label,
          gender: Gender.MALE, dateOfBirth: new Date("2012-01-01"), guardianName: "E2E Guardian", guardianPhone: `+2348037${stamp.slice(-6)}${label}`,
        },
      });
      createdStudentIds.push(student.id);
      await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: student.id, classArmId: classArm.id, sessionId: session.id } });
      students.push(student.id);
    }
    const [a, b] = students;

    // Term 1: subjectX, both A and B take it. C doesn't exist yet.
    const subjectX = await createSubjectAssigned(classArm.id, session.id, `E2E YearRank X ${stamp}`);
    const examX = await createExamFor(subjectX, classArm.id, session.id, term1.id);
    await scoreAndPublishExam(classArm.id, subjectX, term1.id, examX, [
      { studentId: a, rawScore: 80 },
      { studentId: b, rawScore: 60 },
    ]);

    // After term 1 alone: both A and B have exactly 1 published term ->
    // ranked on that term's average alone. C doesn't exist yet.
    const afterTerm1 = await prisma.yearExamResult.findMany({ where: { sessionId: session.id } });
    const byStudentAfterTerm1 = new Map(afterTerm1.map((r) => [r.studentId, r]));
    expect(byStudentAfterTerm1.get(a)?.termsCount).toBe(1);
    expect(Number(byStudentAfterTerm1.get(a)?.averageScore)).toBe(80);
    expect(byStudentAfterTerm1.get(a)?.yearExamPosition).toBe(1);
    expect(byStudentAfterTerm1.get(b)?.yearExamPosition).toBe(2);

    // Term 2: subjectY, A scores low (40), B scores high (90) — flips the
    // whole-year lead once term 2 also publishes.
    const subjectY = await createSubjectAssigned(classArm.id, session.id, `E2E YearRank Y ${stamp}`);
    const examY = await createExamFor(subjectY, classArm.id, session.id, term2.id);
    await scoreAndPublishExam(classArm.id, subjectY, term2.id, examY, [
      { studentId: a, rawScore: 40 },
      { studentId: b, rawScore: 90 },
    ]);

    const afterTerm2 = await prisma.yearExamResult.findMany({ where: { sessionId: session.id } });
    const byStudentAfterTerm2 = new Map(afterTerm2.map((r) => [r.studentId, r]));
    // A: (80+40)/2=60 across 2 published terms. B: (60+90)/2=75.
    expect(byStudentAfterTerm2.get(a)?.termsCount).toBe(2);
    expect(Number(byStudentAfterTerm2.get(a)?.averageScore)).toBe(60);
    expect(byStudentAfterTerm2.get(b)?.termsCount).toBe(2);
    expect(Number(byStudentAfterTerm2.get(b)?.averageScore)).toBe(75);
    // B (75) now leads, having trailed A (80 vs 60) after term 1 alone —
    // proves the recompute is genuinely progressive, not a one-time snapshot.
    expect(byStudentAfterTerm2.get(b)?.yearExamPosition).toBe(1);
    expect(byStudentAfterTerm2.get(a)?.yearExamPosition).toBe(2);

    // C joins the roster only now (v0.7.4 step 2 — see the comment above
    // A/B's enrollment) and immediately publishes their own single
    // term-2 result -> gains a row, ranked among the now-three-student
    // published cohort. Before this point C didn't exist at all, so
    // there was nothing to assert "no row" against — the absence is
    // structural, not a queried fact.
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId, admissionNumber: `E2E-YR/${stamp}/C`, firstName: "YearRank", lastName: "C",
        gender: Gender.MALE, dateOfBirth: new Date("2012-01-01"), guardianName: "E2E Guardian", guardianPhone: `+2348037${stamp.slice(-6)}C`,
      },
    });
    createdStudentIds.push(student.id);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: student.id, classArmId: classArm.id, sessionId: session.id } });
    const c = student.id;

    // A and B are ALSO on the roster by now (roster-wide gate applies to
    // every currently-enrolled student, not just C) — marked absent on
    // examZ so subjectZ's completeness is satisfied without touching
    // C's own average.
    const subjectZ = await createSubjectAssigned(classArm.id, session.id, `E2E YearRank Z ${stamp}`);
    const examZ = await createExamFor(subjectZ, classArm.id, session.id, term2.id);
    await scoreAndPublishExam(classArm.id, subjectZ, term2.id, examZ, [
      { studentId: a, isAbsent: true },
      { studentId: b, isAbsent: true },
      { studentId: c, rawScore: 100 },
    ]);

    const finalResults = await prisma.yearExamResult.findMany({ where: { sessionId: session.id } });
    const byStudentFinal = new Map(finalResults.map((r) => [r.studentId, r]));
    expect(byStudentFinal.get(c)?.termsCount).toBe(1);
    expect(Number(byStudentFinal.get(c)?.averageScore)).toBe(100);
    expect(byStudentFinal.get(c)?.yearExamPosition).toBe(1); // highest of the three now
    expect(byStudentFinal.get(b)?.yearExamPosition).toBe(2);
    expect(byStudentFinal.get(a)?.yearExamPosition).toBe(3);
  });

  it("404s (not 403) — recompute/submit/approve/unpublish all resolve tenant scope before any cascade runs", async () => {
    // A lightweight cross-tenant sanity check specific to this file's own
    // routes (the exams-engine/exams-publish suites already prove this
    // exhaustively) — confirms the ranking cascades never leak scope.
    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrest.id, isCurrent: true } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrest.id, name: "JSS 1" } });
    const hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrest.id, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    const hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrest.id, name: "Mathematics" } })).id;
    const hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;
    const crossTenantBody = { classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, termId: hillcrestTermId };

    // approve/unpublish: SCHOOL_ADMIN/PROPRIETOR reach any subject in
    // their OWN school regardless of assignment, so a sunrise token
    // against hillcrest ids cleanly exercises tenant-scope resolution.
    const approveRes = await request(app.getHttpServer())
      .post("/api/v1/exams/approve")
      .set(auth(sunriseAdminToken))
      .send(crossTenantBody);
    expect(approveRes.status).toBe(404);

    const unpublishRes = await request(app.getHttpServer())
      .post("/api/v1/exams/unpublish")
      .set(auth(sunriseProprietorToken))
      .send(crossTenantBody);
    expect(unpublishRes.status).toBe(404);

    // submit: TEACHER-only, and a TEACHER's own assignment is checked
    // AFTER tenant scope resolves — a real sunrise teacher targeting
    // hillcrest's real ids still 404s on scope, never reaching (or
    // needing) an assignment check for a subject they were never even a
    // candidate to teach.
    const submitRes = await request(app.getHttpServer())
      .post("/api/v1/exams/submit-for-approval")
      .set(auth(sunriseTeacherToken))
      .send(crossTenantBody);
    expect(submitRes.status).toBe(404);
  });
});
