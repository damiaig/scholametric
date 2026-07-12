import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Schools CRUD (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let superAdminToken: string;
  let sunriseAdminToken: string;
  let sunriseTeacherToken: string;
  const createdSchoolIds: string[] = [];

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    superAdminToken = await loginAs(app, "super@scholametric.test", "platform");
    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
  });

  afterAll(async () => {
    // FK from users.school_id is ON DELETE RESTRICT — delete admins before schools.
    await prisma.user.deleteMany({ where: { schoolId: { in: createdSchoolIds } } });
    await prisma.school.deleteMany({ where: { id: { in: createdSchoolIds } } });
    await app.close();
  });

  const createSchoolPayload = () => {
    const suffix = randomUUID().slice(0, 8);
    return {
      name: `Riverside Academy ${suffix}`,
      slug: `riverside-${suffix}`,
      type: "SECONDARY",
      admin: {
        email: `admin-${suffix}@riverside.test`,
        firstName: "Test",
        lastName: "Admin",
        password: "Passw0rd!",
      },
    };
  };

  describe("POST /schools", () => {
    it("creates the school and its first SCHOOL_ADMIN in one transaction", async () => {
      const payload = createSchoolPayload();

      const response = await request(app.getHttpServer())
        .post("/api/v1/schools")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body).toEqual(
        expect.objectContaining({
          name: payload.name,
          slug: payload.slug,
          admin: expect.objectContaining({ email: payload.admin.email, role: "SCHOOL_ADMIN" }),
        }),
      );
      createdSchoolIds.push(response.body.id);

      const school = await prisma.school.findUnique({ where: { slug: payload.slug } });
      expect(school).not.toBeNull();
      const admin = await prisma.user.findFirst({ where: { schoolId: school!.id, email: payload.admin.email } });
      expect(admin).not.toBeNull();
      expect(admin!.role).toBe("SCHOOL_ADMIN");
    });

    it("rolls back the whole transaction on a duplicate slug — no orphan admin user", async () => {
      const payload = createSchoolPayload();
      payload.slug = "sunrise"; // already seeded

      const response = await request(app.getHttpServer())
        .post("/api/v1/schools")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send(payload);

      expect(response.status).toBe(409);

      const orphanAdmin = await prisma.user.findFirst({ where: { email: payload.admin.email } });
      expect(orphanAdmin).toBeNull();
      const sunriseCount = await prisma.school.count({ where: { slug: "sunrise" } });
      expect(sunriseCount).toBe(1);
    });
  });

  describe("RBAC", () => {
    it("403s SCHOOL_ADMIN and TEACHER on every /schools mutation", async () => {
      const payload = createSchoolPayload();

      for (const token of [sunriseAdminToken, sunriseTeacherToken]) {
        const createResponse = await request(app.getHttpServer())
          .post("/api/v1/schools")
          .set("Authorization", `Bearer ${token}`)
          .send(payload);
        expect(createResponse.status).toBe(403);

        const listResponse = await request(app.getHttpServer())
          .get("/api/v1/schools")
          .set("Authorization", `Bearer ${token}`);
        expect(listResponse.status).toBe(403);
      }
    });
  });

  it("401s an unauthenticated request", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/schools");
    expect(response.status).toBe(401);
  });

  describe("GET/PATCH /schools/:id", () => {
    it("lists and updates a school as SUPER_ADMIN", async () => {
      const payload = createSchoolPayload();
      const createResponse = await request(app.getHttpServer())
        .post("/api/v1/schools")
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send(payload);
      createdSchoolIds.push(createResponse.body.id);
      const id = createResponse.body.id;

      const listResponse = await request(app.getHttpServer())
        .get("/api/v1/schools?page=1&pageSize=100")
        .set("Authorization", `Bearer ${superAdminToken}`);
      expect(listResponse.status).toBe(200);
      expect(listResponse.body).toEqual(
        expect.objectContaining({ total: expect.any(Number), page: 1, pageSize: 100 }),
      );
      expect(listResponse.body.items).toEqual(expect.arrayContaining([expect.objectContaining({ id })]));

      const updateResponse = await request(app.getHttpServer())
        .patch(`/api/v1/schools/${id}`)
        .set("Authorization", `Bearer ${superAdminToken}`)
        .send({ address: "1 Riverside Way" });
      expect(updateResponse.status).toBe(200);
      expect(updateResponse.body.address).toBe("1 Riverside Way");
      expect(updateResponse.body.slug).toBe(payload.slug);
    });
  });
});
