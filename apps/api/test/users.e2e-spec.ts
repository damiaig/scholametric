import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Users (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseAdminUserId: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  const createdUserIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunriseAdmin = await prisma.user.findFirstOrThrow({ where: { email: "admin@sunrise.test" } });
    sunriseAdminUserId = sunriseAdmin.id;
  });

  afterAll(async () => {
    const ids = createdUserIds.filter((id): id is string => Boolean(id));
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe("GET /users", () => {
    it("lists staff for the caller's school", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseAdminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.items.some((u: { email: string }) => u.email === "admin@sunrise.test")).toBe(true);
      expect(response.body.items.every((u: Record<string, unknown>) => !("passwordHash" in u))).toBe(true);
    });

    it("filters by role", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/users")
        .query({ role: "TEACHER" })
        .set("Authorization", `Bearer ${sunriseAdminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.items.every((u: { role: string }) => u.role === "TEACHER")).toBe(true);
    });

    it("TEACHER is forbidden from listing staff", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseTeacherToken}`);
      expect(response.status).toBe(403);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/users");
      expect(response.status).toBe(401);
    });

    it("a second school's admin never sees the first school's staff", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/users")
        .set("Authorization", `Bearer ${hillcrestAdminToken}`);
      expect(response.status).toBe(200);
      expect(response.body.items.some((u: { email: string }) => u.email === "admin@sunrise.test")).toBe(false);
    });
  });

  describe("POST /users", () => {
    it("creates a TEACHER and returns a one-time temporary password", async () => {
      const email = `new.teacher.${randomUUID()}@sunrise.test`;
      const response = await request(app.getHttpServer())
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ email, firstName: "New", lastName: "Teacher", role: "TEACHER" });

      expect(response.status).toBe(201);
      expect(response.body.user.email).toBe(email);
      expect(response.body.user.role).toBe("TEACHER");
      expect(typeof response.body.temporaryPassword).toBe("string");
      expect(response.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);
      createdUserIds.push(response.body.user.id);
    });

    it("rejects a duplicate email with 409", async () => {
      const email = `dup.${randomUUID()}@sunrise.test`;
      const first = await request(app.getHttpServer())
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ email, firstName: "A", lastName: "B", role: "TEACHER" });
      createdUserIds.push(first.body.user.id);

      const response = await request(app.getHttpServer())
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ email, firstName: "C", lastName: "D", role: "TEACHER" });
      expect(response.status).toBe(409);
    });

    it("rejects an invalid role with 400", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ email: `bad.${randomUUID()}@sunrise.test`, firstName: "A", lastName: "B", role: "SUPER_ADMIN" });
      expect(response.status).toBe(400);
    });

    it("TEACHER cannot create users", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseTeacherToken}`)
        .send({ email: `x.${randomUUID()}@sunrise.test`, firstName: "A", lastName: "B", role: "TEACHER" });
      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /users/:id", () => {
    it("updates name and status", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ email: `patch.${randomUUID()}@sunrise.test`, firstName: "Old", lastName: "Name", role: "TEACHER" });
      createdUserIds.push(created.body.user.id);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${created.body.user.id}`)
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ firstName: "New", status: "DISABLED" });

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe("New");
      expect(response.body.status).toBe("DISABLED");
    });

    it("blocks changing your own role", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${sunriseAdminUserId}`)
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ role: "TEACHER" });
      expect(response.status).toBe(400);
    });

    it("a cross-tenant target returns 404, not 403", async () => {
      const hillcrestUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@hillcrest.test" } });
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/users/${hillcrestUser.id}`)
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ firstName: "Hacked" });
      expect(response.status).toBe(404);
    });
  });

  describe("POST /users/:id/reset-password", () => {
    it("returns a new temporary password once", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/users")
        .set("Authorization", `Bearer ${sunriseAdminToken}`)
        .send({ email: `reset.${randomUUID()}@sunrise.test`, firstName: "A", lastName: "B", role: "TEACHER" });
      createdUserIds.push(created.body.user.id);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${created.body.user.id}/reset-password`)
        .set("Authorization", `Bearer ${sunriseAdminToken}`);

      expect(response.status).toBe(200);
      expect(typeof response.body.temporaryPassword).toBe("string");
      expect(response.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    });

    it("a cross-tenant target returns 404", async () => {
      const hillcrestUser = await prisma.user.findFirstOrThrow({ where: { email: "admin@hillcrest.test" } });
      const response = await request(app.getHttpServer())
        .post(`/api/v1/users/${hillcrestUser.id}/reset-password`)
        .set("Authorization", `Bearer ${sunriseAdminToken}`);
      expect(response.status).toBe(404);
    });
  });
});
