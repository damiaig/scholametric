import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { pastWeekday } from "./utils/future-date";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./utils/fake-storage.service";

// v0.8.4 step 3 (SPEC_V0.8.4.md §5) — teacher attach/delete flow +
// student/parent download. Reuses homework's own storage layer
// wholesale: the same signed-URL two-checkpoint shape, the same
// tenant-isolation prefix guard, FakeStorageService (no live Firebase
// anywhere in this file). Reuses the same JSS 1 A Mathematics assignment
// (teacher@sunrise.test) steps 1-2 already rely on.
describe("Lesson attachments (e2e) — SPEC_V0.8.4.md §5, v0.8.4 step 3", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: FakeStorageService;

  let mathTeacherToken: string;
  let englishTeacherToken: string;
  let sunriseAdminToken: string;
  let hillcrestTeacherToken: string;
  let hillcrestAdminToken: string;
  let studentToken: string;
  let otherClassStudentToken: string;
  let parentToken: string;
  let notLinkedParentToken: string;

  let sunriseId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let mathSubjectId: string;
  let studentId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const VALID_LESSON_DATE = pastWeekday(1, 7);

  const createdLessonIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];
  const createdGuardianIds: string[] = [];

  async function createLesson(): Promise<string> {
    const response = await request(app.getHttpServer())
      .post("/api/v1/lessons")
      .set(auth(mathTeacherToken))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        title: "Attachment host lesson",
        body: "For attachment e2e coverage.",
        lessonDate: VALID_LESSON_DATE,
      });
    if (response.status !== 201) {
      throw new Error(`lesson creation failed: ${response.status} ${JSON.stringify(response.body)}`);
    }
    createdLessonIds.push(response.body.id);
    return response.body.id as string;
  }

  async function createPublishedLesson(): Promise<string> {
    const lessonId = await createLesson();
    const published = await request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/publish`).set(auth(mathTeacherToken));
    if (published.status !== 200) {
      throw new Error(`lesson publish failed: ${published.status} ${JSON.stringify(published.body)}`);
    }
    return lessonId;
  }

  function issueUploadUrl(token: string, lessonId: string, fileName = "notes.pdf") {
    return request(app.getHttpServer())
      .post(`/api/v1/lessons/${lessonId}/attachments/upload-url`)
      .set(auth(token))
      .send({ fileName, contentType: "application/pdf" });
  }

  function commit(token: string, lessonId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/api/v1/lessons/${lessonId}/attachments`).set(auth(token)).send(body);
  }

  async function attachAndCommit(lessonId: string): Promise<string> {
    const issued = await issueUploadUrl(mathTeacherToken, lessonId);
    if (issued.status !== 200) {
      throw new Error(`upload-url issue failed: ${issued.status} ${JSON.stringify(issued.body)}`);
    }
    storage.seedObject(issued.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
    const committed = await commit(mathTeacherToken, lessonId, {
      storageKey: issued.body.storageKey,
      fileName: "notes.pdf",
      contentType: "application/pdf",
    });
    if (committed.status !== 201) {
      throw new Error(`attachment commit failed: ${committed.status} ${JSON.stringify(committed.body)}`);
    }
    return committed.body.id as string;
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService) as FakeStorageService;

    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    englishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    hillcrestTeacherToken = await loginAs(app, "teacher@hillcrest.test", "hillcrest");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunriseId, isCurrent: true } });
    const jss1 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 1" } });
    jss1AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss1.id, name: "A" } })).id;
    const jss2 = await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunriseId, name: "JSS 2" } });
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);

    // The student whose class is jss1AArmId — the student/parent download tests.
    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-LESSONATT/Student",
        firstName: "Chidinma",
        lastName: "Eze",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000031",
      },
    });
    studentId = student.id;
    createdStudentIds.push(studentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId, classArmId: jss1AArmId, sessionId: session.id } });
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2ELESSONATTSTUDENT", studentId, firstName: "Chidinma", lastName: "Eze", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, "E2ELESSONATTSTUDENT", "sunrise");

    // A second student in a DIFFERENT class (jss2A) — the own-class wall.
    const otherClassStudent = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-LESSONATT/OtherClass",
        firstName: "Tunde",
        lastName: "Bello",
        gender: Gender.MALE,
        dateOfBirth: new Date("2011-01-01"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000032",
      },
    });
    createdStudentIds.push(otherClassStudent.id);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: otherClassStudent.id, classArmId: jss2AArmId, sessionId: session.id } });
    const otherClassStudentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2ELESSONATTOTHERCLASS", studentId: otherClassStudent.id, firstName: "Tunde", lastName: "Bello", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(otherClassStudentUser.id);
    otherClassStudentToken = await loginAs(app, "E2ELESSONATTOTHERCLASS", "sunrise");

    // A guardian linked to `student` — the parent's own-child wall.
    const guardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "Ngozi", lastName: "Eze", phone: "+2348050000033" } });
    createdGuardianIds.push(guardian.id);
    await prisma.studentGuardian.create({ data: { schoolId: sunriseId, studentId, guardianId: guardian.id, relationship: "MOTHER", isPrimary: true } });
    const parentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: "E2ELESSONATTPARENT", guardianId: guardian.id, firstName: "Ngozi", lastName: "Eze", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(parentUser.id);
    parentToken = await loginAs(app, "E2ELESSONATTPARENT", "sunrise");

    // A SEPARATE guardian, linked to nobody relevant — the "not my child" 404.
    const notLinkedGuardian = await prisma.guardian.create({ data: { schoolId: sunriseId, firstName: "Unrelated", lastName: "Parent", phone: "+2348050000034" } });
    createdGuardianIds.push(notLinkedGuardian.id);
    const notLinkedParentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.PARENT, username: "E2ELESSONATTNOTLINKED", guardianId: notLinkedGuardian.id, firstName: "Unrelated", lastName: "Parent", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(notLinkedParentUser.id);
    notLinkedParentToken = await loginAs(app, "E2ELESSONATTNOTLINKED", "sunrise");
    // No local TimetableSlot fixture needed — seed.ts itself seeds
    // teacher@sunrise.test teaching jss1AArmId Mathematics on Mon/Tue/Thu/Fri
    // (v0.8.3 Item 4 rework), and VALID_LESSON_DATE is always a past Monday.
  });

  afterAll(async () => {
    if (createdLessonIds.length > 0) {
      await prisma.lessonAttachment.deleteMany({ where: { lessonId: { in: createdLessonIds } } });
      await prisma.lesson.deleteMany({ where: { id: { in: createdLessonIds } } });
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentGuardian.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.guardian.deleteMany({ where: { id: { in: createdGuardianIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await app.close();
  });

  it("issues an upload URL scoped to a caller-unguessable storage key under this lesson's attachment prefix", async () => {
    const lessonId = await createLesson();
    const response = await issueUploadUrl(mathTeacherToken, lessonId);
    expect(response.status).toBe(200);
    expect(response.body.storageKey.startsWith(`schools/${sunriseId}/lessons/${lessonId}/attachments/`)).toBe(true);
    expect(response.body.maxSizeBytes).toBe(20 * 1024 * 1024);
  });

  it("commits an attachment using the storage layer's VERIFIED actual size, not a client-declared one", async () => {
    const lessonId = await createLesson();
    const issued = await issueUploadUrl(mathTeacherToken, lessonId);
    expect(issued.status).toBe(200);

    storage.seedObject(issued.body.storageKey, { sizeBytes: 3 * 1024 * 1024, contentType: "application/pdf" });

    const committed = await commit(mathTeacherToken, lessonId, {
      storageKey: issued.body.storageKey,
      fileName: "notes.pdf",
      contentType: "application/pdf",
    });
    expect(committed.status).toBe(201);
    // The response's sizeBytes (3MB) came from FakeStorageService's
    // seeded metadata, never from the request body (which carries no
    // sizeBytes field at all) — this IS the "verified, not client-
    // declared" proof. Confirmed against the persisted row too, not just
    // the response shape.
    expect(committed.body.sizeBytes).toBe(3 * 1024 * 1024);
    const row = await prisma.lessonAttachment.findUniqueOrThrow({ where: { id: committed.body.id } });
    expect(row.sizeBytes).toBe(3 * 1024 * 1024);
  });

  // v0.8.4 step 4 (SPEC_V0.8.4.md §6 step 4) — the LOUD version of the
  // gap-fix proof: an empty-array assertion on create alone would pass
  // even if the include were wired wrong (an empty array is still an
  // empty array either way). Committing a real attachment, then asserting
  // it shows up in the TEACHER-facing GET /lessons response, is the one
  // that actually fails if the Prisma include is a no-op.
  it("a committed attachment appears on the teacher-facing GET /lessons response for that lesson", async () => {
    const lessonId = await createLesson();
    await attachAndCommit(lessonId);

    const list = await request(app.getHttpServer())
      .get("/api/v1/lessons")
      .query({ classArmId: jss1AArmId, subjectId: mathSubjectId })
      .set(auth(mathTeacherToken));
    expect(list.status).toBe(200);

    const lesson = list.body.lessons.find((item: { id: string }) => item.id === lessonId);
    expect(lesson).toBeDefined();
    expect(lesson.attachments).toHaveLength(1);
    expect(lesson.attachments[0]).toMatchObject({ fileName: "notes.pdf", contentType: "application/pdf", sizeBytes: 1024 });
  });

  it("400s a commit against a storage key nothing was ever uploaded to", async () => {
    const lessonId = await createLesson();
    const issued = await issueUploadUrl(mathTeacherToken, lessonId);

    const response = await commit(mathTeacherToken, lessonId, {
      storageKey: issued.body.storageKey,
      fileName: "notes.pdf",
      contentType: "application/pdf",
    });
    expect(response.status).toBe(400);
  });

  // THE tenant-isolation proof — must fail loudly if the prefix guard is
  // a no-op: a storage key under a DIFFERENT lesson's prefix, and
  // separately one under a DIFFERENT school's prefix, each with a REAL
  // object seeded there (proving the rejection isn't just "not found").
  describe("the tenant-isolation prefix guard", () => {
    it("400s a commit with a storage key under a DIFFERENT lesson's prefix, even when a real object exists there", async () => {
      const lessonId = await createLesson();
      const foreignKey = `schools/${sunriseId}/lessons/${randomUUID()}/attachments/${randomUUID()}-file.pdf`;
      storage.seedObject(foreignKey, { sizeBytes: 1024, contentType: "application/pdf" });

      const response = await commit(mathTeacherToken, lessonId, {
        storageKey: foreignKey,
        fileName: "file.pdf",
        contentType: "application/pdf",
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/invalid storage key/i);
    });

    it("400s a commit with a storage key under a DIFFERENT school's prefix, even when a real object exists there", async () => {
      const lessonId = await createLesson();
      const foreignSchoolKey = `schools/${randomUUID()}/lessons/${lessonId}/attachments/${randomUUID()}-file.pdf`;
      storage.seedObject(foreignSchoolKey, { sizeBytes: 1024, contentType: "application/pdf" });

      const response = await commit(mathTeacherToken, lessonId, {
        storageKey: foreignSchoolKey,
        fileName: "file.pdf",
        contentType: "application/pdf",
      });
      expect(response.status).toBe(400);
      expect(response.body.message).toMatch(/invalid storage key/i);
    });
  });

  it("409s at issue-time once the 20MB cap is already used up — no URL issued", async () => {
    const lessonId = await createLesson();
    const first = await issueUploadUrl(mathTeacherToken, lessonId);
    storage.seedObject(first.body.storageKey, { sizeBytes: 20 * 1024 * 1024, contentType: "application/pdf" });
    const firstCommit = await commit(mathTeacherToken, lessonId, {
      storageKey: first.body.storageKey,
      fileName: "full-cap.pdf",
      contentType: "application/pdf",
    });
    expect(firstCommit.status).toBe(201);

    const second = await issueUploadUrl(mathTeacherToken, lessonId);
    expect(second.status).toBe(409);
  });

  it("409s at commit-time when the verified size would push the total over the cap — cleans up the orphaned upload", async () => {
    const lessonId = await createLesson();
    const first = await issueUploadUrl(mathTeacherToken, lessonId);
    storage.seedObject(first.body.storageKey, { sizeBytes: 15 * 1024 * 1024, contentType: "application/pdf" });
    const firstCommit = await commit(mathTeacherToken, lessonId, {
      storageKey: first.body.storageKey,
      fileName: "first.pdf",
      contentType: "application/pdf",
    });
    expect(firstCommit.status).toBe(201);

    const second = await issueUploadUrl(mathTeacherToken, lessonId);
    expect(second.status).toBe(200);
    storage.seedObject(second.body.storageKey, { sizeBytes: 10 * 1024 * 1024, contentType: "application/pdf" });

    const secondCommit = await commit(mathTeacherToken, lessonId, {
      storageKey: second.body.storageKey,
      fileName: "second.pdf",
      contentType: "application/pdf",
    });
    expect(secondCommit.status).toBe(409);
    expect(await storage.getObjectMetadata(second.body.storageKey)).toBeNull();

    const attachments = await prisma.lessonAttachment.findMany({ where: { lessonId } });
    expect(attachments).toHaveLength(1);
  });

  it("403s a teacher who doesn't teach this subject attaching", async () => {
    const lessonId = await createLesson();
    const response = await issueUploadUrl(englishTeacherToken, lessonId);
    expect(response.status).toBe(403);
  });

  it("404s a cross-tenant teacher acting on a Sunrise lesson id — tenant scoping, not 403", async () => {
    const lessonId = await createLesson();
    const response = await issueUploadUrl(hillcrestTeacherToken, lessonId);
    expect(response.status).toBe(404);
  });

  it("attachments are NOT frozen once PUBLISHED (ruled at plan time, mirrors homework)", async () => {
    const lessonId = await createPublishedLesson();
    const issued = await issueUploadUrl(mathTeacherToken, lessonId);
    expect(issued.status).toBe(200);
    storage.seedObject(issued.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
    const committed = await commit(mathTeacherToken, lessonId, {
      storageKey: issued.body.storageKey,
      fileName: "post-publish.pdf",
      contentType: "application/pdf",
    });
    expect(committed.status).toBe(201);
  });

  describe("DELETE /lessons/:id/attachments/:attachmentId", () => {
    it("the teacher deletes their own attachment — row and storage object both gone", async () => {
      const lessonId = await createLesson();
      const attachmentId = await attachAndCommit(lessonId);
      const [attachment] = await prisma.lessonAttachment.findMany({ where: { id: attachmentId } });
      expect(await storage.getObjectMetadata(attachment.storageKey)).not.toBeNull();

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}`)
        .set(auth(mathTeacherToken));
      expect(response.status).toBe(200);

      expect(await prisma.lessonAttachment.findFirst({ where: { id: attachmentId } })).toBeNull();
      expect(await storage.getObjectMetadata(attachment.storageKey)).toBeNull();
    });

    it("SCHOOL_ADMIN can delete an attachment without a teaching assignment (safety valve, mirrors deleteHomework)", async () => {
      const lessonId = await createLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(await prisma.lessonAttachment.findFirst({ where: { id: attachmentId } })).toBeNull();
    });

    it("403s a teacher who doesn't teach this subject", async () => {
      const lessonId = await createLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}`)
        .set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });

    it("404s a cross-tenant teacher — tenant scoping, not 403", async () => {
      const lessonId = await createLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}`)
        .set(auth(hillcrestTeacherToken));
      expect(response.status).toBe(404);
    });

    it("frees the 20MB cap — a subsequent upload that would've exceeded now fits", async () => {
      const lessonId = await createLesson();
      const first = await issueUploadUrl(mathTeacherToken, lessonId);
      storage.seedObject(first.body.storageKey, { sizeBytes: 20 * 1024 * 1024, contentType: "application/pdf" });
      const firstCommit = await commit(mathTeacherToken, lessonId, {
        storageKey: first.body.storageKey,
        fileName: "full-cap.pdf",
        contentType: "application/pdf",
      });
      expect(firstCommit.status).toBe(201);

      const blocked = await issueUploadUrl(mathTeacherToken, lessonId);
      expect(blocked.status).toBe(409);

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/v1/lessons/${lessonId}/attachments/${firstCommit.body.id}`)
        .set(auth(mathTeacherToken));
      expect(deleteResponse.status).toBe(200);

      const afterDelete = await issueUploadUrl(mathTeacherToken, lessonId);
      expect(afterDelete.status).toBe(200);
    });
  });

  describe("GET /lessons/:id/attachments/:attachmentId/download-url (TEACHER)", () => {
    it("the teacher resolves a download URL for their own attachment — works on a DRAFT lesson (authoring, not reading published content)", async () => {
      const lessonId = await createLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(mathTeacherToken));
      expect(response.status).toBe(200);
      expect(response.body.downloadUrl).toBeTruthy();
    });

    it("403s a teacher who doesn't teach this subject", async () => {
      const lessonId = await createLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(englishTeacherToken));
      expect(response.status).toBe(403);
    });

    it("404s a cross-tenant admin — tenant scoping, not 403", async () => {
      const lessonId = await createLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });
  });

  describe("student + parent download a PUBLISHED lesson's attachment", () => {
    it("the student downloads it", async () => {
      const lessonId = await createPublishedLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(studentToken));
      expect(response.status).toBe(200);
      expect(response.body.downloadUrl).toBeTruthy();
    });

    it("a student in a different class 404s", async () => {
      const lessonId = await createPublishedLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(otherClassStudentToken));
      expect(response.status).toBe(404);
    });

    it("the parent downloads it for their linked child", async () => {
      const lessonId = await createPublishedLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentId}/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(parentToken));
      expect(response.status).toBe(200);
      expect(response.body.downloadUrl).toBeTruthy();
    });

    it("404s a parent with no link to this student — the own-child wall, checked before anything else", async () => {
      const lessonId = await createPublishedLesson();
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentId}/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(notLinkedParentToken));
      expect(response.status).toBe(404);
    });

    // A DRAFT lesson's attachment is NOT downloadable to its own class/
    // linked child — the status filter is baked into the same lookup
    // getAttachmentDownloadUrlForStudent already does, not a separate
    // check, so this proves that filter actually fires.
    it("404s a student's own class's DRAFT lesson attachment", async () => {
      const lessonId = await createLesson(); // never published
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(studentToken));
      expect(response.status).toBe(404);
    });

    it("404s a DRAFT lesson's attachment for the linked child's parent too", async () => {
      const lessonId = await createLesson(); // never published
      const attachmentId = await attachAndCommit(lessonId);

      const response = await request(app.getHttpServer())
        .get(`/api/v1/me/children/${studentId}/lessons/${lessonId}/attachments/${attachmentId}/download-url`)
        .set(auth(parentToken));
      expect(response.status).toBe(404);
    });
  });
});
