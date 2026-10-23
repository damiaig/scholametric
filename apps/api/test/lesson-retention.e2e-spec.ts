import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { pastWeekday } from "./utils/future-date";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./utils/fake-storage.service";

// v0.8.4 step 3 (SPEC_V0.8.4.md §5) — the retention sweep, wired into the
// SAME SessionsService.activate() isCurrent-flip hook homework's own
// sweep already uses (one hook extended, not a sibling sweep). Follows
// the exact same "create a real session B, activate it for real, restore
// isCurrent in afterAll" pattern homework-retention.e2e-spec.ts already
// established. STRONGER than homework: a lesson is purged WHOLE (the
// Lesson row itself, not just its files) — no grade value to preserve,
// unlike homework, which keeps its own record.
describe("Lesson retention sweep (e2e) — SPEC_V0.8.4.md §5, v0.8.4 step 3", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: FakeStorageService;

  let mathTeacherToken: string;
  let sunriseAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let jss1AArmId: string;
  let mathSubjectId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const VALID_LESSON_DATE = pastWeekday(1, 9);

  const createdLessonIds: string[] = [];
  let otherSessionId: string | null = null;

  async function createLessonWithAttachment(title: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post("/api/v1/lessons")
      .set(auth(mathTeacherToken))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        title,
        body: "For retention e2e coverage.",
        lessonDate: VALID_LESSON_DATE,
      });
    if (created.status !== 201) {
      throw new Error(`lesson creation failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    const lessonId = created.body.id as string;
    createdLessonIds.push(lessonId);

    const issued = await request(app.getHttpServer())
      .post(`/api/v1/lessons/${lessonId}/attachments/upload-url`)
      .set(auth(mathTeacherToken))
      .send({ fileName: "notes.pdf", contentType: "application/pdf" });
    storage.seedObject(issued.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
    const attached = await request(app.getHttpServer())
      .post(`/api/v1/lessons/${lessonId}/attachments`)
      .set(auth(mathTeacherToken))
      .send({ storageKey: issued.body.storageKey, fileName: "notes.pdf", contentType: "application/pdf" });
    if (attached.status !== 201) {
      throw new Error(`attachment commit failed: ${attached.status} ${JSON.stringify(attached.body)}`);
    }

    return lessonId;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService) as FakeStorageService;

    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;
    // No local TimetableSlot fixture needed — seed.ts itself seeds
    // teacher@sunrise.test teaching jss1AArmId Mathematics on Mon/Tue/Thu/Fri
    // (v0.8.3 Item 4 rework), scoped to sunriseSessionId. Both
    // createLessonWithAttachment calls in this file happen while
    // sunriseSessionId is current (the second test explicitly restores it
    // first), so the seeded slot is in scope throughout.
  });

  afterAll(async () => {
    if (createdLessonIds.length > 0) {
      await prisma.lessonAttachment.deleteMany({ where: { lessonId: { in: createdLessonIds } } });
      await prisma.lesson.deleteMany({ where: { id: { in: createdLessonIds } } });
    }
    // Mirrors homework-retention.e2e-spec.ts's own restore step — the
    // activation below never flips this back on its own.
    await prisma.academicSession.update({ where: { id: sunriseSessionId }, data: { isCurrent: true } });
    if (otherSessionId) {
      await prisma.academicSession.delete({ where: { id: otherSessionId } });
    }
    await app.close();
  });

  it("purges a past session's lessons WHOLE (rows + storage objects) on activation — including a soft-deleted lesson", async () => {
    const keptLessonId = await createLessonWithAttachment("Retention: still-active lesson");
    const deletedLessonId = await createLessonWithAttachment("Retention: soft-deleted lesson");

    const deleteResponse = await request(app.getHttpServer()).delete(`/api/v1/lessons/${deletedLessonId}`).set(auth(mathTeacherToken));
    expect(deleteResponse.status).toBe(200);

    const [keptAttachmentBefore] = await prisma.lessonAttachment.findMany({ where: { lessonId: keptLessonId } });
    const [deletedAttachmentBefore] = await prisma.lessonAttachment.findMany({ where: { lessonId: deletedLessonId } });
    expect(await storage.getObjectMetadata(keptAttachmentBefore.storageKey)).not.toBeNull();
    expect(await storage.getObjectMetadata(deletedAttachmentBefore.storageKey)).not.toBeNull();

    const suffix = randomUUID().slice(0, 8);
    const sessionName = `Lesson Retention Sweep Session ${suffix}`;
    const createSession = await request(app.getHttpServer())
      .post("/api/v1/sessions")
      .set(auth(sunriseAdminToken))
      .send({ name: sessionName, startsOn: "2028-09-01", endsOn: "2029-07-31" });
    expect(createSession.status).toBe(201);
    otherSessionId = createSession.body.id;

    const activate = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${otherSessionId}/activate`)
      .set(auth(sunriseAdminToken))
      .send({ confirmName: sessionName });
    expect(activate.status).toBe(200);

    // The sweep runs synchronously inside activate() before it responds —
    // by the time this response lands, it has already completed.
    expect(await storage.getObjectMetadata(keptAttachmentBefore.storageKey)).toBeNull();
    expect(await storage.getObjectMetadata(deletedAttachmentBefore.storageKey)).toBeNull();
    expect(await prisma.lessonAttachment.findMany({ where: { lessonId: { in: [keptLessonId, deletedLessonId] } } })).toHaveLength(0);

    // STRONGER than homework: the Lesson ROW itself is gone too, for
    // BOTH the still-active one and the already-soft-deleted one — no
    // deletedAt-is-now-set check, an outright absent row.
    expect(await prisma.lesson.findUnique({ where: { id: keptLessonId } })).toBeNull();
    expect(await prisma.lesson.findUnique({ where: { id: deletedLessonId } })).toBeNull();
  });

  it("activating the already-current session sweeps nothing (target id === previous id, guard skips the sweep entirely)", async () => {
    // Restore sunriseSessionId to current first (undoing test 1's own
    // activation) — this restore call's OWN `previous` is the empty temp
    // session, so it sweeps nothing interesting on its own.
    const sunriseSession = await prisma.academicSession.findUniqueOrThrow({ where: { id: sunriseSessionId } });
    const restore = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sunriseSessionId}/activate`)
      .set(auth(sunriseAdminToken))
      .send({ confirmName: sunriseSession.name });
    expect(restore.status).toBe(200);

    // NOW create a fresh lesson under the session that is ALREADY
    // current, then activate that SAME session again — previous.id ===
    // id, so SessionsService.activate() never calls purgeSessionLessons
    // at all.
    const lessonId = await createLessonWithAttachment("Retention: reactivation no-op");
    const [attachment] = await prisma.lessonAttachment.findMany({ where: { lessonId } });

    const reactivate = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sunriseSessionId}/activate`)
      .set(auth(sunriseAdminToken))
      .send({ confirmName: sunriseSession.name });
    expect(reactivate.status).toBe(200);

    expect(await storage.getObjectMetadata(attachment.storageKey)).not.toBeNull();
    expect(await prisma.lessonAttachment.findFirst({ where: { id: attachment.id } })).not.toBeNull();
    expect(await prisma.lesson.findUnique({ where: { id: lessonId } })).not.toBeNull();
  });
});
