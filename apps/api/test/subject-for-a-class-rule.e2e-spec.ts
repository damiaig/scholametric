import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// SPEC_V0.5.1.md §2.1/§2.2, v0.5.1 step 1: a subject is "for a class" iff a
// subject_teacher_assignment exists for that (class-arm, subject, session)
// — hidden from grade entry, overview, review, student-results, and the
// report card otherwise, EXCEPT Q1(b): a subject that already has real
// results is never hidden once graded, only flagged needsTeacherAssignment.
// Every scenario gets its own scratch session+term+class-arm+subject+
// students bundle in the REAL Sunrise tenant (mirrors terms.e2e-spec.ts's
// createScratchBundle) — never the seeded demo data, so a full-suite run
// can't dirty it (docs/DECISIONS.md).
describe("Subject-for-a-class rule (e2e) — SPEC_V0.5.1.md §2.1/§2.2, v0.5.1 step 1", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let jss2LevelId: string;
  let ca1Id: string;
  let teacherUserId: string;
  let currentSessionId: string;

  const createdSessionIds: string[] = [];
  const createdTermIds: string[] = [];
  const createdClassArmIds: string[] = [];
  const createdSubjectIds: string[] = [];
  const createdStudentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  interface ScratchBundle {
    sessionId: string;
    termId: string;
    classArmId: string;
    subjectId: string;
    studentIds: string[];
  }

  async function createScratchBundle(prefix: string, studentCount = 1): Promise<ScratchBundle> {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-SFC-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-SFC-${stamp}` },
    });
    createdClassArmIds.push(classArm.id);
    const subject = await prisma.subject.create({
      data: { schoolId: sunriseId, name: `E2E SFC ${stamp}`, code: `SFC${stamp.slice(-6)}`.slice(0, 10).toUpperCase() },
    });
    createdSubjectIds.push(subject.id);

    const studentIds: string[] = [];
    for (let i = 0; i < studentCount; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-SFC/${stamp}/${i}`,
          firstName: "SubjectClass",
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

  // Assignments are session-scoped, and the real POST /subject-assignments
  // endpoint always resolves the school's CURRENT session — it can't target
  // a scratch (non-current) session, so assignments for these bundles are
  // created directly, the same way the bundle's own session/term/class-arm
  // are.
  async function assignTeacher(bundle: ScratchBundle) {
    return prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: bundle.subjectId, classArmId: bundle.classArmId, sessionId: bundle.sessionId, teacherUserId },
    });
  }

  // GET /class-arms/:id (the entry-picker's data source) always resolves
  // subjectTeachers for the school's CURRENT session specifically — that's
  // pre-existing, unchanged behavior (see ClassArmsService.findOne's own
  // doc comment), not something this step altered. Proving the entry-
  // picker reflects an assignment therefore needs an assignment under the
  // REAL current session, separate from the scratch bundle's own (non-
  // current) session that the grid/term checks use.
  async function assignTeacherForCurrentSession(bundle: ScratchBundle) {
    return prisma.subjectTeacherAssignment.create({
      data: { schoolId: sunriseId, subjectId: bundle.subjectId, classArmId: bundle.classArmId, sessionId: currentSessionId, teacherUserId },
    });
  }

  function gridQuery(bundle: ScratchBundle) {
    return { classArmId: bundle.classArmId, subjectId: bundle.subjectId, componentId: ca1Id, termId: bundle.termId };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2LevelId = jss2.id;

    const ca1 = await prisma.assessmentComponent.findFirstOrThrow({
      where: { schoolId: sunriseId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    ca1Id = ca1.id;

    const teacher = await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } });
    teacherUserId = teacher.id;

    const currentSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    currentSessionId = currentSession.id;
  });

  afterAll(async () => {
    await prisma.termUnlock.deleteMany({ where: { termId: { in: createdTermIds } } });
    await prisma.studentScore.deleteMany({ where: { termId: { in: createdTermIds } } });
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

  // classes.e2e-spec.ts already proves GET /class-arms/:id's subjectTeachers
  // (the entry-picker's data source) reflects real assignments for the
  // seeded current-session data; this spec's own class-arm-detail proof
  // lives in the next test, using a current-session assignment (see
  // assignTeacherForCurrentSession's comment).
  it("grid entry rejects an unassigned pair for SCHOOL_ADMIN/PROPRIETOR with 404 (not gradeable), and for TEACHER with 403 (not your assignment) — same as before", async () => {
    const bundle = await createScratchBundle("Reject");

    const adminGet = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(sunriseAdminToken));
    expect(adminGet.status).toBe(404);
    expect(adminGet.body.message).toMatch(/no teacher is assigned/i);

    const proprietorGet = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(sunriseProprietorToken));
    expect(proprietorGet.status).toBe(404);

    const adminSave = await request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(sunriseAdminToken))
      .send({ ...gridQuery(bundle), scores: [{ studentId: bundle.studentIds[0], rawScore: 15 }] });
    expect(adminSave.status).toBe(404);
    expect(adminSave.body.message).toMatch(/no teacher is assigned/i);

    const teacherGet = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(sunriseTeacherToken));
    expect(teacherGet.status).toBe(403);
    expect(teacherGet.body.message).toMatch(/not assigned to teach/i);
  });

  it("assigning a teacher makes the subject appear in class-arm detail (entry-picker source) and gradeable for admin, proprietor, and that teacher", async () => {
    const bundle = await createScratchBundle("Assigned");

    const beforeDetail = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${bundle.classArmId}`)
      .set(auth(sunriseAdminToken));
    expect(beforeDetail.body.subjectTeachers).toEqual([]);

    await assignTeacherForCurrentSession(bundle);
    const afterDetail = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${bundle.classArmId}`)
      .set(auth(sunriseAdminToken));
    expect(afterDetail.body.subjectTeachers.map((t: { subjectId: string }) => t.subjectId)).toContain(bundle.subjectId);

    // Grid entry is gated by the BUNDLE's own term/session, independent of
    // "current" — a separate assignment there proves it too.
    await assignTeacher(bundle);

    const adminGet = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(sunriseAdminToken));
    expect(adminGet.status).toBe(200);

    const proprietorSave = await request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(sunriseProprietorToken))
      .send({ ...gridQuery(bundle), scores: [{ studentId: bundle.studentIds[0], rawScore: 12 }] });
    expect(proprietorSave.status).toBe(200);

    const teacherGet = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(sunriseTeacherToken));
    expect(teacherGet.status).toBe(200);
  });

  it("Q1(b): a subject that already has real grades stays visible in overview/review/student-results/report-card when its assignment is later removed — flagged, not hidden — and the flag clears once reassigned", async () => {
    const bundle = await createScratchBundle("Orphan");
    const assignment = await assignTeacher(bundle);
    const [studentId] = bundle.studentIds;

    const save = await request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(sunriseAdminToken))
      .send({ ...gridQuery(bundle), scores: [{ studentId, rawScore: 15 }] });
    expect(save.status).toBe(200);

    // Remove the assignment through the real endpoint (SPEC_V0.5.1.md
    // §2.1/§2.2's actual removal path), not a direct delete — proves the
    // flag reacts to the real write, not just to manufactured DB state.
    const removed = await request(app.getHttpServer())
      .delete(`/api/v1/subject-assignments/${assignment.id}`)
      .set(auth(sunriseAdminToken));
    expect(removed.status).toBe(200);

    // Hidden from entry's grid write path (class-arm-detail's own
    // current-session-scoped proof lives in the previous test)...
    const gridAfterRemoval = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(sunriseAdminToken));
    expect(gridAfterRemoval.status).toBe(404);

    // ...but never hidden from the three read surfaces that already have
    // real data for it — flagged instead.
    const overview = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${bundle.classArmId}/results`)
      .query({ termId: bundle.termId })
      .set(auth(sunriseAdminToken));
    expect(overview.status).toBe(200);
    const overviewSubject = overview.body.subjects.find((s: { subjectId: string }) => s.subjectId === bundle.subjectId);
    expect(overviewSubject).toBeDefined();
    expect(overviewSubject.needsTeacherAssignment).toBe(true);

    const review = await request(app.getHttpServer())
      .get("/api/v1/grades/review")
      .query({ classArmId: bundle.classArmId, termId: bundle.termId })
      .set(auth(sunriseAdminToken));
    expect(review.status).toBe(200);
    const reviewSubject = review.body.subjects.find((s: { subjectId: string }) => s.subjectId === bundle.subjectId);
    expect(reviewSubject).toBeDefined();
    expect(reviewSubject.needsTeacherAssignment).toBe(true);

    const studentResults = await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/results`)
      .query({ termId: bundle.termId, sessionId: bundle.sessionId })
      .set(auth(sunriseAdminToken));
    expect(studentResults.status).toBe(200);
    const studentResultsSubject = studentResults.body.subjects.find((s: { subjectId: string }) => s.subjectId === bundle.subjectId);
    expect(studentResultsSubject).toBeDefined();
    expect(studentResultsSubject.needsTeacherAssignment).toBe(true);

    const reportCard = await request(app.getHttpServer())
      .get(`/api/v1/students/${studentId}/report-card`)
      .query({ termId: bundle.termId, sessionId: bundle.sessionId })
      .set(auth(sunriseAdminToken));
    expect(reportCard.status).toBe(200);
    const reportCardSubject = reportCard.body.subjects.find((s: { subjectId: string }) => s.subjectId === bundle.subjectId);
    expect(reportCardSubject).toBeDefined();
    expect(reportCardSubject.needsTeacherAssignment).toBe(true);

    // Reassign — the flag is live, not sticky, and entry re-opens.
    await assignTeacher(bundle);
    const overviewAfterReassign = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${bundle.classArmId}/results`)
      .query({ termId: bundle.termId })
      .set(auth(sunriseAdminToken));
    const reassignedSubject = overviewAfterReassign.body.subjects.find((s: { subjectId: string }) => s.subjectId === bundle.subjectId);
    expect(reassignedSubject.needsTeacherAssignment).toBe(false);

    const gridAfterReassign = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(sunriseAdminToken));
    expect(gridAfterReassign.status).toBe(200);
  });

  it("cross-tenant: a second school's admin gets 404, never a hint that this class arm exists", async () => {
    const bundle = await createScratchBundle("CrossTenant");
    await assignTeacher(bundle);

    const detail = await request(app.getHttpServer())
      .get(`/api/v1/class-arms/${bundle.classArmId}`)
      .set(auth(hillcrestAdminToken));
    expect(detail.status).toBe(404);

    const grid = await request(app.getHttpServer())
      .get("/api/v1/grades/grid")
      .query(gridQuery(bundle))
      .set(auth(hillcrestAdminToken));
    expect(grid.status).toBe(404);
  });
});
