import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Teachers + assignments (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;

  let sunriseSchoolId: string;
  let sunriseSessionId: string;
  let bolaUserId: string;
  let ngoziUserId: string;
  let ahmedUserId: string;
  let jss1AArmId: string;
  let sss1AArmId: string;
  let physicsSubjectId: string;
  let hillcrestTeacherUserId: string;
  let hillcrestClassArmId: string;

  // Restored in afterAll — this is the arm's original class-teacher, per seed.
  let jss1AOriginalTeacherUserId: string;
  const createdSubjectAssignmentIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseSchoolId = sunrise.id;
    const session = await prisma.academicSession.findFirstOrThrow({ where: { schoolId: sunrise.id, isCurrent: true } });
    sunriseSessionId = session.id;

    bolaUserId = (await prisma.user.findFirstOrThrow({ where: { email: "teacher@sunrise.test" } })).id;
    ngoziUserId = (await prisma.user.findFirstOrThrow({ where: { email: "teacher2@sunrise.test" } })).id;
    ahmedUserId = (await prisma.user.findFirstOrThrow({ where: { email: "teacher3@sunrise.test" } })).id;

    jss1AArmId = (
      await prisma.classArm.findFirstOrThrow({
        where: { schoolId: sunrise.id, name: "A", classLevel: { name: "JSS 1" } },
      })
    ).id;
    sss1AArmId = (
      await prisma.classArm.findFirstOrThrow({
        where: { schoolId: sunrise.id, name: "A", classLevel: { name: "SSS 1" } },
      })
    ).id;
    physicsSubjectId = (await prisma.subject.findFirstOrThrow({ where: { schoolId: sunrise.id, name: "Physics" } })).id;

    const jss1AAssignment = await prisma.classTeacherAssignment.findFirstOrThrow({
      where: { classArmId: jss1AArmId, sessionId: sunriseSessionId },
    });
    jss1AOriginalTeacherUserId = jss1AAssignment.teacherUserId;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestTeacherUserId = (await prisma.user.findFirstOrThrow({ where: { email: "teacher@hillcrest.test" } })).id;
    hillcrestClassArmId = (
      await prisma.classArm.findFirstOrThrow({ where: { schoolId: hillcrest.id, name: "A", classLevel: { name: "JSS 1" } } })
    ).id;
  }, 20000);

  afterAll(async () => {
    if (!prisma) {
      await app?.close();
      return;
    }
    // Restore JSS 1 A's class teacher to what the seed originally set.
    if (jss1AArmId && jss1AOriginalTeacherUserId) {
      await prisma.classTeacherAssignment.upsert({
        where: { classArmId_sessionId: { classArmId: jss1AArmId, sessionId: sunriseSessionId } },
        update: { teacherUserId: jss1AOriginalTeacherUserId },
        create: {
          schoolId: sunriseSchoolId,
          classArmId: jss1AArmId,
          sessionId: sunriseSessionId,
          teacherUserId: jss1AOriginalTeacherUserId,
        },
      });
    }
    const ids = createdSubjectAssignmentIds.filter((id): id is string => Boolean(id));
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe("GET /teachers", () => {
    it("lists staff with role TEACHER only", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/teachers")
        .query({ pageSize: 100 })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.items.every((t: { role: string }) => t.role === "TEACHER")).toBe(true);
      expect(response.body.items.some((t: { email: string }) => t.email === "teacher@sunrise.test")).toBe(true);
    });

    it("TEACHER can read (view row in the RBAC matrix)", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/teachers").set(auth(sunriseTeacherToken));
      expect(response.status).toBe(200);
    });

    it("a second school's admin never sees the first school's teachers", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/teachers")
        .query({ pageSize: 100 })
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.items.some((t: { email: string }) => t.email === "teacher@sunrise.test")).toBe(false);
    });
  });

  describe("GET /teachers/:userId", () => {
    it("returns profile + current-session class-teacher and subject assignments", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/teachers/${bolaUserId}`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.email).toBe("teacher@sunrise.test");
      expect(Array.isArray(response.body.classTeacherOf)).toBe(true);
      expect(Array.isArray(response.body.subjectsTaught)).toBe(true);
      expect(response.body.classTeacherOf.some((c: { className: string }) => c.className === "JSS 1 A")).toBe(true);
      expect(response.body.subjectsTaught.some((s: { subjectName: string }) => s.subjectName === "Mathematics")).toBe(
        true,
      );
      // id lets the frontend target DELETE /subject-assignments/:id from
      // this table directly (v0.2 step 5 — see docs/DECISIONS.md).
      expect(response.body.subjectsTaught.every((s: { id?: string }) => typeof s.id === "string")).toBe(true);
    });

    it("a cross-tenant teacher id returns 404", async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/v1/teachers/${bolaUserId}`)
        .set(auth(hillcrestAdminToken));
      expect(response.status).toBe(404);
    });
  });

  describe("PUT/DELETE /class-arms/:id/class-teacher", () => {
    it("upsert-replaces the current session's assignment cleanly", async () => {
      const first = await request(app.getHttpServer())
        .put(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseAdminToken))
        .send({ teacherUserId: ngoziUserId });
      expect(first.status).toBe(200);
      expect(first.body.teacherUserId).toBe(ngoziUserId);

      const second = await request(app.getHttpServer())
        .put(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseAdminToken))
        .send({ teacherUserId: ahmedUserId });
      expect(second.status).toBe(200);
      expect(second.body.teacherUserId).toBe(ahmedUserId);
      // Same assignment row replaced, not a second row created.
      expect(second.body.id).toBe(first.body.id);

      const teacherDetail = await request(app.getHttpServer())
        .get(`/api/v1/teachers/${ngoziUserId}`)
        .set(auth(sunriseAdminToken));
      expect(teacherDetail.body.classTeacherOf.some((c: { className: string }) => c.className === "JSS 1 A")).toBe(
        false,
      );
    });

    it("DELETE unassigns; a second DELETE 404s", async () => {
      const del1 = await request(app.getHttpServer())
        .delete(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseAdminToken));
      expect(del1.status).toBe(200);

      const del2 = await request(app.getHttpServer())
        .delete(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseAdminToken));
      expect(del2.status).toBe(404);
    });

    it("rejects a teacherUserId that isn't a TEACHER with a staff profile", async () => {
      const sunriseAdminUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@sunrise.test" } });
      const response = await request(app.getHttpServer())
        .put(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseAdminToken))
        .send({ teacherUserId: sunriseAdminUser.id });
      expect(response.status).toBe(404);
    });

    it("a cross-tenant teacherUserId returns 404", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseAdminToken))
        .send({ teacherUserId: hillcrestTeacherUserId });
      expect(response.status).toBe(404);
    });

    it("TEACHER cannot assign or unassign", async () => {
      const putResponse = await request(app.getHttpServer())
        .put(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseTeacherToken))
        .send({ teacherUserId: bolaUserId });
      expect(putResponse.status).toBe(403);

      const deleteResponse = await request(app.getHttpServer())
        .delete(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseTeacherToken));
      expect(deleteResponse.status).toBe(403);
    });

    it("PROPRIETOR succeeds where SCHOOL_ADMIN does", async () => {
      const response = await request(app.getHttpServer())
        .put(`/api/v1/class-arms/${jss1AArmId}/class-teacher`)
        .set(auth(sunriseProprietorToken))
        .send({ teacherUserId: bolaUserId });
      expect(response.status).toBe(200);
    });
  });

  describe("POST/DELETE /subject-assignments", () => {
    it("creates an assignment for the current session", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/subject-assignments")
        .set(auth(sunriseAdminToken))
        .send({ subjectId: physicsSubjectId, classArmId: sss1AArmId, teacherUserId: ahmedUserId });
      expect(response.status).toBe(201);
      expect(response.body.sessionId).toBe(sunriseSessionId);
      createdSubjectAssignmentIds.push(response.body.id);
    });

    it("409s naming the current holder when the slot is taken", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/subject-assignments")
        .set(auth(sunriseAdminToken))
        .send({ subjectId: physicsSubjectId, classArmId: sss1AArmId, teacherUserId: ngoziUserId });
      expect(response.status).toBe(409);
      expect(response.body.message).toContain("Ahmed Suleiman");
    });

    it("a cross-tenant subjectId/classArmId/teacherUserId all 404", async () => {
      const hillcrestSubject = await prisma.subject.findFirstOrThrow({ where: { name: "Mathematics", schoolId: (await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } })).id } });

      const badSubject = await request(app.getHttpServer())
        .post("/api/v1/subject-assignments")
        .set(auth(sunriseAdminToken))
        .send({ subjectId: hillcrestSubject.id, classArmId: sss1AArmId, teacherUserId: ahmedUserId });
      expect(badSubject.status).toBe(404);

      const badArm = await request(app.getHttpServer())
        .post("/api/v1/subject-assignments")
        .set(auth(sunriseAdminToken))
        .send({ subjectId: physicsSubjectId, classArmId: hillcrestClassArmId, teacherUserId: ahmedUserId });
      expect(badArm.status).toBe(404);

      const badTeacher = await request(app.getHttpServer())
        .post("/api/v1/subject-assignments")
        .set(auth(sunriseAdminToken))
        .send({ subjectId: physicsSubjectId, classArmId: sss1AArmId, teacherUserId: hillcrestTeacherUserId });
      expect(badTeacher.status).toBe(404);
    });

    it("DELETE removes it; a cross-tenant id 404s", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/subject-assignments")
        .set(auth(sunriseAdminToken))
        .send({ subjectId: physicsSubjectId, classArmId: jss1AArmId, teacherUserId: ahmedUserId });
      expect(created.status).toBe(201);

      const crossTenantDelete = await request(app.getHttpServer())
        .delete(`/api/v1/subject-assignments/${created.body.id}`)
        .set(auth(hillcrestAdminToken));
      expect(crossTenantDelete.status).toBe(404);

      const ownDelete = await request(app.getHttpServer())
        .delete(`/api/v1/subject-assignments/${created.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(ownDelete.status).toBe(200);

      const again = await request(app.getHttpServer())
        .delete(`/api/v1/subject-assignments/${created.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(again.status).toBe(404);
    });

    it("TEACHER cannot create or delete subject assignments", async () => {
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/subject-assignments")
        .set(auth(sunriseTeacherToken))
        .send({ subjectId: physicsSubjectId, classArmId: sss1AArmId, teacherUserId: ahmedUserId });
      expect(createResponse.status).toBe(403);
    });
  });
});
