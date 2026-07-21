import { randomUUID } from "node:crypto";
import { INestApplication } from "@nestjs/common";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { loginAs } from "./utils/login";
import { PrismaService } from "../src/prisma/prisma.service";

describe("Personnel (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let sunriseAdminToken: string;
  let sunriseProprietorToken: string;
  let sunriseTeacherToken: string;
  let hillcrestAdminToken: string;
  let sunriseAdminUserId: string;
  let sunriseSchoolId: string;
  const createdUserIds: string[] = [];

  const auth = (token: string) => ({ Authorization: `Bearer ${token}` });

  function personnelPayload(overrides: Partial<Record<string, unknown>> = {}) {
    return {
      email: `staff.${randomUUID()}@sunrise.test`,
      firstName: "Test",
      lastName: "Staff",
      role: "TEACHER",
      jobTitle: "TEACHER",
      password: "Passw0rd!",
      ...overrides,
    };
  }

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);

    sunriseAdminToken = await loginAs(app, "admin@sunrise.test", "sunrise");
    sunriseProprietorToken = await loginAs(app, "proprietor@sunrise.test", "sunrise");
    sunriseTeacherToken = await loginAs(app, "teacher@sunrise.test", "sunrise");
    hillcrestAdminToken = await loginAs(app, "admin@hillcrest.test", "hillcrest");

    const sunriseAdmin = await prisma.user.findFirstOrThrow({ where: { email: "admin@sunrise.test" } });
    sunriseAdminUserId = sunriseAdmin.id;
    sunriseSchoolId = sunriseAdmin.schoolId;
  }, 20000);

  afterAll(async () => {
    if (!prisma) {
      await app?.close();
      return;
    }
    const ids = createdUserIds.filter((id): id is string => Boolean(id));
    await prisma.auditLog.deleteMany({ where: { entityId: { in: ids } } });
    await prisma.staffProfile.deleteMany({ where: { userId: { in: ids } } });
    await prisma.refreshToken.deleteMany({ where: { userId: { in: ids } } });
    await prisma.user.deleteMany({ where: { id: { in: ids } } });
    await app.close();
  });

  describe("GET /personnel", () => {
    it("lists staff for the caller's school, joined with staff profile fields", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/personnel")
        .query({ pageSize: 100 })
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      const bola = response.body.items.find((p: { email: string }) => p.email === "teacher@sunrise.test");
      expect(bola).toBeDefined();
      expect(bola.staffNumber).toMatch(/^SUN\/STF\/\d{4}$/);
      expect(bola.jobTitle).toBe("TEACHER");
      expect(bola.passwordHash).toBeUndefined();
    });

    it("filters by role and jobTitle", async () => {
      const byRole = await request(app.getHttpServer())
        .get("/api/v1/personnel")
        .query({ role: "PROPRIETOR" })
        .set(auth(sunriseAdminToken));
      expect(byRole.status).toBe(200);
      expect(byRole.body.items).toHaveLength(1);
      expect(byRole.body.items[0].jobTitle).toBe("DIRECTOR_PROPRIETOR");

      const byJobTitle = await request(app.getHttpServer())
        .get("/api/v1/personnel")
        .query({ jobTitle: "PRINCIPAL" })
        .set(auth(sunriseAdminToken));
      expect(byJobTitle.status).toBe(200);
      expect(byJobTitle.body.items.some((p: { email: string }) => p.email === "admin@sunrise.test")).toBe(true);
    });

    it("TEACHER is forbidden (no TEACHER row for personnel management)", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/personnel").set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });

    it("PROPRIETOR succeeds where SCHOOL_ADMIN does", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/personnel")
        .set(auth(sunriseProprietorToken));
      expect(response.status).toBe(200);
    });

    it("rejects unauthenticated requests", async () => {
      const response = await request(app.getHttpServer()).get("/api/v1/personnel");
      expect(response.status).toBe(401);
    });
  });

  describe("POST /personnel", () => {
    it("creates user + staff_profile in one transaction, with a caller-supplied password and a generated staff number", async () => {
      const payload = personnelPayload();
      const response = await request(app.getHttpServer())
        .post("/api/v1/personnel")
        .set(auth(sunriseAdminToken))
        .send(payload);

      expect(response.status).toBe(201);
      expect(response.body.email).toBe(payload.email);
      expect(response.body.staffNumber).toMatch(/^SUN\/STF\/\d{4}$/);
      expect(response.body.temporaryPassword).toBeUndefined();
      createdUserIds.push(response.body.id);

      // The password is exactly what the caller supplied — confirm by logging in with it.
      const login = await request(app.getHttpServer())
        .post("/api/v1/auth/login")
        .send({ email: payload.email, password: payload.password, schoolSlug: "sunrise" });
      expect(login.status).toBe(200);

      const staffProfile = await prisma.staffProfile.findUnique({ where: { userId: response.body.id } });
      expect(staffProfile).not.toBeNull();
    });

    it("continues the staff number sequence and never collides under concurrent creates", async () => {
      const [a, b] = await Promise.all([
        request(app.getHttpServer()).post("/api/v1/personnel").set(auth(sunriseAdminToken)).send(personnelPayload()),
        request(app.getHttpServer()).post("/api/v1/personnel").set(auth(sunriseAdminToken)).send(personnelPayload()),
      ]);
      expect(a.status).toBe(201);
      expect(b.status).toBe(201);
      createdUserIds.push(a.body.id, b.body.id);
      expect(a.body.staffNumber).not.toBe(b.body.staffNumber);
    });

    it("leaves no orphan user or staff_profile when creation fails (duplicate email)", async () => {
      const payload = personnelPayload();
      const first = await request(app.getHttpServer())
        .post("/api/v1/personnel")
        .set(auth(sunriseAdminToken))
        .send(payload);
      expect(first.status).toBe(201);
      createdUserIds.push(first.body.id);

      const duplicate = await request(app.getHttpServer())
        .post("/api/v1/personnel")
        .set(auth(sunriseAdminToken))
        .send(personnelPayload({ email: payload.email, firstName: "Different" }));
      expect(duplicate.status).toBe(409);

      const usersWithEmail = await prisma.user.count({ where: { schoolId: sunriseSchoolId, email: payload.email } });
      expect(usersWithEmail).toBe(1);
      const profilesForThatUser = await prisma.staffProfile.count({ where: { userId: first.body.id } });
      expect(profilesForThatUser).toBe(1);
    });

    it("rejects a role outside PROPRIETOR/SCHOOL_ADMIN/TEACHER", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/personnel")
        .set(auth(sunriseAdminToken))
        .send(personnelPayload({ role: "PARENT" }));
      expect(response.status).toBe(400);
    });

    it("TEACHER cannot create personnel", async () => {
      const response = await request(app.getHttpServer())
        .post("/api/v1/personnel")
        .set(auth(sunriseTeacherToken))
        .send(personnelPayload());
      expect(response.status).toBe(403);
    });
  });

  describe("PATCH /personnel/:userId", () => {
    it("updates name/jobTitle/phone/qualification/status", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/personnel")
        .set(auth(sunriseAdminToken))
        .send(personnelPayload());
      createdUserIds.push(created.body.id);

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/personnel/${created.body.id}`)
        .set(auth(sunriseAdminToken))
        .send({ firstName: "Updated", jobTitle: "VICE_PRINCIPAL", phone: "+2348011112222", status: "DISABLED" });

      expect(response.status).toBe(200);
      expect(response.body.firstName).toBe("Updated");
      expect(response.body.jobTitle).toBe("VICE_PRINCIPAL");
      expect(response.body.phone).toBe("+2348011112222");
      expect(response.body.status).toBe("DISABLED");
    });

    it("blocks changing your own role", async () => {
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/personnel/${sunriseAdminUserId}`)
        .set(auth(sunriseAdminToken))
        .send({ role: "TEACHER" });
      expect(response.status).toBe(400);
    });

    it("blocks changing the last proprietor/school admin of a school to teacher", async () => {
      const hillcrestAdmin = await prisma.user.findFirstOrThrow({ where: { email: "admin@hillcrest.test" } });
      const otherAdminsCount = await prisma.user.count({
        where: {
          schoolId: hillcrestAdmin.schoolId,
          role: { in: ["PROPRIETOR", "SCHOOL_ADMIN"] },
          id: { not: hillcrestAdmin.id },
          deletedAt: null,
        },
      });
      expect(otherAdminsCount).toBe(0); // sanity: Hillcrest seeds exactly one admin

      const response = await request(app.getHttpServer())
        .patch(`/api/v1/personnel/${hillcrestAdmin.id}`)
        .set(auth(hillcrestAdminToken))
        .send({ role: "TEACHER" });
      expect(response.status).toBe(400);

      const stillAdmin = await prisma.user.findUniqueOrThrow({ where: { id: hillcrestAdmin.id } });
      expect(stillAdmin.role).toBe("SCHOOL_ADMIN");
    });

    it("a cross-tenant target returns 404, not 403", async () => {
      const sunriseTeacher = await prisma.user.findFirstOrThrow({ where: { email: "teacher@sunrise.test" } });
      const response = await request(app.getHttpServer())
        .patch(`/api/v1/personnel/${sunriseTeacher.id}`)
        .set(auth(hillcrestAdminToken))
        .send({ firstName: "Hacked" });
      expect(response.status).toBe(404);
    });
  });

  describe("POST /personnel/:userId/reset-password", () => {
    it("returns a new temporary password once", async () => {
      const created = await request(app.getHttpServer())
        .post("/api/v1/personnel")
        .set(auth(sunriseAdminToken))
        .send(personnelPayload());
      createdUserIds.push(created.body.id);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/personnel/${created.body.id}/reset-password`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(typeof response.body.temporaryPassword).toBe("string");
      expect(response.body.temporaryPassword.length).toBeGreaterThanOrEqual(8);
    });

    it("TEACHER cannot reset anyone's password via personnel", async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/v1/personnel/${sunriseAdminUserId}/reset-password`)
        .set(auth(sunriseTeacherToken));
      expect(response.status).toBe(403);
    });
  });

  describe("POST /personnel/:userId/reset-password — user with no staff profile", () => {
    it("still works for a user with no staff profile (the deprecated /users/:id/reset-password alias it used to be reachable through was removed in v0.3)", async () => {
      // A user created before staff_profiles existed (or via any path that
      // skips it) must still be able to have their password reset here.
      const bareUser = await prisma.user.create({
        data: {
          schoolId: sunriseSchoolId,
          email: `bare.${randomUUID()}@sunrise.test`,
          passwordHash: "x",
          firstName: "Bare",
          lastName: "User",
          role: "TEACHER",
        },
      });
      createdUserIds.push(bareUser.id);

      const response = await request(app.getHttpServer())
        .post(`/api/v1/personnel/${bareUser.id}/reset-password`)
        .set(auth(sunriseAdminToken));
      expect(response.status).toBe(200);
      expect(typeof response.body.temporaryPassword).toBe("string");
    });
  });
});
