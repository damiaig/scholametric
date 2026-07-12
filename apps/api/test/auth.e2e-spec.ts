import { INestApplication } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { JwtService } from "@nestjs/jwt";
import request from "supertest";
import { createTestApp } from "./utils/create-test-app";
import { PrismaService } from "../src/prisma/prisma.service";

// Matches prisma/seed.ts SEED_PASSWORD — seeded demo credentials, not a real secret.
const SEED_PASSWORD = "Passw0rd!";
const SUNRISE_ADMIN_EMAIL = "admin@sunrise.test";
const SUNRISE_SLUG = "sunrise";

describe("Auth (e2e)", () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let adminUserId: string;

  beforeAll(async () => {
    app = await createTestApp();
    prisma = app.get(PrismaService);
    const admin = await prisma.user.findFirstOrThrow({ where: { email: SUNRISE_ADMIN_EMAIL } });
    adminUserId = admin.id;
  });

  afterAll(async () => {
    // Keep the local dev DB tidy across repeated test runs.
    await prisma.refreshToken.deleteMany({ where: { userId: adminUserId } });
    await app.close();
  });

  const login = (overrides: Partial<{ email: string; password: string; schoolSlug: string }> = {}) =>
    request(app.getHttpServer())
      .post("/api/v1/auth/login")
      .send({
        email: SUNRISE_ADMIN_EMAIL,
        password: SEED_PASSWORD,
        schoolSlug: SUNRISE_SLUG,
        ...overrides,
      });

  describe("POST /auth/login", () => {
    it("logs in with valid credentials", async () => {
      const response = await login();

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        accessToken: expect.any(String),
        refreshToken: expect.any(String),
        user: expect.objectContaining({
          email: SUNRISE_ADMIN_EMAIL,
          role: "SCHOOL_ADMIN",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      });
    });

    it("returns an identical generic error for wrong password, wrong school, and unknown email", async () => {
      const [wrongPassword, wrongSchool, unknownEmail] = await Promise.all([
        login({ password: "not-the-password" }),
        login({ schoolSlug: "not-a-real-school" }),
        login({ email: "nobody@sunrise.test" }),
      ]);

      for (const response of [wrongPassword, wrongSchool, unknownEmail]) {
        expect(response.status).toBe(401);
      }

      const shapes = [wrongPassword, wrongSchool, unknownEmail].map((r) => ({
        statusCode: r.body.statusCode,
        message: r.body.message,
        error: r.body.error,
      }));
      expect(shapes[0]).toEqual(shapes[1]);
      expect(shapes[1]).toEqual(shapes[2]);
    });
  });

  describe("GET /auth/me", () => {
    it("returns the profile for a valid access token", async () => {
      const { body } = await login();

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${body.accessToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual(
        expect.objectContaining({
          email: SUNRISE_ADMIN_EMAIL,
          role: "SCHOOL_ADMIN",
          school: expect.objectContaining({ slug: SUNRISE_SLUG }),
        }),
      );
    });

    it("rejects an expired access token", async () => {
      const jwtService = app.get(JwtService);
      const configService = app.get(ConfigService);
      const expiredToken = await jwtService.signAsync(
        { sub: adminUserId, schoolId: "irrelevant", role: "SCHOOL_ADMIN" },
        { secret: configService.getOrThrow<string>("JWT_ACCESS_SECRET"), expiresIn: "-10s" },
      );

      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", `Bearer ${expiredToken}`);

      expect(response.status).toBe(401);
    });

    it("rejects a garbage token", async () => {
      const response = await request(app.getHttpServer())
        .get("/api/v1/auth/me")
        .set("Authorization", "Bearer not-a-real-token");

      expect(response.status).toBe(401);
    });
  });

  it("401s on a protected endpoint with no token at all (guard is truly global)", async () => {
    const response = await request(app.getHttpServer()).get("/api/v1/auth/me");
    expect(response.status).toBe(401);
  });

  describe("refresh rotation and reuse detection", () => {
    it("rotates on use, kills the old token, and revokes the whole family on reuse", async () => {
      const loginResponse = await login();
      const refreshToken1 = loginResponse.body.refreshToken as string;

      const firstRefresh = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: refreshToken1 });
      expect(firstRefresh.status).toBe(200);
      const refreshToken2 = firstRefresh.body.refreshToken as string;
      expect(refreshToken2).not.toBe(refreshToken1);

      // refreshToken1 is dead after use.
      const reuseAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: refreshToken1 });
      expect(reuseAttempt.status).toBe(401);

      // Reuse revoked the whole family — refreshToken2 (the newest) is dead too.
      const secondTokenAttempt = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken: refreshToken2 });
      expect(secondTokenAttempt.status).toBe(401);
    });
  });

  describe("POST /auth/logout", () => {
    it("revokes the presented refresh token; refresh after logout fails", async () => {
      const loginResponse = await login();
      const { accessToken, refreshToken } = loginResponse.body;

      const logoutResponse = await request(app.getHttpServer())
        .post("/api/v1/auth/logout")
        .set("Authorization", `Bearer ${accessToken}`)
        .send({ refreshToken });
      expect(logoutResponse.status).toBe(200);

      const refreshAfterLogout = await request(app.getHttpServer())
        .post("/api/v1/auth/refresh")
        .send({ refreshToken });
      expect(refreshAfterLogout.status).toBe(401);
    });
  });
});
