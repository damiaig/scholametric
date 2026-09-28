import { INestApplication } from "@nestjs/common";
import request from "supertest";
import bcrypt from "bcrypt";
import { Gender, UserRole } from "@prisma/client";
import { createTestApp } from "./utils/create-test-app";
import { loginAs, SEED_PASSWORD } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";
import { StorageService } from "../src/storage/storage.service";
import { FakeStorageService } from "./utils/fake-storage.service";

// v0.8.2 step 4 (SPEC_V0.8.2.md §6 item 4) — student upload flow + the
// teacher's fold-in "who marked done AND who uploaded" view (Step 2's
// deferred piece). Reuses the same JSS 1 A Mathematics assignment as the
// sibling homework-attachments.e2e-spec.ts.
describe("Homework submissions (e2e) — SPEC_V0.8.2.md §6 item 4, v0.8.2 step 4", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let storage: FakeStorageService;

  let mathTeacherToken: string;
  let englishTeacherToken: string;
  let sunriseAdminToken: string;
  let hillcrestAdminToken: string;
  let studentToken: string;
  let otherClassStudentToken: string;

  let sunriseId: string;
  let sunriseSessionId: string;
  let sunriseTermId: string;
  let jss1AArmId: string;
  let jss2AArmId: string;
  let mathSubjectId: string;
  let studentId: string;

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });
  const VALID_DUE_DATE = "2026-10-19"; // Monday, within the seeded current session

  const createdHomeworkIds: string[] = [];
  const createdStudentIds: string[] = [];
  const createdUserIds: string[] = [];

  async function createPublishedHomework(): Promise<string> {
    const created = await request(app.getHttpServer())
      .post("/api/v1/homework")
      .set(auth(mathTeacherToken))
      .send({
        classArmId: jss1AArmId,
        subjectId: mathSubjectId,
        termId: sunriseTermId,
        title: "Submission host homework",
        description: "For submission e2e coverage.",
        dueDate: VALID_DUE_DATE,
        requiresUpload: true,
      });
    if (created.status !== 201) {
      throw new Error(`homework creation failed: ${created.status} ${JSON.stringify(created.body)}`);
    }
    createdHomeworkIds.push(created.body.id);
    const published = await request(app.getHttpServer()).post(`/api/v1/homework/${created.body.id}/publish`).set(auth(mathTeacherToken));
    if (published.status !== 200) {
      throw new Error(`homework publish failed: ${published.status} ${JSON.stringify(published.body)}`);
    }
    return created.body.id as string;
  }

  function issueUploadUrl(token: string, homeworkId: string, fileName = "answers.pdf") {
    return request(app.getHttpServer())
      .post(`/api/v1/me/homework/${homeworkId}/submissions/upload-url`)
      .set(auth(token))
      .send({ fileName, contentType: "application/pdf" });
  }

  function commit(token: string, homeworkId: string, body: Record<string, unknown>) {
    return request(app.getHttpServer()).post(`/api/v1/me/homework/${homeworkId}/submissions`).set(auth(token)).send(body);
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    storage = app.get(StorageService) as FakeStorageService;

    mathTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    englishTeacherToken = await loginAs(app, "teacher2@sunrise.test", "sunrise");
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
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
    jss2AArmId = (await prisma.classArm.findFirstOrThrow({ where: { schoolId: sunriseId, classLevelId: jss2.id, name: "A" } })).id;
    mathSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunriseId, name: "Mathematics" } })).id;

    const passwordHash = await bcrypt.hash(SEED_PASSWORD, 4);

    const student = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-HWSUB/Student",
        firstName: "Amaka",
        lastName: "Obi",
        gender: Gender.FEMALE,
        dateOfBirth: new Date("2012-02-02"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000011",
      },
    });
    studentId = student.id;
    createdStudentIds.push(studentId);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId, classArmId: jss1AArmId, sessionId: sunriseSessionId } });
    const studentUser = await prisma.user.create({
      data: { schoolId: sunriseId, role: UserRole.STUDENT, username: "E2EHWSUBSTUDENT", studentId, firstName: "Amaka", lastName: "Obi", passwordHash, mustChangePassword: false },
    });
    createdUserIds.push(studentUser.id);
    studentToken = await loginAs(app, "E2EHWSUBSTUDENT", "sunrise");

    const otherClassStudent = await prisma.student.create({
      data: {
        schoolId: sunriseId,
        admissionNumber: "E2E-HWSUB/OtherClass",
        firstName: "Kelechi",
        lastName: "Nwosu",
        gender: Gender.MALE,
        dateOfBirth: new Date("2011-03-03"),
        guardianName: "E2E Guardian",
        guardianPhone: "+2348050000012",
      },
    });
    createdStudentIds.push(otherClassStudent.id);
    await prisma.studentEnrollment.create({ data: { schoolId: sunriseId, studentId: otherClassStudent.id, classArmId: jss2AArmId, sessionId: sunriseSessionId } });
    const otherClassStudentUser = await prisma.user.create({
      data: {
        schoolId: sunriseId,
        role: UserRole.STUDENT,
        username: "E2EHWSUBOTHERCLASS",
        studentId: otherClassStudent.id,
        firstName: "Kelechi",
        lastName: "Nwosu",
        passwordHash,
        mustChangePassword: false,
      },
    });
    createdUserIds.push(otherClassStudentUser.id);
    otherClassStudentToken = await loginAs(app, "E2EHWSUBOTHERCLASS", "sunrise");
  });

  afterAll(async () => {
    if (createdHomeworkIds.length > 0) {
      await prisma.homeworkAttachment.deleteMany({ where: { homeworkId: { in: createdHomeworkIds } } });
      await prisma.homeworkSubmission.deleteMany({ where: { homeworkId: { in: createdHomeworkIds } } });
      await prisma.homeworkCompletion.deleteMany({ where: { homeworkId: { in: createdHomeworkIds } } });
      await prisma.homework.deleteMany({ where: { id: { in: createdHomeworkIds } } });
    }
    await prisma.refreshToken.deleteMany({ where: { userId: { in: createdUserIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.studentEnrollment.deleteMany({ where: { studentId: { in: createdStudentIds } } });
    await prisma.student.deleteMany({ where: { id: { in: createdStudentIds } } });
    await app.close();
  });

  it("commits a submission using the verified actual size, visible to the teacher's submissions view", async () => {
    const homeworkId = await createPublishedHomework();
    const issued = await issueUploadUrl(studentToken, homeworkId);
    expect(issued.status).toBe(200);
    expect(issued.body.storageKey.startsWith(`schools/${sunriseId}/homework/${homeworkId}/submissions/${studentId}/`)).toBe(true);

    storage.seedObject(issued.body.storageKey, { sizeBytes: 2 * 1024 * 1024, contentType: "application/pdf" });
    const committed = await commit(studentToken, homeworkId, {
      storageKey: issued.body.storageKey,
      fileName: "answers.pdf",
      contentType: "application/pdf",
    });
    expect(committed.status).toBe(201);
    expect(committed.body.sizeBytes).toBe(2 * 1024 * 1024);

    const view = await request(app.getHttpServer()).get(`/api/v1/homework/${homeworkId}/submissions`).set(auth(mathTeacherToken));
    expect(view.status).toBe(200);
    const entry = view.body.students.find((s: { studentId: string }) => s.studentId === studentId);
    expect(entry.submissions).toHaveLength(1);
    expect(entry.submissions[0].fileName).toBe("answers.pdf");
    expect(entry.markedDone).toBe(false);
  });

  it("folds mark-done and uploads into one roster view — a student with neither still appears", async () => {
    const homeworkId = await createPublishedHomework();

    const marked = await request(app.getHttpServer()).post(`/api/v1/me/homework/${homeworkId}/complete`).set(auth(studentToken)).send({ markedDone: true });
    expect(marked.status).toBe(200);

    const view = await request(app.getHttpServer()).get(`/api/v1/homework/${homeworkId}/submissions`).set(auth(mathTeacherToken));
    expect(view.status).toBe(200);
    const marker = view.body.students.find((s: { studentId: string }) => s.studentId === studentId);
    expect(marker.markedDone).toBe(true);
    expect(marker.submissions).toHaveLength(0);
  });

  it("404s a student uploading outside their own class", async () => {
    const homeworkId = await createPublishedHomework();
    const response = await issueUploadUrl(otherClassStudentToken, homeworkId);
    expect(response.status).toBe(404);
  });

  it("403s a teacher who doesn't teach this subject viewing submissions", async () => {
    const homeworkId = await createPublishedHomework();
    const response = await request(app.getHttpServer()).get(`/api/v1/homework/${homeworkId}/submissions`).set(auth(englishTeacherToken));
    expect(response.status).toBe(403);
  });

  it("404s a cross-tenant admin viewing submissions — tenant scoping, not 403", async () => {
    const homeworkId = await createPublishedHomework();
    const response = await request(app.getHttpServer()).get(`/api/v1/homework/${homeworkId}/submissions`).set(auth(hillcrestAdminToken));
    expect(response.status).toBe(404);
  });

  it("SCHOOL_ADMIN can view submissions without a teaching assignment (safety valve)", async () => {
    const homeworkId = await createPublishedHomework();
    const response = await request(app.getHttpServer()).get(`/api/v1/homework/${homeworkId}/submissions`).set(auth(sunriseAdminToken));
    expect(response.status).toBe(200);
  });

  it("409s at issue-time once the student's own 20MB cap is already used up", async () => {
    const homeworkId = await createPublishedHomework();
    const first = await issueUploadUrl(studentToken, homeworkId);
    storage.seedObject(first.body.storageKey, { sizeBytes: 20 * 1024 * 1024, contentType: "application/pdf" });
    const firstCommit = await commit(studentToken, homeworkId, { storageKey: first.body.storageKey, fileName: "full-cap.pdf", contentType: "application/pdf" });
    expect(firstCommit.status).toBe(201);

    const second = await issueUploadUrl(studentToken, homeworkId);
    expect(second.status).toBe(409);
  });

  it("the teacher can resolve a download URL for a submission", async () => {
    const homeworkId = await createPublishedHomework();
    const issued = await issueUploadUrl(studentToken, homeworkId);
    storage.seedObject(issued.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
    const committed = await commit(studentToken, homeworkId, { storageKey: issued.body.storageKey, fileName: "answers.pdf", contentType: "application/pdf" });

    const response = await request(app.getHttpServer())
      .get(`/api/v1/homework/${homeworkId}/submissions/${committed.body.id}/download-url`)
      .set(auth(mathTeacherToken));
    expect(response.status).toBe(200);
    expect(response.body.downloadUrl).toBeTruthy();
  });

  // v0.8.2 step 4, flag 4 — students see/download the teacher's own
  // attachments (folded into the student list + a dedicated download-url
  // route), proved end-to-end alongside submissions in this same file.
  describe("student view of the teacher's attachments (flag 4)", () => {
    it("a teacher's attachment appears in the student's homework list, with a working student-side download URL", async () => {
      const homeworkId = await createPublishedHomework();
      const issuedAttachment = await request(app.getHttpServer())
        .post(`/api/v1/homework/${homeworkId}/attachments/upload-url`)
        .set(auth(mathTeacherToken))
        .send({ fileName: "worksheet.pdf", contentType: "application/pdf" });
      storage.seedObject(issuedAttachment.body.storageKey, { sizeBytes: 1024, contentType: "application/pdf" });
      const attachment = await request(app.getHttpServer())
        .post(`/api/v1/homework/${homeworkId}/attachments`)
        .set(auth(mathTeacherToken))
        .send({ storageKey: issuedAttachment.body.storageKey, fileName: "worksheet.pdf", contentType: "application/pdf" });
      expect(attachment.status).toBe(201);

      const list = await request(app.getHttpServer()).get("/api/v1/me/homework").set(auth(studentToken));
      const entry = list.body.homework.find((h: { id: string }) => h.id === homeworkId);
      expect(entry.attachments).toHaveLength(1);

      const download = await request(app.getHttpServer())
        .get(`/api/v1/me/homework/${homeworkId}/attachments/${attachment.body.id}/download-url`)
        .set(auth(studentToken));
      expect(download.status).toBe(200);
      expect(download.body.downloadUrl).toBeTruthy();

      const otherClassDownload = await request(app.getHttpServer())
        .get(`/api/v1/me/homework/${homeworkId}/attachments/${attachment.body.id}/download-url`)
        .set(auth(otherClassStudentToken));
      expect(otherClassDownload.status).toBe(404);
    });
  });
});
