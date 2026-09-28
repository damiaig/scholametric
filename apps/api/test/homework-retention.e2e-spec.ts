import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./utils/fake-storage.service";

// v0.8.2 step 4 (SPEC_V0.8.2.md §5 Item 10) — the retention sweep, wired
// into SessionsService.activate()'s isCurrent-flip hook. Follows the exact
// same "create a real session B, activate it for real, restore isCurrent
// in afterAll" pattern academic-setup.e2e-spec.ts's own session-activation
// tests already established as safe under Jest's sequential (--runInBand)
// file execution — no other e2e file is affected once this file's own
// afterAll restores the seeded session before it finishes.
describe("Homework retention sweep (e2e) — SPEC_V0.8.2.md §5 Item 10, v0.8.2 step 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: FakeStorageService;

  let mathTeacherToken: string;
  let sunriseAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss1AArmId: string;
  let mathSubjectId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const VALID_DUE_DATE = "2026-11-16"; // Monday, within the seeded current session

  const createdHomeworkIds: string[] = [];
  let otherSessionId: string | null = null;

  async function createHomeworkWithAttachment(title: string): Promise<string> {
    const created = await request(app.getHttpServer())
      .post("/api/v1/homework")
      .set(auth(mathTeacherToken))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        termId: sunriseTermId,
        title,
        description: "For retention e2e coverage.",
        dueDate: VALID_DUE_DATE,
        requiresUpload: false,
      });
    if (created.status !== 201) {
      throw new Error(`homework creation failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    const homeworkId = created.body.id as string;
    createdHomeworkIds.push(homeworkId);

    const issued = await request(app.getHttpServer())
      .post(`/api/v1/homework/${homeworkId}/attachments/upload-url`)
      .set(auth(mathTeacherToken))
      .send({ fileName: "worksheet.pdf", contentType: "application/pdf" });
    storage.seedObject(issued.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
    const attached = await request(app.getHttpServer())
      .post(`/api/v1/homework/${homeworkId}/attachments`)
      .set(auth(mathTeacherToken))
      .send({ storageKey: issued.body.storageKey, fileName: "worksheet.pdf", contentType: "application/pdf" });
    if (attached.status !== 201) {
      throw new Error(`attachment commit failed: ${attached.status} ${JSON.stringify(attached.body)}`);
    }

    return homeworkId;
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
    const term = await prisma.term.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseTermId = term.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;
  });

  afterAll(async () => {
    if (createdHomeworkIds.length > 0) {
      await prisma.homeworkAttachment.deleteMany({ where: { homeworkId: { in: createdHomeworkIds } } });
      await prisma.homeworkSubmission.deleteMany({ where: { homeworkId: { in: createdHomeworkIds } } });
      await prisma.homework.deleteMany({ where: { id: { in: createdHomeworkIds } } });
    }
    // Mirrors academic-setup.e2e-spec.ts's own restore step — the
    // activation below never flips this back on its own.
    await prisma.academicSession.update({ where: { id: sunriseSessionId }, data: { isCurrent: true } });
    if (otherSessionId) {
      await prisma.academicSession.delete({ where: { id: otherSessionId } });
    }
    await app.close();
  });

  it("purges a past session's homework files (storage objects + DB rows) on activation, keeping Homework/Completion records intact — including a soft-deleted homework's files", async () => {
    const keptHomeworkId = await createHomeworkWithAttachment("Retention: still-active homework");
    const deletedHomeworkId = await createHomeworkWithAttachment("Retention: soft-deleted homework");

    const deleteResponse = await request(app.getHttpServer()).delete(`/api/v1/homework/${deletedHomeworkId}`).set(auth(mathTeacherToken));
    expect(deleteResponse.status).toBe(200);

    const [keptAttachmentBefore] = await prisma.homeworkAttachment.findMany({ where: { homeworkId: keptHomeworkId } });
    const [deletedAttachmentBefore] = await prisma.homeworkAttachment.findMany({ where: { homeworkId: deletedHomeworkId } });
    expect(await storage.getObjectMetadata(keptAttachmentBefore.storageKey)).not.toBeNull();
    expect(await storage.getObjectMetadata(deletedAttachmentBefore.storageKey)).not.toBeNull();

    const suffix = randomUUID().slice(0, 8);
    const sessionName = `Retention Sweep Session ${suffix}`;
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
    expect(await prisma.homeworkAttachment.findMany({ where: { homeworkId: { in: [keptHomeworkId, deletedHomeworkId] } } })).toHaveLength(0);

    const keptHomework = await prisma.homework.findUniqueOrThrow({ where: { id: keptHomeworkId } });
    expect(keptHomework.deletedAt).toBeNull();
    const deletedHomework = await prisma.homework.findUniqueOrThrow({ where: { id: deletedHomeworkId } });
    expect(deletedHomework.deletedAt).not.toBeNull();
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

    // NOW create fresh files under the session that is ALREADY current,
    // then activate that SAME session again — previous.id === id, so
    // SessionsService.activate() never calls purgeSessionFiles at all.
    const homeworkId = await createHomeworkWithAttachment("Retention: reactivation no-op");
    const [attachment] = await prisma.homeworkAttachment.findMany({ where: { homeworkId } });

    const reactivate = await request(app.getHttpServer())
      .post(`/api/v1/sessions/${sunriseSessionId}/activate`)
      .set(auth(sunriseAdminToken))
      .send({ confirmName: sunriseSession.name });
    expect(reactivate.status).toBe(200);

    expect(await storage.getObjectMetadata(attachment.storageKey)).not.toBeNull();
    expect(await prisma.homeworkAttachment.findFirst({ where: { id: attachment.id } })).not.toBeNull();
  });
});
