import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { pinClockToDate, seedCreateDaySlot } from "./utils/pin-homework-create-day";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.8.2 step 1 (SPEC_V0.8.2.md §6 item 1) — Homework model + teacher
// create/publish (text only) + due-date-respects-school-days. Reuses the
// SAME JSS 1 A Mathematics/English seeded assignments other v0.8 e2e
// files already reuse (teacher@sunrise.test / teacher2@sunrise.test) —
// confirmed safe: every other file that temporarily touches JSS 1 A's
// ClassSchoolDays row restores it in its own afterAll before this file's
// beforeAll ever runs (Jest runs e2e files sequentially, --runInBand).
describe("Homework (e2e) — SPEC_V0.8.2.md §6 item 1, v0.8.2 step 1", () => {
  let app: INestApplication;
  let prisma: PrismaService;

  let sunriseAdminToken: string;
  let mathTeacherToken: string;
  let englishTeacherToken: string;
  let coverTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let mathTeacherId: string;
  let coverTeacherId: string;
  let mathSubjectId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // All genuine Mondays within the seeded current session (2026-09-01 to
  // 2027-07-31) — chosen well clear of any date another file's holiday
  // fixture might use, and unrelated to Step 3's past/future concern
  // (isSchoolDayForClassOnDate has no "now" comparison at all, purely
  // weekday/holiday validity).
  const VALID_DUE_DATE = "2026-10-05"; // Monday
  const SUNDAY_DUE_DATE = "2026-10-04";
  const SATURDAY_DUE_DATE = "2026-10-03";
  const HOLIDAY_DUE_DATE = "2026-10-12"; // Monday — marked a holiday in beforeAll

  // v0.8.3 step 1 (SPEC_V0.8.3.md §2.4) — createHomework now also validates
  // "does the teacher teach this class TODAY", so every createHomework()
  // call in this whole file (not just the new describe block below) needs
  // "today" pinned to a day mathTeacherId actually teaches jss1AArmId.
  // Deliberately reused as the SAME date as VALID_DUE_DATE — proves today
  // and the due date are independent axes without needing them to differ.
  const TODAY = VALID_DUE_DATE;

  const createdHomeworkIds: string[] = [];
  const createdHolidayIds: string[] = [];
  let teardownClock: () => void;
  let teardownCreateDaySlot: () => Promise<void>;

  function createHomework(token: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post("/api/v1/homework")
      .set(auth(token))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        termId: sunriseTermId,
        title: "Chapter 3 exercises",
        description: "Solve all questions at the end of the chapter.",
        dueDate: VALID_DUE_DATE,
        requiresUpload: false,
        ...overrides,
      });
  }

  async function createAndTrack(token: string, overrides: Partial<Record<string, unknown>> = {}): Promise<string> {
    const response = await createHomework(token, overrides);
    if (response.status !== 201) {
      throw new Error(`homework creation failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    createdHomeworkIds.push(response.body.id);
    return response.body.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    // v0.8.3 step 1 (SPEC_V0.8.3.md §2.4) — pinned BEFORE any login: every
    // token this file mints is issued (and later verified) against the
    // same frozen instant, so none of them expire mid-suite. See
    // pinClockToDate's own doc comment for why the order matters.
    teardownClock = pinClockToDate(TODAY);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    englishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    coverTeacherToken = await loginAs(app, "teacher3@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;
    const term = await prisma.term.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseTermId = term.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    // mathTeacherId is seeded to teach Mathematics here too (seed.ts's
    // jss1And2ArmKeys loop) — IS assigned, so assertTeacherAssignment
    // passes, but no TimetableSlot is seeded for it anywhere: exactly the
    // "assigned but no slot today" case the create-day rule needs to 400.
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;

    mathTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;
    coverTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher3@sunrise.test" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;

    const holiday = await request(app.getHttpServer())
      .post("/api/v1/calendar/holidays")
      .set(auth(sunriseAdminToken))
      .send({ sessionId: sunriseSessionId, name: "E2E-HW-Holiday", startDate: HOLIDAY_DUE_DATE, endDate: HOLIDAY_DUE_DATE });
    if (holiday.status !== 201) {
      throw new Error(`holiday creation failed: ${holiday.status} ${JSON.stringify(holiday.body)}`);
    }
    createdHolidayIds.push(holiday.body.id);

    // The create-day rule's one positive fixture: proves mathTeacherId
    // teaches jss1AArmId on TODAY's weekday.
    teardownCreateDaySlot = await seedCreateDaySlot(prisma, {
      schoolId: sunriseId,
      classArmId: jss1AArmId,
      sessionId: sunriseSessionId,
      subjectId: mathSubjectId,
      teacherUserId: mathTeacherId,
      date: TODAY,
    });
  });

  afterAll(async () => {
    await teardownCreateDaySlot();
    teardownClock();
    if (createdHomeworkIds.length > 0) {
      await prisma.homework.deleteMany({ where: { id: { in: createdHomeworkIds } } });
    }
    if (createdHolidayIds.length > 0) {
      await prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
    }
    // Belt-and-braces — no test in this file sets it true, but restores
    // the default regardless, same convention every sibling file uses.
    await prisma.classSchoolDays.deleteMany({ where: { classArmId: jss1AArmId } });
    await app.close();
  });

  it("teacher creates homework for a subject they teach — DRAFT by default", async () => {
    const response = await createHomework(mathTeacherToken);
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.publishedAt).toBeNull();
    expect(response.body.teacherUserId).toBe(mathTeacherId);
    expect(response.body.dueDate).toBe(VALID_DUE_DATE);
    createdHomeworkIds.push(response.body.id);
  });

  it("403s a teacher creating homework for a subject they don't teach", async () => {
    const response = await createHomework(englishTeacherToken, { subjectId: mathSubjectId });
    expect(response.status).toBe(403);
  });

  it("400s a due date on a Sunday", async () => {
    const response = await createHomework(mathTeacherToken, { dueDate: SUNDAY_DUE_DATE });
    expect(response.status).toBe(400);
  });

  it("400s a due date on a Saturday for a class with Saturday disabled (the default)", async () => {
    const response = await createHomework(mathTeacherToken, { dueDate: SATURDAY_DUE_DATE });
    expect(response.status).toBe(400);
  });

  it("400s a due date on a holiday", async () => {
    const response = await createHomework(mathTeacherToken, { dueDate: HOLIDAY_DUE_DATE });
    expect(response.status).toBe(400);
  });

  it("401s unauthenticated; 403s a role with no path to this controller (STUDENT)", async () => {
    const unauth = await request(app.getHttpServer()).post("/api/v1/homework").send({});
    expect(unauth.status).toBe(401);
  });

  describe("GET /homework", () => {
    it("lists homework in the scope for the assigned teacher and for admin", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const asTeacher = await request(app.getHttpServer())
        .get("/api/v1/homework")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId, termId: sunriseTermId })
        .set(auth(mathTeacherToken));
      expect(asTeacher.status).toBe(200);
      expect(asTeacher.body.homework.some((h: { id: string }) => h.id === homeworkId)).toBe(true);

      const asAdmin = await request(app.getHttpServer())
        .get("/api/v1/homework")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId, termId: sunriseTermId })
        .set(auth(sunriseAdminToken));
      expect(asAdmin.status).toBe(200);
    });

    it("403s a teacher listing a subject they don't teach", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/homework")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId, termId: sunriseTermId })
        .set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });
  });

  describe("publish/unpublish", () => {
    it("publishes DRAFT homework, setting publishedAt; publishing again 409s", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);

      const published = await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));
      expect(published.status).toBe(200);
      expect(published.body.status).toBe("PUBLISHED");
      expect(published.body.publishedAt).not.toBeNull();

      const again = await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));
      expect(again.status).toBe(409);
    });

    it("unpublishes, reverting to DRAFT with publishedAt null; unpublishing again 409s", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));

      const unpublished = await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/unpublish`).set(auth(mathTeacherToken));
      expect(unpublished.status).toBe(200);
      expect(unpublished.body.status).toBe("DRAFT");
      expect(unpublished.body.publishedAt).toBeNull();

      const again = await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/unpublish`).set(auth(mathTeacherToken));
      expect(again.status).toBe(409);
    });

    it("SCHOOL_ADMIN/PROPRIETOR can unpublish regardless of current assignment (safety valve)", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/unpublish`).set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
    });

    it("403s a teacher who doesn't teach this subject trying to publish", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });
  });

  describe("edit", () => {
    it("edits freely while DRAFT", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/homework/${homeworkId}`)
        .set(auth(mathTeacherToken))
        .send({ title: "Updated title" });
      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Updated title");
    });

    it("403s editing once PUBLISHED — must unpublish first", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/homework/${homeworkId}`)
        .set(auth(mathTeacherToken))
        .send({ title: "nope" });
      expect(response.status).toBe(403);
    });

    it("400s editing the due date to a non-school-day", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/homework/${homeworkId}`)
        .set(auth(mathTeacherToken))
        .send({ dueDate: SUNDAY_DUE_DATE });
      expect(response.status).toBe(400);
    });

    it("400s with neither field provided", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer()).patch(`/api/v1/homework/${homeworkId}`).set(auth(mathTeacherToken)).send({});
      expect(response.status).toBe(400);
    });
  });

  describe("delete", () => {
    it("teacher deletes their own DRAFT homework", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer()).delete(`/api/v1/homework/${homeworkId}`).set(auth(mathTeacherToken));
      expect(response.status).toBe(200);

      const row = await prisma.homework.findUnique({ where: { id: homeworkId } });
      expect(row?.deletedAt).not.toBeNull();
    });

    it("409s a teacher deleting their own PUBLISHED homework — must unpublish first", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer()).delete(`/api/v1/homework/${homeworkId}`).set(auth(mathTeacherToken));
      expect(response.status).toBe(409);
    });

    it("SCHOOL_ADMIN/PROPRIETOR can delete regardless of status (safety net)", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer()).delete(`/api/v1/homework/${homeworkId}`).set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
    });
  });

  // DELETE, not PATCH — DELETE's @Roles allows SCHOOL_ADMIN/PROPRIETOR
  // (PATCH is TEACHER-only, so a cross-tenant admin token would 403 at the
  // role guard before ever reaching the tenant check, proving nothing).
  it("404s a Hillcrest admin acting on a Sunrise homework id — tenant scoping, not 403 (hidden, not forbidden)", async () => {
    const homeworkId = await createAndTrack(mathTeacherToken);
    const response = await request(app.getHttpServer()).delete(`/api/v1/homework/${homeworkId}`).set(auth(hillcrestAdminToken));
    expect(response.status).toBe(404);
  });

  // v0.8.2 step 1 — proves authority is the CURRENT assertTeacherAssignment,
  // not the row's own teacherUserId (same design as evaluations): once the
  // subject is reassigned, the NEW teacher inherits full authority over
  // the class's pre-existing homework, and the original author loses it.
  describe("a reassigned teacher inherits authority over pre-existing homework", () => {
    let assignmentId: string;
    let homeworkId: string;

    beforeAll(async () => {
      homeworkId = await createAndTrack(mathTeacherToken);
      const assignment = await prisma.subjectTeacherAssignment.findFirstOrThrow({
        where: { subjectId: mathSubjectId, classArmId: jss1AArmId, sessionId: sunriseSessionId },
      });
      assignmentId = assignment.id;
      await prisma.subjectTeacherAssignment.update({ where: { id: assignmentId }, data: { teacherUserId: coverTeacherId } });
    });

    afterAll(async () => {
      // Restore the seeded assignment — other e2e files rely on
      // teacher@sunrise.test teaching Mathematics at JSS 1 A.
      await prisma.subjectTeacherAssignment.update({ where: { id: assignmentId }, data: { teacherUserId: mathTeacherId } });
    });

    it("the original author can no longer edit; the newly-assigned teacher can", async () => {
      const originalAuthorAttempt = await request(app.getHttpServer())
        .patch(`/api/v1/homework/${homeworkId}`)
        .set(auth(mathTeacherToken))
        .send({ title: "original author, now unassigned" });
      expect(originalAuthorAttempt.status).toBe(403);

      const newTeacherAttempt = await request(app.getHttpServer())
        .patch(`/api/v1/homework/${homeworkId}`)
        .set(auth(coverTeacherToken))
        .send({ title: "edited by the newly-assigned teacher" });
      expect(newTeacherAttempt.status).toBe(200);
      expect(newTeacherAttempt.body.title).toBe("edited by the newly-assigned teacher");
      // teacherUserId still records the ORIGINAL author — authorship
      // history, not the authority gate.
      expect(newTeacherAttempt.body.teacherUserId).toBe(mathTeacherId);
    });
  });

  // v0.8.3 step 1 (SPEC_V0.8.3.md §2.4) — every OTHER createHomework() call
  // in this file already proves the positive path (today = TODAY, which the
  // outer beforeAll's TimetableSlot fixture covers); this block proves the
  // rule's actual edges.
  describe("create-day rule (SPEC_V0.8.3.md §2.4, v0.8.3 step 1)", () => {
    it("creates homework when the teacher teaches this class on today's weekday", async () => {
      const response = await createHomework(mathTeacherToken);
      expect(response.status).toBe(201);
      createdHomeworkIds.push(response.body.id);
    });

    it("the due date is unaffected — any future school day is still accepted regardless of today", async () => {
      const response = await createHomework(mathTeacherToken, { dueDate: "2026-11-02" }); // a later Monday
      expect(response.status).toBe(201);
      createdHomeworkIds.push(response.body.id);
    });

    it("400s when the teacher is assigned the subject but has no TimetableSlot for this class today", async () => {
      const response = await createHomework(mathTeacherToken, { classArmId: jss2AArmId });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("You can only set homework for this class on a day you teach it.");
    });

    describe("today is a holiday for the class", () => {
      let todayHolidayId: string;

      beforeAll(async () => {
        const holiday = await request(app.getHttpServer())
          .post("/api/v1/calendar/holidays")
          .set(auth(sunriseAdminToken))
          .send({ sessionId: sunriseSessionId, name: "E2E-HW-TodayHoliday", startDate: TODAY, endDate: TODAY });
        if (holiday.status !== 201) {
          throw new Error(`holiday creation failed: ${holiday.status} ${JSON.stringify(holiday.body)}`);
        }
        todayHolidayId = holiday.body.id;
      });

      afterAll(async () => {
        await prisma.holiday.deleteMany({ where: { id: todayHolidayId } });
      });

      it("400s — a holiday today means no class happens today, even with a valid slot", async () => {
        const response = await createHomework(mathTeacherToken);
        expect(response.status).toBe(400);
      });
    });
  });

  // v0.8.3 step 1 — confirms updateHomework never calls the new check: the
  // homework was validly created once, so a moving "today" on later edits
  // is irrelevant. Temporarily moves the pinned clock to a weekday with no
  // seeded slot at all to prove it. Re-logs-in right after the shift — the
  // existing mathTeacherToken was minted under TODAY's frozen instant, so
  // jumping the clock away from it would make that already-issued token
  // look expired to the very next request.
  describe("edit isn't subject to the create-day rule", () => {
    it("edits succeed even on a day the teacher doesn't teach this class", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      jest.setSystemTime(new Date("2026-10-06T10:00:00Z")); // Tuesday — no TimetableSlot seeded for it
      try {
        const freshToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
        const response = await request(app.getHttpServer())
          .patch(`/api/v1/homework/${homeworkId}`)
          .set(auth(freshToken))
          .send({ title: "edited on a day with no create-day slot" });
        expect(response.status).toBe(200);
        expect(response.body.title).toBe("edited on a day with no create-day slot");
      } finally {
        jest.setSystemTime(new Date(`${TODAY}T10:00:00Z`));
      }
    });
  });
});
