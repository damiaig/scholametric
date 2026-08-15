import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { Gender } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

// Term close is a one-way, whole-term action (no reopen endpoint) — every
// scenario below needs its OWN fresh session+term bundle via
// createScratchBundle(), never the school's real current session/term
// (Sunrise's real First Term is scored/published data every other e2e
// file depends on staying open; closing it here would permanently break
// them). classArm/subject/students are all bundle-local too, so a close
// in one test can never affect another test's bundle.
describe("Term lifecycle (e2e) — close/unlock/relock (SPEC_V0.5.md §2.3, v0.5 step 3)", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let jss2LevelId: string;
  let ca1Id: string;
  let ca2Id: string;
  let examId: string;

  let hillcrestId: string;
  let hillcrestArmId: string;
  let hillcrestSubjectId: string;
  let hillcrestTermId: string;

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

  // One session + term + class arm + subject + roster, fully isolated from
  // every other bundle and from the real seeded data. `subjectCount` lets
  // the per-slice-unlock test share one class arm across two subjects.
  async function createScratchBundle(prefix: string, studentCount = 3, subjectCount = 1): Promise<ScratchBundle & { subjectIds: string[] }> {
    const stamp = `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const session = await prisma.academicSession.create({
      data: { schoolId: sunriseId, name: `E2E-Terms-${stamp}`, startsOn: new Date("2027-01-01"), endsOn: new Date("2027-04-01"), isCurrent: false },
    });
    createdSessionIds.push(session.id);
    const term = await prisma.term.create({
      data: { schoolId: sunriseId, sessionId: session.id, name: "FIRST", startsOn: session.startsOn, endsOn: session.endsOn },
    });
    createdTermIds.push(term.id);
    const classArm = await prisma.classArm.create({
      data: { schoolId: sunriseId, classLevelId: jss2LevelId, name: `E2E-Terms-${stamp}` },
    });
    createdClassArmIds.push(classArm.id);

    const subjectIds: string[] = [];
    for (let s = 0; s < subjectCount; s++) {
      const subject = await prisma.subject.create({
        data: { schoolId: sunriseId, name: `E2E Terms ${stamp} ${s}`, code: `ET${s}${stamp.slice(-4)}`.slice(0, 10).toUpperCase() },
      });
      createdSubjectIds.push(subject.id);
      subjectIds.push(subject.id);
    }

    const studentIds: string[] = [];
    for (let i = 0; i < studentCount; i++) {
      const student = await prisma.student.create({
        data: {
          schoolId: sunriseId,
          admissionNumber: `E2E-TRM/${stamp}/${i}`,
          firstName: "Terms",
          lastName: `Student${i}`,
          gender: i % 2 === 0 ? Gender.MALE : Gender.FEMALE,
          dateOfBirth: new Date(Date.UTC(2012, 0, 1 + i)),
          guardianName: "E2E Guardian",
          guardianPhone: `+2348031${String(Date.now() + i).slice(-6)}`,
        },
      });
      createdStudentIds.push(student.id);
      await prisma.studentEnrollment.create({
        data: { schoolId: sunriseId, studentId: student.id, classArmId: classArm.id, sessionId: session.id },
      });
      studentIds.push(student.id);
    }

    return { sessionId: session.id, termId: term.id, classArmId: classArm.id, subjectId: subjectIds[0], subjectIds, studentIds };
  }

  async function saveScore(termId: string, classArmId: string, subjectId: string, componentId: string, studentId: string, rawScore: number) {
    return request(app.getHttpServer())
      .put("/api/v1/grades/grid")
      .set(auth(sunriseAdminToken))
      .send({ classArmId, subjectId, componentId, termId, scores: [{ studentId, rawScore }] });
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

    const components = await prisma.assessmentComponent.findMany({
      where: { schoolId: sunriseId, deletedAt: null },
      orderBy: { sortOrder: "asc" },
    });
    ca1Id = components[0].id;
    ca2Id = components[1].id;
    examId = components[2].id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestId = hillcrest.id;
    const hillcrestSession = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: hillcrestId, isCurrent: true } });
    const hillcrestJss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "JSS 1" } });
    hillcrestArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrestId, classLevelId: hillcrestJss1.id, name: "A" } })).id;
    hillcrestSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: hillcrestId, name: "Mathematics" } })).id;
    hillcrestTermId = (await prisma.term.findFirstOrThrow({ where: { sessionId: hillcrestSession.id, name: "FIRST" } })).id;
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

  describe("POST /terms/:id/close", () => {
    it("warn-but-allow (Q4): closes with unpublished results left behind, returning the grouped breakdown", async () => {
      const bundle = await createScratchBundle("CloseWarn");
      const [pending, draftOnly] = bundle.studentIds;
      await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, pending, 15);
      await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, examId, pending, 60); // -> PENDING_APPROVAL
      await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, draftOnly, 10); // -> DRAFT only

      const response = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/close`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.closedAt).not.toBeNull();
      expect(response.body.unpublishedCount).toBe(2);
      expect(response.body.unpublished).toEqual([
        { classArmId: bundle.classArmId, subjectId: bundle.subjectId, draftCount: 1, pendingApprovalCount: 1 },
      ]);

      const persisted = await prisma.term.findUniqueOrThrow({ where: { id: bundle.termId } });
      expect(persisted.closedAt).not.toBeNull();
      expect(persisted.closedBy).not.toBeNull();
    });

    it("re-closing an already-closed term 409s, not idempotent", async () => {
      const bundle = await createScratchBundle("CloseTwice");
      const first = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));
      expect(first.status).toBe(200);
      const closedAtFirst = first.body.closedAt;

      const second = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/already closed/i);

      const persisted = await prisma.term.findUniqueOrThrow({ where: { id: bundle.termId } });
      expect(persisted.closedAt?.toISOString()).toBe(closedAtFirst); // untouched by the rejected second attempt
    });

    it("403s a TEACHER", async () => {
      const bundle = await createScratchBundle("CloseTeacher");
      const response = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });

    it("PROPRIETOR may also close (same tier as publish, not owner-only)", async () => {
      const bundle = await createScratchBundle("CloseProprietor");
      const response = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseProprietorToken));
      expect(response.status).toBe(200);
    });

    it("rejects unauthenticated requests", async () => {
      const bundle = await createScratchBundle("CloseUnauth");
      const response = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`);
      expect(response.status).toBe(401);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const a = await request(app.getHttpServer()).post(`/api/v1/terms/${hillcrestTermId}/close`).set(auth(sunriseAdminToken));
      expect(a.status).toBe(404);

      const bundle = await createScratchBundle("CloseCrossTenant");
      const b = await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(hillcrestAdminToken));
      expect(b.status).toBe(404);
    });
  });

  describe("Edit-gating: saveGrid vs a closed term", () => {
    it("edit-open-ok: saveGrid succeeds normally on a never-closed term (baseline)", async () => {
      const bundle = await createScratchBundle("EditOpen");
      const response = await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, bundle.studentIds[0], 12);
      expect(response.status).toBe(200);
    });

    it("edit-closed-blocked: saveGrid 409s once the term is closed, with no active unlock", async () => {
      const bundle = await createScratchBundle("EditClosed");
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));

      const response = await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, bundle.studentIds[0], 12);
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/closed/i);
      expect(response.body.message).toMatch(/unlock/i);

      const persisted = await prisma.studentScore.findUnique({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: bundle.studentIds[0], subjectId: bundle.subjectId, componentId: ca1Id, termId: bundle.termId, sessionId: bundle.sessionId,
          },
        },
      });
      expect(persisted).toBeNull();
    });

    it("unlock -> edit-ok -> relock -> edit-blocked-again (the core round trip)", async () => {
      const bundle = await createScratchBundle("RoundTrip");
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));

      const blocked = await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, bundle.studentIds[0], 12);
      expect(blocked.status).toBe(409);

      const unlockRes = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Parent requested a correction" });
      expect(unlockRes.status).toBe(200);
      expect(unlockRes.body.relockedAt).toBeNull();

      const editedRes = await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, bundle.studentIds[0], 12);
      expect(editedRes.status).toBe(200);

      const relockRes = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/relock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId });
      expect(relockRes.status).toBe(200);
      expect(relockRes.body.relockedAt).not.toBeNull();
      expect(relockRes.body.id).toBe(unlockRes.body.id); // the SAME episode, resolved — not a new row

      const blockedAgain = await saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca2Id, bundle.studentIds[0], 5);
      expect(blockedAgain.status).toBe(409);
    });

    it("unlock is per-slice: a second subject on the same closed term stays blocked", async () => {
      const bundle = await createScratchBundle("PerSlice", 2, 2);
      const [subjectA, subjectB] = bundle.subjectIds;
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));

      await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: subjectA, reason: "Correcting subject A only" });

      const editA = await saveScore(bundle.termId, bundle.classArmId, subjectA, ca1Id, bundle.studentIds[0], 10);
      expect(editA.status).toBe(200);

      const editB = await saveScore(bundle.termId, bundle.classArmId, subjectB, ca1Id, bundle.studentIds[0], 10);
      expect(editB.status).toBe(409);
    });
  });

  describe("POST /terms/:id/unlock", () => {
    it("403s a TEACHER", async () => {
      const bundle = await createScratchBundle("UnlockTeacher");
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));
      const response = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Nope" });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const bundle = await createScratchBundle("UnlockCrossTenant");
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));

      const a = await request(app.getHttpServer())
        .post(`/api/v1/terms/${hillcrestTermId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId, reason: "Cross tenant attempt" });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(hillcrestAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Cross tenant attempt" });
      expect(b.status).toBe(404);
    });

    it("409s unlocking an OPEN term — nothing to clear", async () => {
      const bundle = await createScratchBundle("UnlockOpen");
      const response = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Term was never closed" });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/not closed/i);
    });

    it("409s unlocking an already-unlocked slice", async () => {
      const bundle = await createScratchBundle("UnlockTwice");
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));
      const first = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "First unlock" });
      expect(first.status).toBe(200);

      const second = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Second attempt" });
      expect(second.status).toBe(409);
      expect(second.body.message).toMatch(/already unlocked/i);
    });

    it("400s a reason shorter than the minimum", async () => {
      const bundle = await createScratchBundle("UnlockShortReason");
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));
      const response = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/unlock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "no" });
      expect(response.status).toBe(400);
    });
  });

  describe("POST /terms/:id/relock", () => {
    it("403s a TEACHER", async () => {
      const bundle = await createScratchBundle("RelockTeacher");
      const response = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/relock`)
        .set(auth(sunriseTeacherToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId });
      expect(response.status).toBe(403);
    });

    it("404s (not 403) cross-tenant, both directions", async () => {
      const bundle = await createScratchBundle("RelockCrossTenant");
      const a = await request(app.getHttpServer())
        .post(`/api/v1/terms/${hillcrestTermId}/relock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: hillcrestArmId, subjectId: hillcrestSubjectId });
      expect(a.status).toBe(404);

      const b = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/relock`)
        .set(auth(hillcrestAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId });
      expect(b.status).toBe(404);
    });

    it("409s relocking a slice with no active unlock", async () => {
      const bundle = await createScratchBundle("RelockNothingActive");
      const response = await request(app.getHttpServer())
        .post(`/api/v1/terms/${bundle.termId}/relock`)
        .set(auth(sunriseAdminToken))
        .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId });
      expect(response.status).toBe(409);
      expect(response.body.message).toMatch(/no active unlock/i);
    });
  });

  describe("Concurrency", () => {
    it("a close and a saveGrid, fired concurrently, don't corrupt each other — one of two consistent outcomes", async () => {
      const bundle = await createScratchBundle("RaceClose");
      const [student] = bundle.studentIds;

      const [closeRes, saveRes] = await Promise.all([
        request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken)),
        saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, student, 14),
      ]);

      expect(closeRes.status).toBe(200); // close never depends on the save's outcome
      expect([200, 409]).toContain(saveRes.status);

      const persisted = await prisma.studentScore.findUnique({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student, subjectId: bundle.subjectId, componentId: ca1Id, termId: bundle.termId, sessionId: bundle.sessionId,
          },
        },
      });
      if (saveRes.status === 200) {
        expect(Number(persisted?.rawScore)).toBe(14); // the save's read won the race, landed before the close
      } else {
        expect(persisted).toBeNull(); // the close's read won, save correctly rejected
      }

      const term = await prisma.term.findUniqueOrThrow({ where: { id: bundle.termId } });
      expect(term.closedAt).not.toBeNull();
    });

    it("an unlock and a saveGrid, fired concurrently against an already-closed term — one of two consistent outcomes", async () => {
      const bundle = await createScratchBundle("RaceUnlock");
      const [student] = bundle.studentIds;
      await request(app.getHttpServer()).post(`/api/v1/terms/${bundle.termId}/close`).set(auth(sunriseAdminToken));

      const [unlockRes, saveRes] = await Promise.all([
        request(app.getHttpServer())
          .post(`/api/v1/terms/${bundle.termId}/unlock`)
          .set(auth(sunriseAdminToken))
          .send({ classArmId: bundle.classArmId, subjectId: bundle.subjectId, reason: "Racing the save" }),
        saveScore(bundle.termId, bundle.classArmId, bundle.subjectId, ca1Id, student, 9),
      ]);

      expect(unlockRes.status).toBe(200); // unlock never depends on the save's outcome
      expect([200, 409]).toContain(saveRes.status);

      const persisted = await prisma.studentScore.findUnique({
        where: {
          studentId_subjectId_componentId_termId_sessionId: {
            studentId: student, subjectId: bundle.subjectId, componentId: ca1Id, termId: bundle.termId, sessionId: bundle.sessionId,
          },
        },
      });
      if (saveRes.status === 200) {
        expect(Number(persisted?.rawScore)).toBe(9); // the unlock committed first
      } else {
        expect(persisted).toBeNull(); // the save's blocked-read happened first, still correctly rejected
      }
    });
  });
});
