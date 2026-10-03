import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { randomUUID } from "node:crypto";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { pinClockToDate, seedCreateDaySlot } from "./utils/pin-homework-create-day";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./utils/fake-storage.service";

// v0.8.2 step 4 (SPEC_V0.8.2.md §6 item 4) — teacher attach flow. Reuses
// the same JSS 1 A Mathematics assignment (teacher@sunrise.test) Steps 1-2
// already rely on. No real Firebase call anywhere in this file — every
// "upload" is simulated via the FakeStorageService's seedObject(), since a
// fake can't receive a real signed-URL PUT.
describe("Homework attachments (e2e) — SPEC_V0.8.2.md §6 item 4, v0.8.2 step 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: FakeStorageService;

  let mathTeacherToken: string;
  let englishTeacherToken: string;
  let hillcrestTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss1AArmId: string;
  let mathSubjectId: string;
  let mathTeacherId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const VALID_DUE_DATE = "2026-10-05"; // Monday, within the seeded current session

  const createdHomeworkIds: string[] = [];
  let teardownClock: () => void;
  let teardownCreateDaySlot: () => Promise<void>;

  async function createHomework(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/homework")
      .set(auth(mathTeacherToken))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        termId: sunriseTermId,
        title: "Attachment host homework",
        description: "For attachment e2e coverage.",
        dueDate: VALID_DUE_DATE,
        requiresUpload: false,
      });
    if (response.status !== 201) {
      throw new Error(`homework creation failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    createdHomeworkIds.push(response.body.id);
    return response.body.id as string;
  }

  function issueUploadUrl(token: string, homeworkId: string, fileName = "worksheet.pdf") {
    return request(app.getHttpServer())
      .post(`/api/v1/homework/${homeworkId}/attachments/upload-url`)
      .set(auth(token))
      .send({ fileName, contentType: "application/pdf" });
  }

  function commit(token: string, homeworkId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/attachments`).set(auth(token)).send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService) as FakeStorageService;

    // v0.8.3 step 1 (SPEC_V0.8.3.md §2.4) — pinned BEFORE any login: every
    // token this file mints is issued (and later verified) against the
    // same frozen instant, so none of them expire mid-suite.
    teardownClock = pinClockToDate(VALID_DUE_DATE);

    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    englishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    hillcrestTeacherToken = await loginAs(app, "teacher@hillcrest.test", "hillcrest");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseSessionId = session.id;
    const term = await prisma.term.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    sunriseTermId = term.id;
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;
    mathTeacherId = (await prisma.user.findFirstOrThrow({ where: { schoolId: sunriseId, email: "teacher@sunrise.test" } })).id;

    // The create-day rule's one positive fixture: proves mathTeacherId
    // teaches jss1AArmId on VALID_DUE_DATE's weekday.
    teardownCreateDaySlot = await seedCreateDaySlot(prisma, {
      schoolId: sunriseId,
      classArmId: jss1AArmId,
      sessionId: sunriseSessionId,
      subjectId: mathSubjectId,
      teacherUserId: mathTeacherId,
      date: VALID_DUE_DATE,
    });
  });

  afterAll(async () => {
    await teardownCreateDaySlot();
    teardownClock();
    if (createdHomeworkIds.length > 0) {
      await prisma.homeworkAttachment.deleteMany({ where: { homeworkId: { in: createdHomeworkIds } } });
      await prisma.homework.deleteMany({ where: { id: { in: createdHomeworkIds } } });
    }
    await app.close();
  });

  it("issues an upload URL scoped to a caller-unguessable storage key under this homework's attachment prefix", async () => {
    const homeworkId = await createHomework();
    const response = await issueUploadUrl(mathTeacherToken, homeworkId);
    expect(response.status).toBe(200);
    expect(response.body.storageKey.startsWith(`schools/${sunriseId}/homework/${homeworkId}/attachments/`)).toBe(true);
    expect(response.body.maxSizeBytes).toBe(20 * 1024 * 1024);
  });

  it("commits an attachment using the storage layer's VERIFIED actual size, not a client-declared one", async () => {
    const homeworkId = await createHomework();
    const issued = await issueUploadUrl(mathTeacherToken, homeworkId);
    expect(issued.status).toBe(200);

    storage.seedObject(issued.body.storageKey, { sizeBytes: 3 * 1024 * 1024, contentType: "application/pdf" });

    const committed = await commit(mathTeacherToken, homeworkId, {
      storageKey: issued.body.storageKey,
      fileName: "worksheet.pdf",
      contentType: "application/pdf",
    });
    expect(committed.status).toBe(201);
    expect(committed.body.sizeBytes).toBe(3 * 1024 * 1024);

    const list = await request(app.getHttpServer())
      .get("/api/v1/homework")
      .query({ classArmId: jss1AArmId, subjectId: mathSubjectId, termId: sunriseTermId })
      .set(auth(mathTeacherToken));
    const row = list.body.homework.find((h: { id: string }) => h.id === homeworkId);
    expect(row.attachments).toHaveLength(1);
    expect(row.attachments[0].sizeBytes).toBe(3 * 1024 * 1024);
  });

  it("400s a commit against a storage key nothing was ever uploaded to", async () => {
    const homeworkId = await createHomework();
    const issued = await issueUploadUrl(mathTeacherToken, homeworkId);

    const response = await commit(mathTeacherToken, homeworkId, {
      storageKey: issued.body.storageKey,
      fileName: "worksheet.pdf",
      contentType: "application/pdf",
    });
    expect(response.status).toBe(400);
  });

  // The tenant-isolation proof: a storage key that doesn't start with THIS
  // caller's own (schoolId, homeworkId) prefix is rejected BEFORE any
  // metadata lookup — even if a real object exists at that key (seeded
  // here to prove the rejection isn't just "object not found").
  it("400s a commit with a MISMATCHED-PREFIX storage key, even when a real object exists there", async () => {
    const homeworkId = await createHomework();
    const foreignKey = `schools/${sunriseId}/homework/some-other-homework-id/attachments/${randomUUID()}-file.pdf`;
    storage.seedObject(foreignKey, { sizeBytes: 1024, contentType: "application/pdf" });

    const response = await commit(mathTeacherToken, homeworkId, {
      storageKey: foreignKey,
      fileName: "file.pdf",
      contentType: "application/pdf",
    });
    expect(response.status).toBe(400);
    expect(response.body.message).toMatch(/invalid storage key/i);
  });

  it("409s at issue-time once the 20MB cap is already used up — no URL issued", async () => {
    const homeworkId = await createHomework();
    const first = await issueUploadUrl(mathTeacherToken, homeworkId);
    storage.seedObject(first.body.storageKey, { sizeBytes: 20 * 1024 * 1024, contentType: "application/pdf" });
    const firstCommit = await commit(mathTeacherToken, homeworkId, {
      storageKey: first.body.storageKey,
      fileName: "full-cap.pdf",
      contentType: "application/pdf",
    });
    expect(firstCommit.status).toBe(201);

    const second = await issueUploadUrl(mathTeacherToken, homeworkId);
    expect(second.status).toBe(409);
  });

  // Checkpoint 2 closes the race a single issue-time check can't: two
  // uploads each fit their OWN remaining-budget snapshot but not the
  // combined total once both try to commit. The now-useless upload is
  // deleted from storage rather than left as an orphan.
  it("409s at commit-time when the verified size would push the total over the cap — cleans up the orphaned upload", async () => {
    const homeworkId = await createHomework();
    const first = await issueUploadUrl(mathTeacherToken, homeworkId);
    storage.seedObject(first.body.storageKey, { sizeBytes: 15 * 1024 * 1024, contentType: "application/pdf" });
    const firstCommit = await commit(mathTeacherToken, homeworkId, {
      storageKey: first.body.storageKey,
      fileName: "first.pdf",
      contentType: "application/pdf",
    });
    expect(firstCommit.status).toBe(201);

    const second = await issueUploadUrl(mathTeacherToken, homeworkId);
    expect(second.status).toBe(200);
    storage.seedObject(second.body.storageKey, { sizeBytes: 10 * 1024 * 1024, contentType: "application/pdf" });

    const secondCommit = await commit(mathTeacherToken, homeworkId, {
      storageKey: second.body.storageKey,
      fileName: "second.pdf",
      contentType: "application/pdf",
    });
    expect(secondCommit.status).toBe(409);
    expect(await storage.getObjectMetadata(second.body.storageKey)).toBeNull();

    const attachments = await prisma.homeworkAttachment.findMany({ where: { homeworkId } });
    expect(attachments).toHaveLength(1);
  });

  it("403s a teacher who doesn't teach this subject", async () => {
    const homeworkId = await createHomework();
    const response = await issueUploadUrl(englishTeacherToken, homeworkId);
    expect(response.status).toBe(403);
  });

  it("404s a cross-tenant teacher acting on a Sunrise homework id — tenant scoping, not 403", async () => {
    const homeworkId = await createHomework();
    const response = await issueUploadUrl(hillcrestTeacherToken, homeworkId);
    expect(response.status).toBe(404);
  });

  it("attachments are NOT frozen once PUBLISHED (ruled at plan time)", async () => {
    const homeworkId = await createHomework();
    const published = await request(app.getHttpServer()).post(`/api/v1/homework/${homeworkId}/publish`).set(auth(mathTeacherToken));
    expect(published.status).toBe(200);

    const issued = await issueUploadUrl(mathTeacherToken, homeworkId);
    expect(issued.status).toBe(200);
    storage.seedObject(issued.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
    const committed = await commit(mathTeacherToken, homeworkId, {
      storageKey: issued.body.storageKey,
      fileName: "post-publish.pdf",
      contentType: "application/pdf",
    });
    expect(committed.status).toBe(201);
  });

  // v0.8.2 step 6 (SPEC_V0.8.2.md §6 item 6) — the gap Steps 4-5 left: a
  // teacher could attach a file and see it listed, but never resolve a
  // download URL for it.
  describe("GET /homework/:id/attachments/:attachmentId/download-url", () => {
    async function attachAndCommit(homeworkId: string): Promise<string> {
      const issued = await issueUploadUrl(mathTeacherToken, homeworkId);
      storage.seedObject(issued.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
      const committed = await commit(mathTeacherToken, homeworkId, {
        storageKey: issued.body.storageKey,
        fileName: "worksheet.pdf",
        contentType: "application/pdf",
      });
      if (committed.status !== 201) {
        throw new Error(`attachment commit failed: ${committed.status} ${JSON.stringify(committed.body)}`);
      }
      return committed.body.id as string;
    }

    it("the teacher resolves a download URL for their own attachment", async () => {
      const homeworkId = await createHomework();
      const attachmentId = await attachAndCommit(homeworkId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/homework/${homeworkId}/attachments/${attachmentId}/download-url`)
        .set(auth(mathTeacherToken));
      expect(response.status).toBe(200);
      expect(response.body.downloadUrl).toBeTruthy();
    });

    it("403s a teacher who doesn't teach this subject", async () => {
      const homeworkId = await createHomework();
      const attachmentId = await attachAndCommit(homeworkId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/homework/${homeworkId}/attachments/${attachmentId}/download-url`)
        .set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });

    it("404s a cross-tenant admin — tenant scoping, not 403", async () => {
      const homeworkId = await createHomework();
      const attachmentId = await attachAndCommit(homeworkId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/homework/${homeworkId}/attachments/${attachmentId}/download-url`)
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });
  });
});
