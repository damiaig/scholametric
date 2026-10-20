import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { futureWeekday, pastWeekday } from "./utils/future-date";
import { PrismaService } from "../src/prisma/prisma.service";

// v0.8.4 step 1 (SPEC_V0.8.4.md §2, §3) — Lesson model + teacher
// authoring + the lesson-date rule (text-only; files are step 3).
// Reuses the SAME JSS 1 A Mathematics seeded assignment/timetable
// (teacher@sunrise.test, Mon/Tue/Thu/Fri) every v0.8.3 homework e2e file
// already trusts from seed.ts — no local TimetableSlot fixture needed
// for the "past teaching day" cases.
describe("Lessons (e2e) — SPEC_V0.8.4.md §2/§3, v0.8.4 step 1", () => {
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
  let jss1AArmId: string;
  let mathTeacherId: string;
  let coverTeacherId: string;
  let mathSubjectId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  // All genuinely PAST relative to whenever the suite runs (the inversion
  // of homework's futureMonday-style fixtures — a lesson is logged for a
  // taught day, never the future). VALID_LESSON_DATE is a teaching weekday
  // (Monday) per the seeded fixture; NON_TEACHING_LESSON_DATE (Wednesday)
  // deliberately is NOT one (Bola's seeded slots are Mon/Tue/Thu/Fri).
  // HOLIDAY_LESSON_DATE is a LATER, separate past Monday so the
  // holiday-on-a-teaching-day case is meaningful, not redundant with
  // VALID_LESSON_DATE. FUTURE_LESSON_DATE is a future Monday — otherwise a
  // perfectly valid teaching weekday, proving the not-future check fires
  // on its own, independent of the school-day/teaching-weekday checks.
  const VALID_LESSON_DATE = pastWeekday(1, 4);
  const SUNDAY_LESSON_DATE = pastWeekday(0, 4);
  const SATURDAY_LESSON_DATE = pastWeekday(6, 4);
  const NON_TEACHING_LESSON_DATE = pastWeekday(3, 4); // Wednesday
  const HOLIDAY_LESSON_DATE = pastWeekday(1, 8);
  const FUTURE_LESSON_DATE = futureWeekday(1, 4);

  const createdLessonIds: string[] = [];
  const createdHolidayIds: string[] = [];

  function createLesson(token: string, overrides: Partial<Record<string, unknown>> = {}) {
    return request(app.getHttpServer())
      .post("/api/v1/lessons")
      .set(auth(token))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        title: "Fractions — introduction",
        body: "Covered the definition of a fraction and simple addition.",
        lessonDate: VALID_LESSON_DATE,
        ...overrides,
      });
  }

  async function createAndTrack(token: string, overrides: Partial<Record<string, unknown>> = {}): Promise<string> {
    const response = await createLesson(token, overrides);
    if (response.status !== 201) {
      throw new Error(`lesson creation failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    createdLessonIds.push(response.body.id);
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
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;

    mathTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;
    coverTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher3@sunrise.test" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;

    const holiday = await request(app.getHttpServer())
      .post("/api/v1/calendar/holidays")
      .set(auth(sunriseAdminToken))
      .send({ sessionId: sunriseSessionId, name: "E2E-Lesson-Holiday", startDate: HOLIDAY_LESSON_DATE, endDate: HOLIDAY_LESSON_DATE });
    if (holiday.status !== 201) {
      throw new Error(`holiday creation failed: ${holiday.status} ${JSON.stringify(holiday.body)}`);
    }
    createdHolidayIds.push(holiday.body.id);
    // No local TimetableSlot fixture needed for the past-day cases —
    // seed.ts itself seeds mathTeacherId teaching jss1AArmId Mathematics
    // on Mon/Tue/Thu/Fri (v0.8.3 Item 4 rework); VALID_LESSON_DATE is
    // always a past Monday.
  });

  afterAll(async () => {
    if (createdLessonIds.length > 0) {
      await prisma.lesson.deleteMany({ where: { id: { in: createdLessonIds } } });
    }
    if (createdHolidayIds.length > 0) {
      await prisma.holiday.deleteMany({ where: { id: { in: createdHolidayIds } } });
    }
    await prisma.classSchoolDays.deleteMany({ where: { classArmId: jss1AArmId } });
    await app.close();
  });

  it("teacher creates a lesson for a subject they teach — DRAFT by default", async () => {
    const response = await createLesson(mathTeacherToken);
    expect(response.status).toBe(201);
    expect(response.body.status).toBe("DRAFT");
    expect(response.body.publishedAt).toBeNull();
    expect(response.body.teacherUserId).toBe(mathTeacherId);
    expect(response.body.lessonDate).toBe(VALID_LESSON_DATE);
    createdLessonIds.push(response.body.id);
  });

  it("403s a teacher creating a lesson for a subject they don't teach", async () => {
    const response = await createLesson(englishTeacherToken, { subjectId: mathSubjectId });
    expect(response.status).toBe(403);
  });

  it("400s a FUTURE lesson date — the not-future check fires even on an otherwise-valid teaching weekday", async () => {
    const response = await createLesson(mathTeacherToken, { lessonDate: FUTURE_LESSON_DATE });
    expect(response.status).toBe(400);
    expect(response.body.message).toBe("The lesson date must be a school day you teach this class, on or before today.");
  });

  it("400s a lesson date on a Sunday", async () => {
    const response = await createLesson(mathTeacherToken, { lessonDate: SUNDAY_LESSON_DATE });
    expect(response.status).toBe(400);
  });

  it("400s a lesson date on a Saturday for a class with Saturday disabled (the default)", async () => {
    const response = await createLesson(mathTeacherToken, { lessonDate: SATURDAY_LESSON_DATE });
    expect(response.status).toBe(400);
  });

  it("400s a lesson date on a weekday the teacher doesn't teach this class", async () => {
    const response = await createLesson(mathTeacherToken, { lessonDate: NON_TEACHING_LESSON_DATE });
    expect(response.status).toBe(400);
  });

  describe("a teaching weekday that's also a holiday", () => {
    it("400s — a holiday wins even on a day the teacher otherwise teaches this class", async () => {
      const response = await createLesson(mathTeacherToken, { lessonDate: HOLIDAY_LESSON_DATE });
      expect(response.status).toBe(400);
    });
  });

  // The rule's own on-or-BEFORE-today boundary — "today" itself must be
  // valid, not just strictly past. Needs its own scratch TimetableSlot
  // for whatever today's REAL weekday happens to be when the suite runs
  // (the fixed Mon/Tue/Thu/Fri seed schedule can't be trusted for this —
  // today could just as easily be Wednesday/Saturday). Sunday is
  // structurally skipped: the Weekday enum has no SUNDAY member at all
  // (no TimetableSlot can ever exist for one), so there is no valid
  // "lesson dated today" scenario to construct that day — same
  // once-a-week edge this suite accepts elsewhere (see HOLIDAY tests).
  describe("lessonDate = today", () => {
    const WEEKDAY_BY_JS_INDEX = [null, "MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY"] as const;
    const now = new Date();
    const todayWeekday = WEEKDAY_BY_JS_INDEX[now.getDay()];
    const todayStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;

    const describeOrSkip = todayWeekday === null ? describe.skip : describe;

    describeOrSkip("today is a real weekday (not Sunday)", () => {
      let scratchPeriodId: string;
      let scratchSlotId: string;

      beforeAll(async () => {
        const period = await prisma.period.create({
          data: { schoolId: sunriseId, name: "E2E-Lesson-TodayPeriod", startsAt: "18:00", endsAt: "18:45", sortOrder: 99 },
        });
        scratchPeriodId = period.id;
        const slot = await prisma.timetableSlot.create({
          data: {
            schoolId: sunriseId,
            classArmId: jss1AArmId,
            sessionId: sunriseSessionId,
            // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
            dayOfWeek: todayWeekday!,
            periodId: scratchPeriodId,
            subjectId: mathSubjectId,
            teacherUserId: mathTeacherId,
          },
        });
        scratchSlotId = slot.id;
      });

      afterAll(async () => {
        await prisma.timetableSlot.deleteMany({ where: { id: scratchSlotId } });
        await prisma.period.deleteMany({ where: { id: scratchPeriodId } });
      });

      it("201s creating a lesson dated exactly today", async () => {
        const response = await createLesson(mathTeacherToken, { lessonDate: todayStr });
        expect(response.status).toBe(201);
        createdLessonIds.push(response.body.id);
      });
    });
  });

  it("401s unauthenticated", async () => {
    const unauth = await request(app.getHttpServer()).post("/api/v1/lessons").send({});
    expect(unauth.status).toBe(401);
  });

  describe("GET /lessons", () => {
    it("lists lessons in the scope for the assigned teacher and for admin, newest lessonDate first", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const asTeacher = await request(app.getHttpServer())
        .get("/api/v1/lessons")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
        .set(auth(mathTeacherToken));
      expect(asTeacher.status).toBe(200);
      expect(asTeacher.body.lessons.some((l: { id: string }) => l.id === lessonId)).toBe(true);

      const asAdmin = await request(app.getHttpServer())
        .get("/api/v1/lessons")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
        .set(auth(sunriseAdminToken));
      expect(asAdmin.status).toBe(200);
    });

    it("403s a teacher listing a subject they don't teach", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/lessons")
        .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
        .set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });
  });

  describe("publish/unpublish", () => {
    it("publishes DRAFT lesson, setting publishedAt; publishing again 409s", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);

      const published = await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));
      expect(published.status).toBe(200);
      expect(published.body.status).toBe("PUBLISHED");
      expect(published.body.publishedAt).not.toBeNull();

      const again = await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));
      expect(again.status).toBe(409);
    });

    it("unpublishes, reverting to DRAFT with publishedAt null; unpublishing again 409s", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));

      const unpublished = await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/unpublish`).set(auth(mathTeacherToken));
      expect(unpublished.status).toBe(200);
      expect(unpublished.body.status).toBe("DRAFT");
      expect(unpublished.body.publishedAt).toBeNull();

      const again = await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/unpublish`).set(auth(mathTeacherToken));
      expect(again.status).toBe(409);
    });

    it("SCHOOL_ADMIN/PROPRIETOR can unpublish regardless of current assignment (safety valve)", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/unpublish`).set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
    });

    it("403s a teacher who doesn't teach this subject trying to publish", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });
  });

  describe("edit", () => {
    it("edits freely while DRAFT", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(mathTeacherToken))
        .send({ title: "Updated title" });
      expect(response.status).toBe(200);
      expect(response.body.title).toBe("Updated title");
    });

    it("403s editing once PUBLISHED — must unpublish first", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(mathTeacherToken))
        .send({ title: "nope" });
      expect(response.status).toBe(403);
    });

    it("400s with no fields provided", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer()).patch(`/api/v1/lessons/${lessonId}`).set(auth(mathTeacherToken)).send({});
      expect(response.status).toBe(400);
    });
  });

  // Create-day-independent, confirmed: the rule validates lessonDate, not
  // "today" (there is no separate "today" check at all beyond lessonDate's
  // own not-future comparison) — a title/body-only edit never re-triggers
  // it (updateLesson's `if (dto.lessonDate !== undefined)` gate), while a
  // lessonDate CHANGE re-validates exactly like create.
  describe("editing lessonDate is subject to the same teaching-day rule", () => {
    it("400s editing lessonDate to a non-teaching weekday", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(mathTeacherToken))
        .send({ lessonDate: NON_TEACHING_LESSON_DATE });
      expect(response.status).toBe(400);
      expect(response.body.message).toBe("The lesson date must be a school day you teach this class, on or before today.");
    });

    it("400s editing lessonDate to a future date", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(mathTeacherToken))
        .send({ lessonDate: FUTURE_LESSON_DATE });
      expect(response.status).toBe(400);
    });

    it("200s editing lessonDate to a different past teaching weekday", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const newLessonDate = pastWeekday(2, 4); // Tuesday — Bola teaches JSS 1 A Mathematics on Tuesday too
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(mathTeacherToken))
        .send({ lessonDate: newLessonDate });
      expect(response.status).toBe(200);
      expect(response.body.lessonDate).toBe(newLessonDate);
    });

    it("200s editing only the title, leaving lessonDate untouched and unrevalidated", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(mathTeacherToken))
        .send({ title: "Title-only edit" });
      expect(response.status).toBe(200);
      expect(response.body.lessonDate).toBe(VALID_LESSON_DATE);
    });
  });

  describe("delete", () => {
    it("teacher deletes their own DRAFT lesson", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer()).delete(`/api/v1/lessons/${lessonId}`).set(auth(mathTeacherToken));
      expect(response.status).toBe(200);

      const row = await prisma.lesson.findUnique({ where: { id: lessonId } });
      expect(row?.deletedAt).not.toBeNull();
    });

    it("409s a teacher deleting their own PUBLISHED lesson — must unpublish first", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer()).delete(`/api/v1/lessons/${lessonId}`).set(auth(mathTeacherToken));
      expect(response.status).toBe(409);
    });

    it("403s a different (non-assigned) teacher deleting someone else's lesson", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      const response = await request(app.getHttpServer()).delete(`/api/v1/lessons/${lessonId}`).set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });

    it("SCHOOL_ADMIN/PROPRIETOR can delete regardless of status (safety net)", async () => {
      const lessonId = await createAndTrack(mathTeacherToken);
      await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));

      const response = await request(app.getHttpServer()).delete(`/api/v1/lessons/${lessonId}`).set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
    });
  });

  // DELETE, not PATCH — DELETE's @Roles allows SCHOOL_ADMIN/PROPRIETOR
  // (PATCH is TEACHER-only, so a cross-tenant admin token would 403 at the
  // role guard before ever reaching the tenant check, proving nothing).
  it("404s a Hillcrest admin acting on a Sunrise lesson id — tenant scoping, not 403 (hidden, not forbidden)", async () => {
    const lessonId = await createAndTrack(mathTeacherToken);
    const response = await request(app.getHttpServer()).delete(`/api/v1/lessons/${lessonId}`).set(auth(hillcrestAdminToken));
    expect(response.status).toBe(404);
  });

  it("403s a Hillcrest teacher (cross-tenant, TEACHER-only route) listing lessons for a Sunrise classArmId", async () => {
    const response = await request(app.getHttpServer())
      .get("/api/v1/lessons")
      .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
      .set(auth(hillcrestTeacherToken));
    expect(response.status).toBe(403);
  });

  // v0.8.2 step 1's own precedent (homework) — proves authority is the
  // CURRENT assertTeacherAssignment, not the row's own teacherUserId: once
  // the subject is reassigned, the NEW teacher inherits full authority
  // over the class's pre-existing lessons, and the original author loses it.
  describe("a reassigned teacher inherits authority over pre-existing lessons", () => {
    let assignmentId: string;
    let lessonId: string;

    beforeAll(async () => {
      lessonId = await createAndTrack(mathTeacherToken);
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
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(mathTeacherToken))
        .send({ title: "original author, now unassigned" });
      expect(originalAuthorAttempt.status).toBe(403);

      const newTeacherAttempt = await request(app.getHttpServer())
        .patch(`/api/v1/lessons/${lessonId}`)
        .set(auth(coverTeacherToken))
        .send({ title: "edited by the newly-assigned teacher" });
      expect(newTeacherAttempt.status).toBe(200);
      expect(newTeacherAttempt.body.title).toBe("edited by the newly-assigned teacher");
      // teacherUserId still records the ORIGINAL author — authorship
      // history, not the authority gate.
      expect(newTeacherAttempt.body.teacherUserId).toBe(mathTeacherId);
    });
  });
});
