import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { futureMonday, futureWeekday } from "./utils/future-date";
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
  let hillcrestTeacherToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss1AArmId: string;
  let mathTeacherId: string;
  let coverTeacherId: string;
  let mathSubjectId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // v0.8.3 Item 4 rework (SPEC_V0.8.3_item4_rework.md) — all genuinely
  // future relative to whenever the suite runs; no clock-pin needed
  // anymore, since the rule validates this explicit dueDate, never "now".
  // VALID_DUE_DATE is a teaching weekday (Monday) per the seeded fixture
  // below; NON_TEACHING_DUE_DATE (Wednesday) deliberately is NOT one —
  // Bola's seeded slots for JSS 1 A are Mon/Tue/Thu/Fri. HOLIDAY_DUE_DATE
  // is a LATER, separate Monday (still a teaching weekday) so the
  // holiday-on-a-teaching-day case is meaningful, not redundant with
  // VALID_DUE_DATE.
  const VALID_DUE_DATE = futureMonday(4);
  const SUNDAY_DUE_DATE = futureWeekday(0, 4);
  const SATURDAY_DUE_DATE = futureWeekday(6, 4);
  const NON_TEACHING_DUE_DATE = futureWeekday(3, 4); // Wednesday
  const HOLIDAY_DUE_DATE = futureMonday(8); // marked a holiday in beforeAll

  const createdHomeworkIds: string[] = [];
  const createdHolidayIds: string[] = [];

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

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    englishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    coverTeacherToken = await loginAs(app, "teacher3@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");
    hillcrestTeacherToken = await loginAs(app, "teacher@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;
    const term = await prisma.term.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseTermId = term.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;

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
    // No local TimetableSlot fixture needed — seed.ts itself seeds
    // mathTeacherId teaching jss1AArmId Mathematics on Mon/Tue/Thu/Fri
    // (v0.8.3 Item 4 rework); VALID_DUE_DATE is always a Monday and the
    // "edit to a different teaching weekday" test below uses Tuesday —
    // both already covered.
  });

  afterAll(async () => {
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

  // v0.8.3 Item 4 rework (SPEC_V0.8.3_item4_rework.md §2.3) — the due-date
  // picker's data source. TEACHER-only, matching createHomework's own
  // @Roles restriction.
  describe("GET /homework/teaching-weekdays", () => {
    it("returns the distinct weekdays this teacher teaches this class, this session", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/homework/teaching-weekdays")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
        .set(auth(mathTeacherToken));
      expect(response.status).toBe(200);
      expect([...response.body.weekdays].sort()).toEqual(["FRIDAY", "MONDAY", "THURSDAY", "TUESDAY"]);
    });

    it("403s a teacher not assigned this subject for this class", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/homework/teaching-weekdays")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
        .set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });

    it("403s a cross-tenant teacher (their own current session resolves no assignment for a foreign classArmId)", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/homework/teaching-weekdays")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
        .set(auth(hillcrestTeacherToken));
      expect(response.status).toBe(403);
    });

    it("403s a role with no path to this controller (SCHOOL_ADMIN) — TEACHER-only, same as createHomework", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/homework/teaching-weekdays")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
        .set(auth(sunriseAdminToken));
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

  // v0.8.3 Item 4 rework (SPEC_V0.8.3_item4_rework.md) — replaces the
  // retired create-day rule. The DUE DATE must now be both a school day
  // AND a weekday this teacher teaches this class.
  describe("due date must be a school day the teacher teaches (SPEC_V0.8.3_item4_rework.md)", () => {
    it("creates homework when the due date falls on a teaching weekday", async () => {
      const response = await createHomework(mathTeacherToken);
      expect(response.status).toBe(201);
      createdHomeworkIds.push(response.body.id);
    });

    it("400s when the due date falls on a weekday the teacher doesn't teach this class", async () => {
      const response = await createHomework(mathTeacherToken, { dueDate: NON_TEACHING_DUE_DATE });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("The due date must be a school day you teach this class.");
    });

    describe("a teaching weekday that's also a holiday", () => {
      let teachingDayHolidayId: string;

      beforeAll(async () => {
        const holiday = await request(app.getHttpServer())
          .post("/api/v1/calendar/holidays")
          .set(auth(sunriseAdminToken))
          .send({ sessionId: sunriseSessionId, name: "E2E-HW-TeachingDayHoliday", startDate: HOLIDAY_DUE_DATE, endDate: HOLIDAY_DUE_DATE });
        if (holiday.status !== 201) {
          throw new Error(`holiday creation failed: ${holiday.status} ${JSON.stringify(holiday.body)}`);
        }
        teachingDayHolidayId = holiday.body.id;
      });

      afterAll(async () => {
        await prisma.holiday.deleteMany({ where: { id: teachingDayHolidayId } });
      });

      it("400s — a holiday wins even on a day the teacher otherwise teaches this class", async () => {
        const response = await createHomework(mathTeacherToken, { dueDate: HOLIDAY_DUE_DATE });
        expect(response.status).toBe(400);
      });
    });
  });

  // v0.8.3 Item 4 rework — unlike the retired create-day rule, editing the
  // due date DOES re-fire this check (it rides the existing
  // dueDate-changed gate updateHomework already has for the school-day
  // check). No clock-shifting needed — NON_TEACHING_DUE_DATE is just an
  // ordinary (always-non-teaching) date, no fake "now" involved.
  describe("editing the due date is subject to the same teaching-day rule", () => {
    it("400s editing the due date to a non-teaching weekday", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/homework/${homeworkId}`)
        .set(auth(mathTeacherToken))
        .send({ dueDate: NON_TEACHING_DUE_DATE });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("The due date must be a school day you teach this class.");
    });

    it("200s editing the due date to a different teaching weekday", async () => {
      const homeworkId = await createAndTrack(mathTeacherToken);
      const newDueDate = futureWeekday(2, 4); // Tuesday — Bola teaches JSS 1 A Mathematics on Tuesday too
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/homework/${homeworkId}`)
        .set(auth(mathTeacherToken))
        .send({ dueDate: newDueDate });
      expect(response.status).toBe(200);
      expect(response.body.dueDate).toBe(newDueDate);
    });
  });
});
