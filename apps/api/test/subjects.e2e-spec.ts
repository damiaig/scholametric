import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Subjects (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseSchoolId: string;
  let jss1LevelId: string;
  let sss1LevelId: string;
  let hillcrestLevelId: string;
  const createdSubjectIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunrise = await prisma.school.findUniqueOrThrow({ where: { slug: "sunrise" } });
    sunriseSchoolId = sunrise.id;
    jss1LevelId = (await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunrise.id, name: "JSS 1" } })).id;
    sss1LevelId = (await prisma.classLevel.findFirstOrThrow({ where: { schoolId: sunrise.id, name: "SSS 1" } })).id;

    const hillcrest = await prisma.school.findUniqueOrThrow({ where: { slug: "hillcrest" } });
    hillcrestLevelId = (await prisma.classLevel.findFirstOrThrow({ where: { schoolId: hillcrest.id } })).id;
  }, 20000);

  afterAll(async () => {
    if (!prisma) {
      await app?.close();
      return;
    }
    const ids = createdSubjectIds.filter((id): id is string => Boolean(id));
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.subjectClassLevel.deleteMany({ where: { subjectId: { in: ids } } });
    await prisma.subjectTeacherAssignment.deleteMany({ where: { subjectId: { in: ids } } });
    await prisma.subject.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  function subjectPayload() {
    return { name: `Test Subject ${randomUUID().slice(0, 8)}`, code: "TST" };
  }

  describe("GET /subjects", () => {
    it("lists subjects for the caller's school", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/subjects")
        .query({ pageSize: 100 })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(response.body.items.some((s: { name: string }) => s.name === "Mathematics")).toBe(true);
    });

    it("TEACHER can read (view row in the RBAC matrix)", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/subjects").set(auth(sunriseTeacherToken));
      expect(response.status).toBe(200);
    });
  });

  describe("POST /subjects", () => {
    it("creates a subject", async () => {
      const payload = subjectPayload();
      const response = await request(app.getHttpServer())
        .post("/api/v1/subjects")
        .set(auth(sunriseAdminToken))
        .send(payload);
      expect(response.status).toBe(201);
      expect(response.body.name).toBe(payload.name);
      createdSubjectIds.push(response.body.id);
    });

    it("TEACHER cannot create subjects", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/subjects")
        .set(auth(sunriseTeacherToken))
        .send(subjectPayload());
      expect(response.status).toBe(403);
    });

    it("409s a duplicate name in the same school", async () => {
      const payload = subjectPayload();
      const first = await request(app.getHttpServer())
        .post("/api/v1/subjects")
        .set(auth(sunriseAdminToken))
        .send(payload);
      createdSubjectIds.push(first.body.id);

      const duplicate = await request(app.getHttpServer())
        .post("/api/v1/subjects")
        .set(auth(sunriseAdminToken))
        .send(payload);
      expect(duplicate.status).toBe(409);
    });
  });

  describe("PUT /subjects/:id/levels", () => {
    it("replaces the level set, validating levels belong to the school", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/subjects")
        .set(auth(sunriseAdminToken))
        .send(subjectPayload());
      createdSubjectIds.push(created.body.id);

      const setLevels = await request(app.getHttpServer())
        .put(`/api/v1/subjects/${created.body.id}/levels`)
        .set(auth(sunriseAdminToken))
        .send({ classLevelIds: [jss1LevelId, sss1LevelId] });
      expect(setLevels.status).toBe(200);
      expect(setLevels.body.classLevels.map((l: { id: string }) => l.id).sort()).toEqual(
        [jss1LevelId, sss1LevelId].sort(),
      );

      // Replacing again with just one level drops the other.
      const replaced = await request(app.getHttpServer())
        .put(`/api/v1/subjects/${created.body.id}/levels`)
        .set(auth(sunriseAdminToken))
        .send({ classLevelIds: [jss1LevelId] });
      expect(replaced.status).toBe(200);
      expect(replaced.body.classLevels).toHaveLength(1);
      expect(replaced.body.classLevels[0].id).toBe(jss1LevelId);
    });

    it("404s if a classLevelId belongs to another school", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/subjects")
        .set(auth(sunriseAdminToken))
        .send(subjectPayload());
      createdSubjectIds.push(created.body.id);

      const response = await request(app.getHttpServer())
        .put(`/api/v1/subjects/${created.body.id}/levels`)
        .set(auth(sunriseAdminToken))
        .send({ classLevelIds: [hillcrestLevelId] });
      expect(response.status).toBe(404);
    });
  });

  describe("DELETE /subjects/:id", () => {
    it("409s when the subject has a teacher assignment", async () => {
      const mathematics = await prisma.subject.findFirstOrThrow({
        where: { schoolId: sunriseSchoolId, name: "Mathematics" },
      });
      const response = await request(app.getHttpServer())
        .delete(`/api/v1/subjects/${mathematics.id}`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(409);

      const stillThere = await prisma.subject.findUniqueOrThrow({ where: { id: mathematics.id } });
      expect(stillThere.deletedAt).toBeNull();
    });

    it("soft-deletes a subject with no assignments", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/subjects")
        .set(auth(sunriseAdminToken))
        .send(subjectPayload());
      createdSubjectIds.push(created.body.id);

      const response = await request(app.getHttpServer())
        .delete(`/api/v1/subjects/${created.body.id}`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);

      const deleted = await prisma.subject.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(deleted.deletedAt).not.toBeNull();

      const list = await request(app.getHttpServer())
        .get("/api/v1/subjects")
        .query({ pageSize: 100 })
        .set(auth(sunriseAdminToken));
      expect(list.body.items.some((s: { id: string }) => s.id === created.body.id)).toBe(false);
    });
  });

  describe("cross-tenant isolation", () => {
    it("404s (not 403) when hillcrest's admin reaches for a sunrise subject by real ID", async () => {
      const mathematics = await prisma.subject.findFirstOrThrow({
        where: { schoolId: sunriseSchoolId, name: "Mathematics" },
      });
      const patch = await request(app.getHttpServer())
        .patch(`/api/v1/subjects/${mathematics.id}`)
        .set(auth(hillcrestAdminToken))
        .send({ name: "hijacked" });
      expect(patch.status).toBe(404);

      const del = await request(app.getHttpServer())
        .delete(`/api/v1/subjects/${mathematics.id}`)
        .set(auth(hillcrestAdminToken));
      expect(del.status).toBe(404);
    });
  });
});
